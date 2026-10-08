import { dbPool } from "./pool.js";
import { databaseName, databaseUser } from "../config.js";
import { toSlug, uniqueSlug } from "../../shared/slugs.js";
export { dbPool };

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
    UNIQUE KEY uq_limits_period (year, month)
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
    await dbPool.execute("INSERT INTO limits (client_id, month, year, target, budget, forecast, patamar, result, closed) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM limits WHERE client_id = ?)", [clientId, item.month, item.year, item.target || 0, item.budget || 0, item.forecast || 0, item.patamar || 0, item.result || 0, item.closed ? 1 : 0, clientId]);
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

export async function readDatabase() {
  const [rows] = await dbPool.query("SELECT t.id, t.client_id AS clientId, t.description, t.amount, t.type, et.name AS expenseType, et.slug AS expenseTypeSlug, tk.name AS taker, tk.slug AS takerSlug, l.name AS location, l.slug AS locationSlug, c.name AS creditor, c.slug AS creditorSlug, s.name AS source, s.slug AS sourceSlug, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date, t.created_at AS createdAt, t.updated_at AS updatedAt FROM transactions t LEFT JOIN expense_types et ON et.id = t.expense_type_id LEFT JOIN takers tk ON tk.id = t.taker_id LEFT JOIN locations l ON l.id = t.location_id LEFT JOIN creditors c ON c.id = t.creditor_id LEFT JOIN income_sources s ON s.id = t.income_source_id ORDER BY t.transaction_date DESC, t.updated_at DESC");
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
  const [limits] = await dbPool.query("SELECT id, client_id AS clientId, month, year, target, budget, forecast, patamar, result, closed, created_at AS createdAt, updated_at AS updatedAt FROM limits ORDER BY year DESC, month DESC");
  const [monthlyRows] = await dbPool.query("SELECT c.id, c.client_id AS clientId, c.closing_month AS month, c.closing_year AS year, p.name AS paymentMethod, c.sale_count AS saleCount, c.total_amount AS totalAmount, c.created_at AS createdAt, c.updated_at AS updatedAt FROM monthly_cash_closings c JOIN payment_methods p ON p.id = c.payment_method_id ORDER BY c.closing_year DESC, c.closing_month DESC");
  const [billingRows] = await dbPool.query("SELECT id, client_id AS clientId, closing_month AS month, closing_year AS year, sale_count AS saleCount, average_ticket AS averageTicket, amount, created_at AS createdAt, updated_at AS updatedAt FROM billings ORDER BY closing_year DESC, closing_month DESC");
  return { transactions: normalizedRows, incomes: normalizedRows.filter((item) => item.type === "income"), cashClosings: cashClosings.map((item) => ({ ...item, saleCount: Number(item.saleCount), totalAmount: Number(item.totalAmount) })), monthlyCashClosings: monthlyRows.map((item) => ({ ...item, month: Number(item.month), year: Number(item.year), saleCount: Number(item.saleCount), totalAmount: Number(item.totalAmount) })), billings: billingRows.map((item) => ({ ...item, month: Number(item.month), year: Number(item.year), saleCount: Number(item.saleCount), averageTicket: Number(item.averageTicket), amount: Number(item.amount) })), limits: limits.map((item) => ({ ...item, month: Number(item.month), year: Number(item.year), target: Number(item.target), budget: Number(item.budget), forecast: Number(item.forecast), patamar: Number(item.patamar), result: Number(item.result), closed: Boolean(item.closed) })), settings: { currency: settings?.currency || "BRL", schemaVersion: settings?.schemaVersion || 10, expenseTypes: expenseTypes.map((item) => item.name), takers: takers.map((item) => item.name), locations: locations.map((item) => item.name), creditors: creditors.map((item) => item.name), paymentMethods: paymentMethods.map((item) => item.name), incomeSources: incomeSources.map((item) => item.name), catalogMetadata } };
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
    const incomeValues = [`Vendas dia ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)} (${sales})`, amount, "income", "Vendas", date];
    if (incomeRows[0]) await connection.execute("UPDATE transactions SET description = ?, amount = ?, type = ?, expense_type = NULL, taker = NULL, location = NULL, creditor = NULL, transaction_date = ? WHERE id = ?", [incomeValues[0], incomeValues[1], incomeValues[2], incomeValues[4], incomeRows[0].id]);
    else await connection.execute("INSERT INTO transactions (client_id, description, amount, type, transaction_date) VALUES (?, ?, ?, ?, ?)", [incomeId, ...incomeValues]);
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
    const [existing] = await connection.query("SELECT id FROM transactions WHERE id = ? OR client_id = ?", [numericId || 0, String(item.id)]);
    const income = item.type === "income";
    const lookup = async (table, name, fallback = null) => {
      if (!name) return null;
      const [rows] = await connection.query(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [name]);
      if (!rows[0] && fallback) {
        await connection.execute(`INSERT INTO ${table} (name, slug) VALUES (?, ?)`, [name, fallback]);
        const [created] = await connection.query(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [name]);
        return created[0]?.id || null;
      }
      return rows[0]?.id || null;
    };
    const expenseTypeId = income ? null : await lookup("expense_types", item.expenseType, "outros");
    const takerId = income ? null : await lookup("takers", item.taker, "pessoal");
    const locationId = income ? null : await lookup("locations", item.location, "casa");
    const creditorId = income ? null : await lookup("creditors", item.creditor, "caixa");
    const sourceId = income ? await lookup("income_sources", item.source, "salario") : null;
    const values = [item.description, Number(item.amount || 0), income ? "income" : "expense", income ? null : item.expenseType, income ? null : item.taker, income ? null : item.location, income ? null : item.creditor, expenseTypeId, takerId, locationId, creditorId, sourceId, item.date];
    if (existing[0]) {
      await connection.execute("UPDATE transactions SET description = ?, amount = ?, type = ?, expense_type = ?, taker = ?, location = ?, creditor = ?, expense_type_id = ?, taker_id = ?, location_id = ?, creditor_id = ?, income_source_id = ?, transaction_date = ? WHERE id = ?", [...values, existing[0].id]);
    } else {
      await connection.execute("INSERT INTO transactions (client_id, description, amount, type, expense_type, taker, location, creditor, expense_type_id, taker_id, location_id, creditor_id, income_source_id, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [numericId ? null : String(item.id), ...values]);
    }
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
  const connection = await dbPool.getConnection();
  try {
    const numericId = Number.isInteger(item.id) || /^\d+$/.test(String(item.id)) ? Number(item.id) : null;
    const [existing] = await connection.query("SELECT id FROM limits WHERE id = ? OR client_id = ?", [numericId || 0, String(item.id)]);
    const values = [Number(item.month), Number(item.year), Number(item.target || 0), Number(item.budget || 0), Number(item.forecast || 0), Number(item.patamar || 0), Number(item.result || 0), item.closed ? 1 : 0];
    if (existing[0]) await connection.execute("UPDATE limits SET month = ?, year = ?, target = ?, budget = ?, forecast = ?, patamar = ?, result = ?, closed = ? WHERE id = ?", [...values, existing[0].id]);
    else await connection.execute("INSERT INTO limits (client_id, month, year, target, budget, forecast, patamar, result, closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [numericId ? null : String(item.id), ...values]);
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
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
