import { dbPool } from "./pool.js";
import { databaseName, databaseUser } from "../config.js";
import { readMessageFile, writeMessageFile } from "../messaging-files.js";
import { createHash, randomBytes } from "node:crypto";
import { toSlug, uniqueSlug } from "../../shared/slugs.js";
export { dbPool };

const memoryAuthUsers = new Map();
const memoryAuthSessions = new Map();
const memoryMessagingConversations = new Map();
const memoryMessagingMessages = new Map();
const memoryMessagingFiles = new Map();
let nextMessagingId = 1;
const memoryTelegramLinks = new Map();
const memoryTelegramCodes = new Map();

export async function initializeDatabase({ readJson, dataFile, settingsFile, incomesFile, cashClosingsFile, monthlyCashClosingsFile, limitsFile, defaultSettings }) {
  if (!dbPool) return;
  if (!databaseUser || !databaseName) throw new Error("Configuração MySQL incompleta.");

  await dbPool.query(`CREATE TABLE IF NOT EXISTS transactions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, client_id VARCHAR(36) NULL UNIQUE, description VARCHAR(60) NOT NULL, amount DECIMAL(12, 2) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'expense', expense_type VARCHAR(120) NULL, taker VARCHAR(120) NULL,
    location VARCHAR(120) NULL, creditor VARCHAR(120) NULL, transaction_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [[idDefinition]] = await dbPool.query("SELECT DATA_TYPE AS type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'id'");
  if (idDefinition?.type !== "int") {
    await dbPool.query("ALTER TABLE transactions ADD COLUMN client_id VARCHAR(36) NULL UNIQUE");
    await dbPool.query("UPDATE transactions SET client_id = id WHERE client_id IS NULL");
    await dbPool.query("ALTER TABLE transactions DROP PRIMARY KEY, DROP COLUMN id, ADD COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST");
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS app_settings (
    id TINYINT UNSIGNED PRIMARY KEY, settings JSON NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  for (const [column, definition] of Object.entries({ currency: "CHAR(3) NOT NULL DEFAULT 'BRL'", schema_version: "INT UNSIGNED NOT NULL DEFAULT 1" })) {
    const [[found]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_settings' AND column_name = ?", [column]);
    if (!found.total) await dbPool.query(`ALTER TABLE app_settings ADD COLUMN ${column} ${definition}`);
  }
  const [[settingsColumn]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_settings' AND column_name = 'settings'");
  if (settingsColumn.total) {
    await dbPool.query(`UPDATE app_settings SET currency = COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(settings, '$.currency')), ''), 'BRL'), schema_version = COALESCE(JSON_EXTRACT(settings, '$.schemaVersion'), 1)`);
    await dbPool.query("ALTER TABLE app_settings DROP COLUMN settings");
  }
  for (const table of ["expense_types", "takers", "locations", "creditors", "payment_methods"]) {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS ${table} (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, slug VARCHAR(140) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS income_sources (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, slug VARCHAR(140) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  for (const table of ["expense_types", "takers", "locations", "creditors", "payment_methods", "income_sources"]) {
    const [[slugColumn]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'slug'", [table]);
    if (!slugColumn.total) await dbPool.query(`ALTER TABLE ${table} ADD COLUMN slug VARCHAR(140) NULL`);
    const [catalogRows] = await dbPool.query(`SELECT id, name, slug FROM ${table} ORDER BY id`);
    const used = new Set();
    for (const row of catalogRows) {
      const slug = row.slug || uniqueSlug(row.name, used);
      used.add(slug);
      if (row.slug !== slug) await dbPool.execute(`UPDATE ${table} SET slug = ? WHERE id = ?`, [slug, row.id]);
    }
    const [[slugIndex]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?", [table, `uq_${table}_slug`]);
    if (!slugIndex.total) await dbPool.query(`ALTER TABLE ${table} ADD UNIQUE KEY uq_${table}_slug (slug)`);
  }
  for (const [table, columns] of Object.entries({
    expense_types: { is_active: "TINYINT(1) NOT NULL DEFAULT 1" },
    takers: { display_order: "INT NOT NULL DEFAULT 0", is_active: "TINYINT(1) NOT NULL DEFAULT 1" },
    locations: { is_active: "TINYINT(1) NOT NULL DEFAULT 1" },
    creditors: { display_order: "INT NOT NULL DEFAULT 0", is_active: "TINYINT(1) NOT NULL DEFAULT 1" },
    payment_methods: { display_order: "INT NOT NULL DEFAULT 0", is_active: "TINYINT(1) NOT NULL DEFAULT 1" },
    income_sources: { display_order: "INT NOT NULL DEFAULT 0", is_active: "TINYINT(1) NOT NULL DEFAULT 1" },
  })) {
    for (const [column, definition] of Object.entries(columns)) {
      const [[found]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?", [table, column]);
      if (!found.total) await dbPool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS cash_closings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, client_id VARCHAR(36) NULL UNIQUE, closing_date DATE NOT NULL,
    payment_method_id INT UNSIGNED NOT NULL, sale_count INT UNSIGNED NOT NULL DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cash_closings_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS limits (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, client_id VARCHAR(36) NULL UNIQUE,
    month TINYINT UNSIGNED NOT NULL, year SMALLINT UNSIGNED NOT NULL,
    target DECIMAL(12, 2) NOT NULL DEFAULT 0, budget DECIMAL(12, 2) NOT NULL DEFAULT 0,
    forecast DECIMAL(12, 2) NOT NULL DEFAULT 0, result DECIMAL(12, 2) NOT NULL DEFAULT 0,
    closed TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    owner ENUM('P', 'R') NOT NULL DEFAULT 'P',
    UNIQUE KEY uq_limits_period_owner (year, month, owner)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS monthly_cash_closings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, client_id VARCHAR(36) NULL UNIQUE,
    closing_month TINYINT UNSIGNED NOT NULL, closing_year SMALLINT UNSIGNED NOT NULL,
    payment_method_id INT UNSIGNED NOT NULL, sale_count INT UNSIGNED NOT NULL DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_monthly_cash_closing (closing_year, closing_month, payment_method_id),
    CONSTRAINT fk_monthly_cash_closings_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [[legacyBillingTable]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'faturamento'");
  if (legacyBillingTable.total) {
    await dbPool.query("RENAME TABLE faturamento TO billings");
    await dbPool.query("ALTER TABLE billings CHANGE COLUMN fechamento_mes closing_month TINYINT UNSIGNED NOT NULL, CHANGE COLUMN fechamento_ano closing_year SMALLINT UNSIGNED NOT NULL, CHANGE COLUMN ticket_medio average_ticket DECIMAL(12, 2) NOT NULL DEFAULT 0, CHANGE COLUMN update_at updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    await dbPool.query("ALTER TABLE billings DROP INDEX uq_faturamento_period, ADD UNIQUE KEY uq_billings_period (closing_year, closing_month)");
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS billings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, client_id VARCHAR(36) NULL UNIQUE,
    closing_month TINYINT UNSIGNED NOT NULL, closing_year SMALLINT UNSIGNED NOT NULL,
    sale_count INT UNSIGNED NOT NULL DEFAULT 0, average_ticket DECIMAL(12, 2) NOT NULL DEFAULT 0,
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_billings_period (closing_year, closing_month)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [[patamarColumn]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'limits' AND column_name = 'patamar'");
  if (!patamarColumn.total) await dbPool.query("ALTER TABLE limits ADD COLUMN patamar DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER forecast");
  const [[ownerColumn]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'limits' AND column_name = 'owner'");
  if (!ownerColumn.total) await dbPool.query("ALTER TABLE limits ADD COLUMN owner ENUM('P', 'R') NOT NULL DEFAULT 'P' AFTER year");
  const [[legacyLimitIndex]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'limits' AND index_name = 'uq_limits_period'");
  if (legacyLimitIndex.total) await dbPool.query("ALTER TABLE limits DROP INDEX uq_limits_period");
  const [[ownerLimitIndex]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'limits' AND index_name = 'uq_limits_period_owner'");
  if (!ownerLimitIndex.total) await dbPool.query("ALTER TABLE limits ADD UNIQUE KEY uq_limits_period_owner (year, month, owner)");
  const timestampTables = ["transactions", "app_settings", "expense_types", "takers", "locations", "creditors", "income_sources", "payment_methods", "cash_closings", "monthly_cash_closings", "limits"];
  for (const table of timestampTables) {
    for (const [column, definition] of Object.entries({ created_at: "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP", updated_at: "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP" })) {
      const [[found]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?", [table, column]);
      if (!found.total) await dbPool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  const transactions = await readJson(dataFile, []);
  const appSettings = await readJson(settingsFile, defaultSettings);
  const incomes = await readJson(incomesFile, []);
  const cashClosings = await readJson(cashClosingsFile, []);
  const monthlyCashClosings = await readJson(monthlyCashClosingsFile, []);
  const limits = await readJson(limitsFile, []);
  const [existingTransactions] = await dbPool.query("SELECT expense_type, taker, location, creditor FROM transactions");
  const catalogs = {
    expense_types: [...new Set([...(defaultSettings.expenseTypes || []), ...(appSettings.expenseTypes || []), ...transactions.map((item) => item.expenseType || item.category || "Outros"), ...existingTransactions.map((item) => item.expense_type)])],
    takers: [...new Set([...(defaultSettings.takers || []), ...(appSettings.takers || []), ...transactions.map((item) => item.taker || "Pessoal"), ...existingTransactions.map((item) => item.taker)])],
    locations: [...new Set([...(defaultSettings.locations || []), ...(appSettings.locations || []), ...transactions.map((item) => item.location || "Casa"), ...existingTransactions.map((item) => item.location)])],
    creditors: [...new Set([...(defaultSettings.creditors || []), ...(appSettings.creditors || []), ...transactions.map((item) => item.creditor || "Caixa"), ...existingTransactions.map((item) => item.creditor)])],
    payment_methods: [...new Set([...(defaultSettings.paymentMethods || []), ...(appSettings.paymentMethods || []), ...cashClosings.map((item) => item.paymentMethod)])],
    income_sources: [...new Set([...(defaultSettings.incomeSources || []), ...(appSettings.incomeSources || []), ...incomes.map((item) => item.source)])],
  };
  for (const [table, names] of Object.entries(catalogs)) {
    const [[tableCount]] = await dbPool.query(`SELECT COUNT(*) AS total FROM ${table}`);
    if (Number(tableCount.total) === 0) {
      for (const name of names.filter(Boolean)) await dbPool.execute(`INSERT IGNORE INTO ${table} (name) VALUES (?)`, [name]);
    } else {
      const referencedNames = table === "income_sources"
        ? incomes.map((item) => item.source)
        : table === "payment_methods"
          ? cashClosings.map((item) => item.paymentMethod)
          : transactions.map((item) => item[table === "expense_types" ? "expenseType" : table === "takers" ? "taker" : table === "locations" ? "location" : "creditor"]);
      for (const name of referencedNames.filter(Boolean)) await dbPool.execute(`INSERT IGNORE INTO ${table} (name) VALUES (?)`, [name]);
    }
    if (table === "locations") {
      for (const name of (defaultSettings.locations || []).filter(Boolean)) await dbPool.execute(`INSERT IGNORE INTO ${table} (name) VALUES (?)`, [name]);
    }
  }
  for (const [column, definition] of Object.entries({ expense_type_id: "INT UNSIGNED NULL", taker_id: "INT UNSIGNED NULL", location_id: "INT UNSIGNED NULL", creditor_id: "INT UNSIGNED NULL", income_source_id: "INT UNSIGNED NULL" })) {
    const [[found]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = ?", [column]);
    if (!found.total) await dbPool.query(`ALTER TABLE transactions ADD COLUMN ${column} ${definition}`);
  }
  for (const column of ["expense_type", "taker", "location", "creditor"]) {
    const [[found]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = ?", [column]);
    if (!found.total) await dbPool.query(`ALTER TABLE transactions ADD COLUMN ${column} VARCHAR(120) NULL`);
    else await dbPool.query(`ALTER TABLE transactions MODIFY COLUMN ${column} VARCHAR(120) NULL`);
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS buffet_observations (
    transaction_id INT UNSIGNED PRIMARY KEY, observation VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_buffet_observations_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS authorized_users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, email VARCHAR(190) NOT NULL UNIQUE,
    display_name VARCHAR(190) NOT NULL, given_name VARCHAR(120) NULL, family_name VARCHAR(120) NULL, picture_url VARCHAR(500) NULL, google_sub VARCHAR(190) NULL UNIQUE,
    authorized TINYINT(1) NOT NULL DEFAULT 0, role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    last_login_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [[pictureColumn]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'authorized_users' AND column_name = 'picture_url'");
  if (!pictureColumn.total) await dbPool.query("ALTER TABLE authorized_users ADD COLUMN picture_url VARCHAR(500) NULL AFTER display_name");
  for (const [column, definition] of [["given_name", "VARCHAR(120) NULL"], ["family_name", "VARCHAR(120) NULL"]]) {
    const [[found]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'authorized_users' AND column_name = ?", [column]);
    if (!found.total) await dbPool.query(`ALTER TABLE authorized_users ADD COLUMN ${column} ${definition} AFTER display_name`);
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL, last_activity_at DATETIME NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES authorized_users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [[activityColumn]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'auth_sessions' AND column_name = 'last_activity_at'");
  if (!activityColumn.total) await dbPool.query("ALTER TABLE auth_sessions ADD COLUMN last_activity_at DATETIME NULL AFTER expires_at");
  await dbPool.query("UPDATE auth_sessions SET last_activity_at = COALESCE(last_activity_at, created_at) WHERE last_activity_at IS NULL");
  await dbPool.query("ALTER TABLE auth_sessions MODIFY COLUMN last_activity_at DATETIME NOT NULL");
  await dbPool.query(`CREATE TABLE IF NOT EXISTS financial_insight_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    period CHAR(7) NOT NULL,
    scope ENUM('general', 'buffet') NOT NULL,
    indicators JSON NOT NULL,
    ai_result JSON NULL,
    prompt_version VARCHAR(40) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_financial_insight_history_user FOREIGN KEY (user_id) REFERENCES authorized_users(id) ON DELETE CASCADE,
    INDEX ix_financial_insight_history_user_created (user_id, created_at)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS messaging_conversations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    created_by INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_messaging_conversations_creator FOREIGN KEY (created_by) REFERENCES authorized_users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS messaging_conversation_members (
    conversation_id BIGINT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT fk_messaging_members_conversation FOREIGN KEY (conversation_id) REFERENCES messaging_conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_messaging_members_user FOREIGN KEY (user_id) REFERENCES authorized_users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS messaging_files (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    owner_id INT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(300) NOT NULL UNIQUE,
    mime_type VARCHAR(120) NOT NULL,
    byte_size INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_messaging_files_owner FOREIGN KEY (owner_id) REFERENCES authorized_users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS messaging_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT UNSIGNED NOT NULL,
    sender_id INT UNSIGNED NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_messaging_messages_conversation FOREIGN KEY (conversation_id) REFERENCES messaging_conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_messaging_messages_sender FOREIGN KEY (sender_id) REFERENCES authorized_users(id) ON DELETE CASCADE,
    INDEX ix_messaging_messages_conversation_created (conversation_id, created_at, id)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS messaging_message_files (
    message_id BIGINT UNSIGNED NOT NULL,
    file_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (message_id, file_id),
    CONSTRAINT fk_messaging_message_files_message FOREIGN KEY (message_id) REFERENCES messaging_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_messaging_message_files_file FOREIGN KEY (file_id) REFERENCES messaging_files(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS messaging_notification_outbox (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT UNSIGNED NOT NULL,
    channel ENUM('whatsapp') NOT NULL,
    status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,
    last_error VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_messaging_outbox_message_channel (message_id, channel),
    CONSTRAINT fk_messaging_outbox_message FOREIGN KEY (message_id) REFERENCES messaging_messages(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [[outboxEventColumn]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'messaging_notification_outbox' AND column_name = 'event_type'");
  if (!outboxEventColumn.total) await dbPool.query("ALTER TABLE messaging_notification_outbox ADD COLUMN event_type ENUM('new_message', 'new_file') NOT NULL DEFAULT 'new_message' AFTER message_id");
  const [[outboxUniqueKey]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'messaging_notification_outbox' AND index_name = 'uq_messaging_outbox_message_channel'");
  const [[outboxEventUniqueKey]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'messaging_notification_outbox' AND index_name = 'uq_messaging_outbox_message_channel_event'");
  if (outboxUniqueKey.total) {
    if (!outboxEventUniqueKey.total) {
      await dbPool.query("ALTER TABLE messaging_notification_outbox ADD UNIQUE KEY uq_messaging_outbox_message_channel_event (message_id, channel, event_type)");
    }
    await dbPool.query("ALTER TABLE messaging_notification_outbox DROP INDEX uq_messaging_outbox_message_channel");
  } else if (!outboxEventUniqueKey.total) {
    await dbPool.query("ALTER TABLE messaging_notification_outbox ADD UNIQUE KEY uq_messaging_outbox_message_channel_event (message_id, channel, event_type)");
  }
  const [[outboxTelegramChannel]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'messaging_notification_outbox' AND column_name = 'channel'");
  if (outboxTelegramChannel.total) await dbPool.query("ALTER TABLE messaging_notification_outbox MODIFY COLUMN channel ENUM('whatsapp', 'telegram') NOT NULL");
  await dbPool.query(`CREATE TABLE IF NOT EXISTS telegram_accounts (
    user_id INT UNSIGNED PRIMARY KEY,
    chat_id VARCHAR(80) NOT NULL UNIQUE,
    username VARCHAR(120) NULL,
    linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_telegram_accounts_user FOREIGN KEY (user_id) REFERENCES authorized_users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code_hash CHAR(64) PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_telegram_link_codes_user FOREIGN KEY (user_id) REFERENCES authorized_users(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query("UPDATE transactions t JOIN expense_types c ON c.name = t.expense_type SET t.expense_type_id = c.id WHERE t.expense_type_id IS NULL");
  await dbPool.query("UPDATE transactions t JOIN takers c ON c.name = t.taker SET t.taker_id = c.id WHERE t.taker_id IS NULL");
  await dbPool.query("UPDATE transactions t JOIN locations c ON c.name = t.location SET t.location_id = c.id WHERE t.location_id IS NULL");
  await dbPool.query("UPDATE transactions t JOIN creditors c ON c.name = t.creditor SET t.creditor_id = c.id WHERE t.creditor_id IS NULL");
  for (const [constraint, column, table] of [["fk_transactions_expense_type", "expense_type_id", "expense_types"], ["fk_transactions_taker", "taker_id", "takers"], ["fk_transactions_location", "location_id", "locations"], ["fk_transactions_creditor", "creditor_id", "creditors"], ["fk_transactions_income_source", "income_source_id", "income_sources"]]) {
    const [[found]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND constraint_name = ?", [constraint]);
    if (!found.total) await dbPool.query(`ALTER TABLE transactions ADD CONSTRAINT ${constraint} FOREIGN KEY (${column}) REFERENCES ${table}(id)`);
  }

  const [[legacyIncomeTable]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'incomes'");
  if (legacyIncomeTable.total) {
    await dbPool.query("INSERT INTO transactions (client_id, description, amount, type, income_source_id, transaction_date, created_at, updated_at) SELECT i.id, i.description, i.amount, 'income', i.source_id, i.income_date, i.created_at, i.updated_at FROM incomes i WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.client_id = i.id)");
    await dbPool.query("DROP TABLE incomes");
  }
  for (const item of incomes) await dbPool.execute("INSERT INTO transactions (client_id, description, amount, type, income_source_id, transaction_date) SELECT ?, ?, ?, 'income', (SELECT id FROM income_sources WHERE name = ?), ? WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE client_id = ?)", [item.id, item.description, item.amount, item.source || "Salário", item.date, item.id]);
  for (const item of cashClosings) {
    const [[existing]] = await dbPool.query("SELECT id FROM cash_closings WHERE client_id = ?", [item.id]);
    const [[paymentMethod]] = await dbPool.query("SELECT id FROM payment_methods WHERE name = ?", [item.paymentMethod]);
    if (!paymentMethod) continue;
    if (!existing) await dbPool.execute("INSERT INTO cash_closings (client_id, closing_date, payment_method_id, sale_count, total_amount) VALUES (?, ?, ?, ?, ?)", [item.id, item.date, paymentMethod.id, item.saleCount || 0, item.totalAmount || 0]);
  }
  for (const item of limits) {
    const clientId = item.clientId || item.id;
    await dbPool.execute("INSERT INTO limits (client_id, month, year, owner, target, budget, forecast, patamar, result, closed) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM limits WHERE client_id = ?)", [clientId, item.month, item.year, item.owner === "R" ? "R" : "P", item.target || 0, item.budget || 0, item.forecast || 0, item.patamar || 0, item.result || 0, item.closed ? 1 : 0, clientId]);
  }
  const [[transactionCount]] = await dbPool.query("SELECT COUNT(*) AS total FROM transactions");
  if (transactionCount.total === 0 && transactions.length) {
    const [rows] = await dbPool.query("SELECT id, name FROM expense_types");
    const [takers] = await dbPool.query("SELECT id, name FROM takers");
    const [locations] = await dbPool.query("SELECT id, name FROM locations");
    const [creditors] = await dbPool.query("SELECT id, name FROM creditors");
    const idFor = (items, name) => items.find((item) => item.name === name)?.id;
    for (const item of transactions) {
      const expenseType = item.expenseType || item.category || "Outros";
      const taker = item.taker || "Pessoal";
      const location = item.location || "Casa";
      const creditor = item.creditor || "Caixa";
      await dbPool.execute("INSERT INTO transactions (client_id, description, amount, type, expense_type, taker, location, creditor, expense_type_id, taker_id, location_id, creditor_id, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [item.id, item.description, item.amount, item.type || "expense", expenseType, taker, location, creditor, idFor(rows, expenseType), idFor(takers, taker), idFor(locations, location), idFor(creditors, creditor), item.date]);
    }
  }
  const [[paymentConstraint]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND constraint_name = 'fk_transactions_payment_method'");
  if (paymentConstraint.total) await dbPool.query("ALTER TABLE transactions DROP FOREIGN KEY fk_transactions_payment_method");
  const [[paymentColumn]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'payment_method_id'");
  if (paymentColumn.total) await dbPool.query("ALTER TABLE transactions DROP COLUMN payment_method_id");
  const [[paymentTextColumn]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'payment_method'");
  if (paymentTextColumn.total) await dbPool.query("ALTER TABLE transactions DROP COLUMN payment_method");
  await dbPool.query("INSERT INTO app_settings (id, currency, schema_version) VALUES (1, 'BRL', 10) ON DUPLICATE KEY UPDATE schema_version = 10");
  await refreshBillings();
}

export async function findAuthUser(email) {
  if (!dbPool) return memoryAuthUsers.get(String(email).toLowerCase()) || null;
  const [[row]] = await dbPool.query("SELECT id, email, display_name AS name, given_name AS givenName, family_name AS familyName, picture_url AS picture, google_sub AS googleSub, authorized, role, last_login_at AS lastLoginAt FROM authorized_users WHERE email = ?", [email]);
  return row ? { ...row, authorized: Boolean(row.authorized) } : null;
}

export async function saveAuthUser(user) {
  const email = String(user.email).toLowerCase();
  if (!dbPool) {
    const current = memoryAuthUsers.get(email) || { id: memoryAuthUsers.size + 1, email };
      const saved = { ...current, ...user, email, authorized: Boolean(user.authorized) };
    memoryAuthUsers.set(email, saved);
    return saved;
  }
  await dbPool.execute(`INSERT INTO authorized_users (email, display_name, given_name, family_name, picture_url, google_sub, authorized, role, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), given_name = VALUES(given_name), family_name = VALUES(family_name), picture_url = VALUES(picture_url), google_sub = VALUES(google_sub),
      authorized = VALUES(authorized), role = VALUES(role), last_login_at = CURRENT_TIMESTAMP`,
  [email, user.name || email, user.givenName || null, user.familyName || null, user.picture || null, user.googleSub || null, user.authorized ? 1 : 0, user.role === "admin" ? "admin" : "user"]);
  return findAuthUser(email);
}

export async function listAuthUsers() {
  if (!dbPool) {
    const onlineUserIds = new Set([...memoryAuthSessions.values()]
      .filter((session) => session.expiresAt && new Date(session.expiresAt) > new Date())
      .map((session) => session.userId));
    return [...memoryAuthUsers.values()].map((user) => ({ ...user, online: onlineUserIds.has(user.id) }));
  }
  const [rows] = await dbPool.query(`SELECT id, email, display_name AS name, given_name AS givenName, family_name AS familyName, picture_url AS picture,
    google_sub AS googleSub, authorized, role, last_login_at AS lastLoginAt, created_at AS createdAt,
    EXISTS (SELECT 1 FROM auth_sessions s WHERE s.user_id = authorized_users.id
      AND s.expires_at > CURRENT_TIMESTAMP
      AND s.last_activity_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE)
      AND authorized_users.authorized = 1) AS online
    FROM authorized_users ORDER BY email`);
  return rows.map((row) => ({ ...row, authorized: Boolean(row.authorized), online: Boolean(row.online) }));
}

export async function saveAuthSession({ tokenHash, userId, expiresAt, lastActivityAt = new Date() }) {
  if (!dbPool) {
    memoryAuthSessions.set(tokenHash, { tokenHash, userId, expiresAt, lastActivityAt });
    return;
  }
  await dbPool.execute("INSERT INTO auth_sessions (token_hash, user_id, expires_at, last_activity_at) VALUES (?, ?, ?, ?)", [tokenHash, userId, expiresAt, lastActivityAt]);
}

export async function findAuthSession(tokenHash) {
  if (!dbPool) return memoryAuthSessions.get(tokenHash) || null;
  const [[row]] = await dbPool.query("SELECT s.token_hash AS tokenHash, s.expires_at AS expiresAt, s.last_activity_at AS lastActivityAt, u.id, u.email, u.display_name AS name, u.given_name AS givenName, u.family_name AS familyName, u.picture_url AS picture, u.authorized, u.role FROM auth_sessions s JOIN authorized_users u ON u.id = s.user_id WHERE s.token_hash = ?", [tokenHash]);
  return row ? { ...row, authorized: Boolean(row.authorized) } : null;
}

export async function touchAuthSession(tokenHash, lastActivityAt = new Date()) {
  if (!dbPool) {
    const session = memoryAuthSessions.get(tokenHash);
    if (session) session.lastActivityAt = lastActivityAt;
    return;
  }
  await dbPool.execute("UPDATE auth_sessions SET last_activity_at = ? WHERE token_hash = ?", [lastActivityAt, tokenHash]);
}

export async function deleteAuthSession(tokenHash) {
  if (!dbPool) {
    memoryAuthSessions.delete(tokenHash);
    return;
  }
  await dbPool.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [tokenHash]);
}

export async function saveFinancialInsightHistory({ userId, period, scope, indicators, aiResult = null, promptVersion = null }) {
  if (!dbPool) throw new Error("MySQL indisponível. Histórico não gravado.");
  const [result] = await dbPool.execute(
    "INSERT INTO financial_insight_history (user_id, period, scope, indicators, ai_result, prompt_version) VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)",
    [userId, period, scope, JSON.stringify(indicators), aiResult ? JSON.stringify(aiResult) : null, promptVersion],
  );
  return { id: Number(result.insertId), period, scope, indicators, ai: aiResult, promptVersion, createdAt: new Date().toISOString() };
}

export async function readFinancialInsightHistory(userId, limit = 20) {
  if (!dbPool) return [];
  const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const [rows] = await dbPool.query(
    "SELECT id, period, scope, indicators, ai_result AS ai, prompt_version AS promptVersion, created_at AS createdAt FROM financial_insight_history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    [userId, boundedLimit],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    period: row.period,
    scope: row.scope,
    indicators: typeof row.indicators === "string" ? JSON.parse(row.indicators) : row.indicators,
    ai: typeof row.ai === "string" ? JSON.parse(row.ai) : row.ai,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt,
  }));
}

export async function listMessagingUsers(userId) {
  if (!dbPool) return [...memoryAuthUsers.values()]
    .filter((user) => user.authorized && user.id !== userId)
    .map(({ id, email, name, picture }) => ({ id, email, name, picture }));
  const [rows] = await dbPool.query(
    "SELECT id, email, display_name AS name, picture_url AS picture FROM authorized_users WHERE authorized = 1 AND id <> ? ORDER BY display_name, email",
    [userId],
  );
  return rows;
}

export async function saveMessagingConversation({ userId, participantId }) {
  if (!Number.isInteger(Number(participantId)) || Number(participantId) === Number(userId)) throw new Error("Destinatário inválido.");
  if (!dbPool) {
    const ids = [Number(userId), Number(participantId)].sort((a, b) => a - b);
    const participant = memoryAuthUsers.get([...memoryAuthUsers.keys()].find((email) => memoryAuthUsers.get(email)?.id === Number(participantId)));
    if (!participant?.authorized) throw new Error("Destinatário não autorizado.");
    const key = ids.join(":");
    const existing = [...memoryMessagingConversations.values()].find((conversation) => conversation.key === key);
    if (existing) return existing;
    const conversation = { id: nextMessagingId++, key, createdBy: Number(userId), createdAt: new Date().toISOString(), members: ids };
    memoryMessagingConversations.set(conversation.id, conversation);
    return conversation;
  }
  const [[participant]] = await dbPool.query("SELECT id FROM authorized_users WHERE id = ? AND authorized = 1", [participantId]);
  if (!participant) throw new Error("Destinatário não autorizado.");
  const [existing] = await dbPool.query(
    `SELECT c.id FROM messaging_conversations c
     JOIN messaging_conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
     JOIN messaging_conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
     WHERE (SELECT COUNT(*) FROM messaging_conversation_members mx WHERE mx.conversation_id = c.id) = 2
     LIMIT 1`,
    [userId, participantId],
  );
  if (existing[0]) return readMessagingConversations(userId).then((items) => items.find((item) => item.id === Number(existing[0].id)));
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute("INSERT INTO messaging_conversations (created_by) VALUES (?)", [userId]);
    await connection.execute("INSERT INTO messaging_conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)", [result.insertId, userId, result.insertId, participantId]);
    await connection.commit();
    return { id: Number(result.insertId), members: [Number(userId), Number(participantId)] };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function readMessagingConversations(userId) {
  if (!dbPool) return [...memoryMessagingConversations.values()]
    .filter((conversation) => conversation.members.includes(Number(userId)))
    .map((conversation) => {
      const participantId = [...conversation.members].find((id) => id !== Number(userId));
      const participant = [...memoryAuthUsers.values()].find((user) => user.id === participantId);
      return { id: conversation.id, participant: participant ? { id: participant.id, email: participant.email, name: participant.name, picture: participant.picture } : { id: participantId }, lastMessage: [...memoryMessagingMessages.values()].filter((message) => message.conversationId === conversation.id).sort((a, b) => b.id - a.id)[0] || null };
    });
  const [rows] = await dbPool.query(
    `SELECT c.id, u.id AS participant_id, u.email AS participant_email, u.display_name AS participant_name, u.picture_url AS participant_picture,
      lm.body AS last_body, lm.created_at AS last_created_at
     FROM messaging_conversations c
     JOIN messaging_conversation_members mine ON mine.conversation_id = c.id AND mine.user_id = ?
     JOIN messaging_conversation_members other ON other.conversation_id = c.id AND other.user_id <> ?
     JOIN authorized_users u ON u.id = other.user_id
     LEFT JOIN messaging_messages lm ON lm.id = (
       SELECT m2.id FROM messaging_messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1
     )
     ORDER BY COALESCE(lm.created_at, c.created_at) DESC, c.id DESC`,
    [userId, userId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    participant: { id: Number(row.participant_id), email: row.participant_email, name: row.participant_name, picture: row.participant_picture },
    lastMessage: row.last_body === null ? null : { body: row.last_body, createdAt: row.last_created_at },
  }));
}

async function assertConversationMember(userId, conversationId, connection = dbPool) {
  if (!dbPool) {
    const conversation = memoryMessagingConversations.get(Number(conversationId));
    if (!conversation || !conversation.members.includes(Number(userId))) throw new Error("Conversa não encontrada.");
    return conversation;
  }
  const [[member]] = await connection.query("SELECT conversation_id FROM messaging_conversation_members WHERE conversation_id = ? AND user_id = ?", [conversationId, userId]);
  if (!member) throw new Error("Conversa não encontrada.");
  return member;
}

export async function readMessagingMessages(userId, conversationId, limit = 50) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  if (!dbPool) {
    await assertConversationMember(userId, conversationId);
    return [...memoryMessagingMessages.values()].filter((message) => message.conversationId === Number(conversationId)).slice(-boundedLimit);
  }
  await assertConversationMember(userId, conversationId);
  const [rows] = await dbPool.query(
    `SELECT m.id, m.body, m.created_at AS createdAt, m.sender_id AS senderId, u.display_name AS senderName,
      COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id', f.id, 'name', f.original_name, 'mimeType', f.mime_type, 'size', f.byte_size)), JSON_ARRAY()) AS files
     FROM messaging_messages m
     JOIN authorized_users u ON u.id = m.sender_id
     LEFT JOIN messaging_message_files mf ON mf.message_id = m.id
     LEFT JOIN messaging_files f ON f.id = mf.file_id
     WHERE m.conversation_id = ?
     GROUP BY m.id, m.body, m.created_at, m.sender_id, u.display_name
     ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    [conversationId, boundedLimit],
  );
  return rows.reverse().map((row) => ({ ...row, id: Number(row.id), senderId: Number(row.senderId), files: typeof row.files === "string" ? JSON.parse(row.files).filter((file) => file.id !== null) : row.files }));
}

export async function saveMessageFile({ userId, originalName, mimeType, data }) {
  const file = await writeMessageFile(data, originalName);
  if (!dbPool) {
    const record = { id: nextMessagingId++, ownerId: Number(userId), originalName: String(originalName), storedName: file.storedName, mimeType: String(mimeType || "application/octet-stream"), byteSize: data.length, createdAt: new Date().toISOString() };
    memoryMessagingFiles.set(record.id, record);
    return { id: record.id, name: record.originalName, mimeType: record.mimeType, size: record.byteSize };
  }
  const [result] = await dbPool.execute(
    "INSERT INTO messaging_files (owner_id, original_name, stored_name, mime_type, byte_size) VALUES (?, ?, ?, ?, ?)",
    [userId, String(originalName), file.storedName, String(mimeType || "application/octet-stream"), data.length],
  );
  return { id: Number(result.insertId), name: String(originalName), mimeType: String(mimeType || "application/octet-stream"), size: data.length };
}

export async function readMessagingFile(userId, fileId) {
  let row;
  if (!dbPool) {
    row = memoryMessagingFiles.get(Number(fileId));
    if (!row || row.ownerId !== Number(userId)) throw new Error("Arquivo não encontrado.");
  } else {
    [[row]] = await dbPool.query("SELECT id, owner_id AS ownerId, original_name AS originalName, stored_name AS storedName, mime_type AS mimeType FROM messaging_files WHERE id = ?", [fileId]);
    if (!row) throw new Error("Arquivo não encontrado.");
    const [shared] = await dbPool.query(
      `SELECT 1 FROM messaging_message_files mf
       JOIN messaging_messages m ON m.id = mf.message_id
       JOIN messaging_conversation_members cm ON cm.conversation_id = m.conversation_id
       WHERE mf.file_id = ? AND cm.user_id = ? LIMIT 1`,
      [fileId, userId],
    );
    if (Number(row.ownerId) !== Number(userId) && !shared[0]) throw new Error("Arquivo não encontrado.");
  }
  return { ...row, data: await readMessageFile(row.storedName) };
}

export async function saveMessage({ userId, conversationId, body = "", fileIds = [] }) {
  const text = String(body || "").trim();
  const ids = [...new Set((fileIds || []).map(Number).filter(Number.isInteger))];
  if (!text && !ids.length) throw new Error("A mensagem precisa ter texto ou arquivo.");
  if (!dbPool) {
    await assertConversationMember(userId, conversationId);
    const ownedFiles = ids.map((id) => memoryMessagingFiles.get(id)).filter((file) => file?.ownerId === Number(userId));
    if (ownedFiles.length !== ids.length) throw new Error("Anexo inválido.");
    const message = { id: nextMessagingId++, conversationId: Number(conversationId), senderId: Number(userId), body: text, files: ownedFiles.map((file) => ({ id: file.id, name: file.originalName, mimeType: file.mimeType, size: file.byteSize })), createdAt: new Date().toISOString() };
    memoryMessagingMessages.set(message.id, message);
    return message;
  }
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    await assertConversationMember(userId, conversationId, connection);
    if (ids.length) {
      const [files] = await connection.query("SELECT id FROM messaging_files WHERE owner_id = ? AND id IN (?)", [userId, ids]);
      if (files.length !== ids.length) throw new Error("Anexo inválido.");
    }
    const [result] = await connection.execute("INSERT INTO messaging_messages (conversation_id, sender_id, body) VALUES (?, ?, ?)", [conversationId, userId, text]);
    if (ids.length) await connection.query("INSERT INTO messaging_message_files (message_id, file_id) VALUES ?", [ids.map((id) => [result.insertId, id])]);
    if (ids.length) await connection.execute("INSERT INTO messaging_notification_outbox (message_id, channel, event_type) VALUES (?, 'telegram', 'new_file')", [result.insertId]);
    if (text) await connection.execute("INSERT INTO messaging_notification_outbox (message_id, channel, event_type) VALUES (?, 'telegram', 'new_message')", [result.insertId]);
    await connection.commit();
    return { id: Number(result.insertId), conversationId: Number(conversationId), senderId: Number(userId), body: text, fileIds: ids, createdAt: new Date().toISOString() };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const telegramCodeHash = (code) => createHash("sha256").update(String(code)).digest("hex");

export async function createTelegramLinkCode(userId) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const codeHash = telegramCodeHash(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    if (!dbPool) {
      memoryTelegramCodes.set(codeHash, { userId: Number(userId), expiresAt });
      return { code, expiresAt: expiresAt.toISOString() };
    }
    await dbPool.execute("DELETE FROM telegram_link_codes WHERE user_id = ? OR expires_at <= CURRENT_TIMESTAMP", [userId]);
    await dbPool.execute("INSERT INTO telegram_link_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)", [codeHash, userId, expiresAt]);
    return { code, expiresAt: expiresAt.toISOString() };
  }

export async function consumeTelegramLink({ code, chatId, username = null }) {
    const hash = telegramCodeHash(String(code || "").trim().toUpperCase());
    if (!hash || !chatId) throw new Error("Código de vinculação inválido.");
    if (!dbPool) {
      const link = memoryTelegramCodes.get(hash);
      if (!link || new Date(link.expiresAt) <= new Date()) throw new Error("Código expirado ou inválido.");
      memoryTelegramCodes.delete(hash);
      memoryTelegramLinks.set(Number(link.userId), { userId: Number(link.userId), chatId: String(chatId), username });
      return { userId: Number(link.userId) };
    }
    const connection = await dbPool.getConnection();
    try {
      await connection.beginTransaction();
      const [[link]] = await connection.query("SELECT user_id AS userId FROM telegram_link_codes WHERE code_hash = ? AND expires_at > CURRENT_TIMESTAMP", [hash]);
      if (!link) throw new Error("Código expirado ou inválido.");
      await connection.execute("INSERT INTO telegram_accounts (user_id, chat_id, username) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE chat_id = VALUES(chat_id), username = VALUES(username), linked_at = CURRENT_TIMESTAMP", [link.userId, String(chatId), username]);
      await connection.execute("DELETE FROM telegram_link_codes WHERE code_hash = ?", [hash]);
      await connection.commit();
      return { userId: Number(link.userId) };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
  }
}

export async function readDatabase() {
  const [rows] = await dbPool.query("SELECT t.id, t.client_id AS clientId, t.description, bo.observation, t.amount, t.type, et.name AS expenseType, et.slug AS expenseTypeSlug, tk.name AS taker, tk.slug AS takerSlug, l.name AS location, l.slug AS locationSlug, c.name AS creditor, c.slug AS creditorSlug, COALESCE(s.name, CASE WHEN t.type = 'income' AND t.client_id LIKE 'cash-closing-income-%' THEN 'Vendas' END) AS source, COALESCE(s.slug, CASE WHEN t.type = 'income' AND t.client_id LIKE 'cash-closing-income-%' THEN 'vendas' END) AS sourceSlug, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date, t.created_at AS createdAt, t.updated_at AS updatedAt FROM transactions t LEFT JOIN buffet_observations bo ON bo.transaction_id = t.id LEFT JOIN expense_types et ON et.id = t.expense_type_id LEFT JOIN takers tk ON tk.id = t.taker_id LEFT JOIN locations l ON l.id = t.location_id LEFT JOIN creditors c ON c.id = t.creditor_id LEFT JOIN income_sources s ON s.id = t.income_source_id ORDER BY t.transaction_date DESC, t.updated_at DESC");
  const [[settings]] = await dbPool.query("SELECT currency, schema_version AS schemaVersion FROM app_settings WHERE id = 1");
  const catalogRows = {};
  for (const table of ["expense_types", "takers", "locations", "creditors", "payment_methods", "income_sources"]) {
    const hasOrder = ["takers", "creditors", "payment_methods", "income_sources"].includes(table);
    const [rows] = await dbPool.query(`SELECT id, name, slug, ${hasOrder ? "display_order" : "0"} AS displayOrder, is_active AS isActive FROM ${table} ORDER BY ${hasOrder ? "display_order," : ""} name`);
    catalogRows[table] = rows;
  }
  const expenseTypes = catalogRows.expense_types;
  const takers = catalogRows.takers;
  const locations = catalogRows.locations;
  const creditors = catalogRows.creditors;
  const paymentMethods = catalogRows.payment_methods;
  const incomeSources = catalogRows.income_sources;
  const catalogMetadata = Object.fromEntries(Object.entries(catalogRows).map(([table, rows]) => [table, rows.map((item) => ({ id: Number(item.id), name: item.name, slug: item.slug, displayOrder: Number(item.displayOrder), isActive: Boolean(item.isActive) }))]));
  const normalizedRows = rows.map((item) => ({ ...item, amount: Number(item.amount) }));
  const [cashClosings] = await dbPool.query("SELECT c.id, c.client_id AS clientId, DATE_FORMAT(c.closing_date, '%Y-%m-%d') AS date, p.name AS paymentMethod, c.sale_count AS saleCount, c.total_amount AS totalAmount, c.created_at AS createdAt, c.updated_at AS updatedAt FROM cash_closings c JOIN payment_methods p ON p.id = c.payment_method_id ORDER BY c.closing_date DESC, c.updated_at DESC");
  const [limits] = await dbPool.query("SELECT id, client_id AS clientId, month, year, owner, target, budget, forecast, patamar, result, closed, created_at AS createdAt, updated_at AS updatedAt FROM limits ORDER BY year DESC, month DESC, owner");
  const [monthlyRows] = await dbPool.query("SELECT c.id, c.client_id AS clientId, c.closing_month AS month, c.closing_year AS year, p.name AS paymentMethod, c.sale_count AS saleCount, c.total_amount AS totalAmount, c.created_at AS createdAt, c.updated_at AS updatedAt FROM monthly_cash_closings c JOIN payment_methods p ON p.id = c.payment_method_id ORDER BY c.closing_year DESC, c.closing_month DESC");
  const [billingRows] = await dbPool.query("SELECT id, client_id AS clientId, closing_month AS month, closing_year AS year, sale_count AS saleCount, average_ticket AS averageTicket, amount, created_at AS createdAt, updated_at AS updatedAt FROM billings ORDER BY closing_year DESC, closing_month DESC");
  return { transactions: normalizedRows, incomes: normalizedRows.filter((item) => item.type === "income"), cashClosings: cashClosings.map((item) => ({ ...item, saleCount: Number(item.saleCount), totalAmount: Number(item.totalAmount) })), monthlyCashClosings: monthlyRows.map((item) => ({ ...item, month: Number(item.month), year: Number(item.year), saleCount: Number(item.saleCount), totalAmount: Number(item.totalAmount) })), billings: billingRows.map((item) => ({ ...item, month: Number(item.month), year: Number(item.year), saleCount: Number(item.saleCount), averageTicket: Number(item.averageTicket), amount: Number(item.amount) })), limits: limits.map((item) => ({ ...item, owner: item.owner === "R" ? "R" : "P", month: Number(item.month), year: Number(item.year), target: Number(item.target), budget: Number(item.budget), forecast: Number(item.forecast), patamar: Number(item.patamar), result: Number(item.result), closed: Boolean(item.closed) })), settings: { currency: settings?.currency || "BRL", schemaVersion: settings?.schemaVersion || 10, expenseTypes: expenseTypes.map((item) => item.name), takers: takers.map((item) => item.name), locations: locations.map((item) => item.name), creditors: creditors.map((item) => item.name), paymentMethods: paymentMethods.map((item) => item.name), incomeSources: incomeSources.map((item) => item.name), catalogMetadata } };
}

function currentBrazilPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return { year: Number(parts.find((part) => part.type === "year").value), month: Number(parts.find((part) => part.type === "month").value) };
}

async function refreshBillings(connection = dbPool) {
  if (!connection) throw new Error("MySQL indisponível. Faturamento não atualizado.");
  const { year, month } = currentBrazilPeriod();
  const [historical] = await connection.query(
    "SELECT closing_year AS year, closing_month AS month, SUM(sale_count) AS saleCount, SUM(total_amount) AS amount FROM monthly_cash_closings WHERE NOT (closing_year = ? AND closing_month = ?) GROUP BY closing_year, closing_month",
    [year, month],
  );
  const [[current]] = await connection.query(
    "SELECT COALESCE(SUM(sale_count), 0) AS saleCount, COALESCE(SUM(total_amount), 0) AS amount FROM cash_closings WHERE YEAR(closing_date) = ? AND MONTH(closing_date) = ?",
    [year, month],
  );
  const periods = [...historical, { year, month, saleCount: current.saleCount, amount: current.amount }];
  const retained = [];
  for (const period of periods) {
    const saleCount = Number(period.saleCount || 0);
    const amount = Number(period.amount || 0);
    const averageTicket = saleCount ? amount / saleCount : 0;
    const clientId = `billing-${period.year}-${String(period.month).padStart(2, "0")}`;
    await connection.execute(
      "INSERT INTO billings (client_id, closing_month, closing_year, sale_count, average_ticket, amount) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE sale_count = VALUES(sale_count), average_ticket = VALUES(average_ticket), amount = VALUES(amount), updated_at = CURRENT_TIMESTAMP",
      [clientId, period.month, period.year, saleCount, averageTicket, amount],
    );
    retained.push([period.year, period.month]);
  }
  if (!retained.length) await connection.execute("DELETE FROM billings");
  else await connection.query("DELETE FROM billings WHERE (closing_year, closing_month) NOT IN (?)", [retained]);
  const [rows] = await connection.query("SELECT id, client_id AS clientId, closing_month AS month, closing_year AS year, sale_count AS saleCount, average_ticket AS averageTicket, amount, created_at AS createdAt, updated_at AS updatedAt FROM billings ORDER BY closing_year DESC, closing_month DESC");
  return rows.map((item) => ({ ...item, month: Number(item.month), year: Number(item.year), saleCount: Number(item.saleCount), averageTicket: Number(item.averageTicket), amount: Number(item.amount) }));
}

export async function refreshBillingsData() {
  return refreshBillings();
}

export async function saveCashClosing(date, items) {
  if (!dbPool) throw new Error("MySQL indisponível. Fechamento não gravado.");
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const [methods] = await connection.query("SELECT id, name FROM payment_methods");
    const methodIds = new Map(methods.map((item) => [item.name, item.id]));
    const [existing] = await connection.query("SELECT id, client_id AS clientId FROM cash_closings WHERE closing_date = ?", [date]);
    const retained = new Set();
    for (const item of items) {
      const paymentMethodId = methodIds.get(item.paymentMethod);
      if (!paymentMethodId) throw new Error(`Forma de recebimento não encontrada: ${item.paymentMethod}`);
      const numericId = Number.isInteger(item.id) || /^\d+$/.test(String(item.id)) ? Number(item.id) : null;
      const row = numericId ? existing.find((entry) => entry.id === numericId) : existing.find((entry) => entry.clientId === String(item.id));
      const values = [date, paymentMethodId, Number(item.saleCount || 0), Number(item.totalAmount || 0)];
      if (row) {
        await connection.execute("UPDATE cash_closings SET closing_date = ?, payment_method_id = ?, sale_count = ?, total_amount = ? WHERE id = ?", [...values, row.id]);
        retained.add(row.id);
      } else {
        const [result] = await connection.execute("INSERT INTO cash_closings (client_id, closing_date, payment_method_id, sale_count, total_amount) VALUES (?, ?, ?, ?, ?)", [numericId ? null : String(item.id), ...values]);
        retained.add(result.insertId);
      }
    }
    if (retained.size) await connection.query("DELETE FROM cash_closings WHERE closing_date = ? AND id NOT IN (?)", [date, [...retained]]);
    else await connection.query("DELETE FROM cash_closings WHERE closing_date = ?", [date]);
    const amount = items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    const sales = items.reduce((sum, item) => sum + Number(item.saleCount || 0), 0);
    const incomeId = `cash-closing-income-${date}`;
    const [incomeRows] = await connection.query("SELECT id FROM transactions WHERE client_id = ?", [incomeId]);
    const [[incomeSource]] = await connection.query("SELECT id FROM income_sources WHERE name = ? LIMIT 1", ["Vendas"]);
    let incomeSourceId = incomeSource?.id || null;
    if (!incomeSourceId) {
      const [result] = await connection.execute("INSERT INTO income_sources (name, slug) VALUES (?, ?)", ["Vendas", "vendas"]);
      incomeSourceId = result.insertId;
    }
    const incomeValues = [`Vendas dia ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)} (${sales})`, amount, "income", date];
    if (incomeRows[0]) await connection.execute("UPDATE transactions SET description = ?, amount = ?, type = ?, expense_type = NULL, taker = NULL, location = NULL, creditor = NULL, income_source_id = ?, transaction_date = ? WHERE id = ?", [incomeValues[0], incomeValues[1], incomeValues[2], incomeSourceId, incomeValues[3], incomeRows[0].id]);
    else await connection.execute("INSERT INTO transactions (client_id, description, amount, type, income_source_id, transaction_date) VALUES (?, ?, ?, ?, ?, ?)", [incomeId, incomeValues[0], incomeValues[1], incomeValues[2], incomeSourceId, incomeValues[3]]);
    await refreshBillings(connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function saveTransaction(item) {
  if (!dbPool) throw new Error("MySQL indisponível. Lançamento não gravado.");
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const numericId = Number.isInteger(item.id) || /^\d+$/.test(String(item.id)) ? Number(item.id) : null;
    const clientId = item.clientId || (!numericId ? String(item.id) : null);
    const [existing] = await connection.query("SELECT id FROM transactions WHERE id = ? OR client_id = ?", [numericId || 0, clientId || ""]);
    const income = item.type === "income";
    const lookup = async (table, name) => {
      if (!name) return null;
      const [rows] = await connection.query(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [name]);
      if (!rows[0]) {
        await connection.execute(`INSERT INTO ${table} (name, slug) VALUES (?, ?)`, [name, toSlug(name)]);
        const [created] = await connection.query(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [name]);
        return created[0]?.id || null;
      }
      return rows[0]?.id || null;
    };
    const expenseTypeId = income ? null : await lookup("expense_types", item.expenseType);
    const takerId = income ? null : await lookup("takers", item.taker);
    const locationId = income ? null : await lookup("locations", item.location);
    const creditorId = income ? null : await lookup("creditors", item.creditor);
    const sourceId = income ? await lookup("income_sources", item.source) : null;
    const values = [item.description, Number(item.amount || 0), income ? "income" : "expense", income ? null : item.expenseType, income ? null : item.taker, income ? null : item.location, income ? null : item.creditor, expenseTypeId, takerId, locationId, creditorId, sourceId, item.date];
    let transactionId;
    if (existing[0]) {
      transactionId = existing[0].id;
      await connection.execute("UPDATE transactions SET description = ?, amount = ?, type = ?, expense_type = ?, taker = ?, location = ?, creditor = ?, expense_type_id = ?, taker_id = ?, location_id = ?, creditor_id = ?, income_source_id = ?, transaction_date = ? WHERE id = ?", [...values, transactionId]);
    } else {
      const [result] = await connection.execute("INSERT INTO transactions (client_id, description, amount, type, expense_type, taker, location, creditor, expense_type_id, taker_id, location_id, creditor_id, income_source_id, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [clientId, ...values]);
      transactionId = result.insertId;
    }
    if (item.observation?.trim()) await connection.execute("INSERT INTO buffet_observations (transaction_id, observation) VALUES (?, ?) ON DUPLICATE KEY UPDATE observation = VALUES(observation), updated_at = CURRENT_TIMESTAMP", [transactionId, item.observation.trim()]);
    else await connection.execute("DELETE FROM buffet_observations WHERE transaction_id = ?", [transactionId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function saveLimit(item) {
  if (!dbPool) throw new Error("MySQL indisponível. Limite não gravado.");
  if (item.owner !== "P" && item.owner !== "R") throw new Error("Owner inválido. Use P ou R.");
  const connection = await dbPool.getConnection();
  try {
    const numericId = Number.isInteger(item.id) || /^\d+$/.test(String(item.id)) ? Number(item.id) : null;
    const [existing] = await connection.query("SELECT id FROM limits WHERE id = ? OR client_id = ?", [numericId || 0, String(item.id)]);
    const values = [Number(item.month), Number(item.year), item.owner, Number(item.target || 0), Number(item.budget || 0), Number(item.forecast || 0), Number(item.patamar || 0), Number(item.result || 0), item.closed ? 1 : 0];
    if (existing[0]) await connection.execute("UPDATE limits SET month = ?, year = ?, owner = ?, target = ?, budget = ?, forecast = ?, patamar = ?, result = ?, closed = ? WHERE id = ?", [...values, existing[0].id]);
    else await connection.execute("INSERT INTO limits (client_id, month, year, owner, target, budget, forecast, patamar, result, closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [numericId ? null : String(item.id), ...values]);
  } finally {
    connection.release();
  }
}

export async function saveCatalog(operation) {
  if (!dbPool) throw new Error("MySQL indisponível. Cadastro não gravado.");
  const tables = { type: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" };
  const table = tables[operation.kind];
  if (!table) throw new Error("Cadastro inválido.");
  const hasOrder = ["taker", "creditor", "paymentMethod", "incomeSource"].includes(operation.kind);
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    if (operation.action === "add") {
      const order = Number(operation.displayOrder) || 0;
      await connection.execute(`INSERT INTO ${table} (name, slug, ${hasOrder ? "display_order, " : ""}is_active) VALUES (?, ?, ${hasOrder ? "?, " : ""}1)`, hasOrder ? [operation.name, toSlug(operation.name), order] : [operation.name, toSlug(operation.name)]);
    } else if (operation.action === "rename") {
      const fields = { type: "expense_type", taker: "taker", location: "location", creditor: "creditor", incomeSource: "source" };
      const field = fields[operation.kind];
      const [rows] = await connection.query(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [operation.current]);
      if (!rows[0]) throw new Error("Cadastro não encontrado.");
      await connection.execute(`UPDATE ${table} SET name = ?, slug = ?, ${hasOrder ? "display_order = ?, " : ""}is_active = ? WHERE id = ?`, hasOrder ? [operation.name, toSlug(operation.name), Number(operation.displayOrder) || 0, operation.isActive === false ? 0 : 1, rows[0].id] : [operation.name, toSlug(operation.name), operation.isActive === false ? 0 : 1, rows[0].id]);
      if (field) await connection.execute(`UPDATE transactions SET ${field} = ? WHERE ${field} = ?`, [operation.name, operation.current]);
    } else if (operation.action === "delete") {
      const [rows] = await connection.query(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [operation.name]);
      if (!rows[0]) throw new Error("Cadastro não encontrado.");
      await connection.execute(`DELETE FROM ${table} WHERE id = ?`, [rows[0].id]);
    } else if (operation.action === "order") {
      for (const item of operation.items || []) {
        if (hasOrder) await connection.execute(`UPDATE ${table} SET display_order = ? WHERE name = ?`, [Number(item.displayOrder) || 0, item.name]);
      }
    } else throw new Error("Operação de cadastro inválida.");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function saveMonthlyCashClosings(items) {
  if (!dbPool) throw new Error("MySQL indisponível. Fechamento mensal não gravado.");
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const [methods] = await connection.query("SELECT id, name FROM payment_methods");
    const methodIds = new Map(methods.map((item) => [item.name, item.id]));
    const periods = [...new Set(items.map((item) => `${Number(item.year)}-${Number(item.month)}`))];
    const retained = new Map(periods.map((period) => [period, new Set()]));
    for (const item of items) {
      const paymentMethodId = methodIds.get(item.paymentMethod);
      if (!paymentMethodId) throw new Error(`Forma de recebimento não encontrada: ${item.paymentMethod}`);
      const numericId = Number.isInteger(item.id) || /^\d+$/.test(String(item.id)) ? Number(item.id) : null;
      const [rows] = await connection.query("SELECT id FROM monthly_cash_closings WHERE closing_month = ? AND closing_year = ? AND payment_method_id = ?", [item.month, item.year, paymentMethodId]);
      const values = [Number(item.month), Number(item.year), paymentMethodId, Number(item.saleCount || 0), Number(item.totalAmount || 0)];
      if (rows[0]) {
        await connection.execute("UPDATE monthly_cash_closings SET sale_count = ?, total_amount = ? WHERE id = ?", [values[3], values[4], rows[0].id]);
        retained.get(`${values[1]}-${values[0]}`).add(rows[0].id);
      } else {
        const [result] = await connection.execute("INSERT INTO monthly_cash_closings (client_id, closing_month, closing_year, payment_method_id, sale_count, total_amount) VALUES (?, ?, ?, ?, ?, ?)", [numericId ? null : String(item.id), ...values]);
        retained.get(`${values[1]}-${values[0]}`).add(result.insertId);
      }
    }
    for (const period of periods) {
      const [year, month] = period.split("-").map(Number);
      const ids = [...retained.get(period)];
      if (ids.length) await connection.query("DELETE FROM monthly_cash_closings WHERE closing_year = ? AND closing_month = ? AND id NOT IN (?)", [year, month, ids]);
      else await connection.execute("DELETE FROM monthly_cash_closings WHERE closing_year = ? AND closing_month = ?", [year, month]);
    }
    await refreshBillings(connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
