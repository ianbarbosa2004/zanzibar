import { mergeTransactions } from "../../shared/transactions.js";
import { dbPool } from "./pool.js";
import { databaseName, databaseUser } from "../config.js";
export { dbPool };

export async function initializeDatabase({ readJson, dataFile, settingsFile, incomesFile, defaultSettings }) {
  if (!dbPool) return;
  if (!databaseUser || !databaseName) throw new Error("Configuração MySQL incompleta.");

  await dbPool.query(`CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(36) PRIMARY KEY, description VARCHAR(60) NOT NULL, amount DECIMAL(12, 2) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'expense', expense_type VARCHAR(120) NULL, taker VARCHAR(120) NULL,
    location VARCHAR(120) NULL, creditor VARCHAR(120) NULL, transaction_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
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
  for (const table of ["expense_types", "takers", "locations", "creditors"]) {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS ${table} (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS income_sources (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const transactions = await readJson(dataFile, []);
  const appSettings = await readJson(settingsFile, defaultSettings);
  const incomes = await readJson(incomesFile, []);
  for (const name of [...new Set(["Salário", ...(appSettings.incomeSources || []), ...incomes.map((item) => item.source).filter(Boolean)])]) await dbPool.execute("INSERT IGNORE INTO income_sources (name) VALUES (?)", [name]);
  const [existingTransactions] = await dbPool.query("SELECT expense_type, taker, location, creditor FROM transactions");
  const catalogs = {
    expense_types: [...new Set([...(appSettings.expenseTypes || []), ...transactions.map((item) => item.expenseType || item.category || "Outros"), ...existingTransactions.map((item) => item.expense_type)])],
    takers: [...new Set([...(appSettings.takers || []), ...transactions.map((item) => item.taker || "Pessoal"), ...existingTransactions.map((item) => item.taker)])],
    locations: [...new Set([...(appSettings.locations || []), ...transactions.map((item) => item.location || "Casa"), ...existingTransactions.map((item) => item.location)])],
    creditors: [...new Set([...(appSettings.creditors || []), ...transactions.map((item) => item.creditor || "Caixa"), ...existingTransactions.map((item) => item.creditor)])],
  };
  for (const [table, names] of Object.entries(catalogs)) for (const name of names.filter(Boolean)) await dbPool.execute(`INSERT IGNORE INTO ${table} (name) VALUES (?)`, [name]);
  await dbPool.execute("INSERT IGNORE INTO takers (name) VALUES ('Zanzibar')");
  for (const [column, definition] of Object.entries({ expense_type_id: "INT UNSIGNED NULL", taker_id: "INT UNSIGNED NULL", location_id: "INT UNSIGNED NULL", creditor_id: "INT UNSIGNED NULL", income_source_id: "INT UNSIGNED NULL" })) {
    const [[found]] = await dbPool.query("SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = ?", [column]);
    if (!found.total) await dbPool.query(`ALTER TABLE transactions ADD COLUMN ${column} ${definition}`);
  }
  for (const column of ["expense_type", "taker", "location", "creditor"]) await dbPool.query(`ALTER TABLE transactions MODIFY COLUMN ${column} VARCHAR(120) NULL`);
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
    await dbPool.query("INSERT IGNORE INTO transactions (id, description, amount, type, income_source_id, transaction_date, created_at, updated_at) SELECT i.id, i.description, i.amount, 'income', i.source_id, i.income_date, i.created_at, i.updated_at FROM incomes i");
    await dbPool.query("DROP TABLE incomes");
  }
  for (const item of incomes) await dbPool.execute("INSERT IGNORE INTO transactions (id, description, amount, type, income_source_id, transaction_date) VALUES (?, ?, ?, 'income', (SELECT id FROM income_sources WHERE name = ?), ?)", [item.id, item.description, item.amount, item.source || "Salário", item.date]);
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
      await dbPool.execute("INSERT INTO transactions (id, description, amount, type, expense_type, taker, location, creditor, expense_type_id, taker_id, location_id, creditor_id, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [item.id, item.description, item.amount, item.type || "expense", expenseType, taker, location, creditor, idFor(rows, expenseType), idFor(takers, taker), idFor(locations, location), idFor(creditors, creditor), item.date]);
    }
  }
  await dbPool.query("INSERT INTO app_settings (id, currency, schema_version) VALUES (1, 'BRL', 4) ON DUPLICATE KEY UPDATE schema_version = 4");
}

export async function readDatabase() {
  const [rows] = await dbPool.query("SELECT t.id, t.description, t.amount, t.type, et.name AS expenseType, tk.name AS taker, l.name AS location, c.name AS creditor, s.name AS source, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date FROM transactions t LEFT JOIN expense_types et ON et.id = t.expense_type_id LEFT JOIN takers tk ON tk.id = t.taker_id LEFT JOIN locations l ON l.id = t.location_id LEFT JOIN creditors c ON c.id = t.creditor_id LEFT JOIN income_sources s ON s.id = t.income_source_id ORDER BY t.transaction_date DESC, t.updated_at DESC");
  const [[settings]] = await dbPool.query("SELECT currency, schema_version AS schemaVersion FROM app_settings WHERE id = 1");
  const [[expenseTypes], [takers], [locations], [creditors], [incomeSources]] = await Promise.all(["expense_types", "takers", "locations", "creditors", "income_sources"].map((table) => dbPool.query(`SELECT name FROM ${table} ORDER BY name`)));
  const normalizedRows = rows.map((item) => ({ ...item, amount: Number(item.amount) }));
  return { transactions: normalizedRows, incomes: normalizedRows.filter((item) => item.type === "income"), settings: { currency: settings?.currency || "BRL", schemaVersion: settings?.schemaVersion || 4, expenseTypes: expenseTypes.map((item) => item.name), takers: takers.map((item) => item.name), locations: locations.map((item) => item.name), creditors: creditors.map((item) => item.name), incomeSources: incomeSources.map((item) => item.name) } };
}

export async function writeDatabase(payload) {
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const catalogTables = { expenseType: "expense_types", taker: "takers", location: "locations", creditor: "creditors" };
    const catalogSettings = { expenseType: "expenseTypes", taker: "takers", location: "locations", creditor: "creditors" };
    const ids = {};
    for (const [property, table] of Object.entries(catalogTables)) {
      ids[property] = new Map();
      const values = [...new Set([...payload.transactions.map((item) => item[property]), ...(payload.settings?.[catalogSettings[property]] || [])].filter(Boolean))];
      for (const value of values) await connection.execute(`INSERT IGNORE INTO ${table} (name) VALUES (?)`, [value]);
      const [rows] = await connection.query(`SELECT id, name FROM ${table}`);
      rows.forEach((item) => ids[property].set(item.name, item.id));
    }
    const entries = mergeTransactions(payload.transactions, payload.incomes || []);
    const sourceNames = [...new Set([...entries.filter((item) => item.type === "income").map((item) => item.source), ...(payload.settings?.incomeSources || [])].filter(Boolean))];
    for (const name of sourceNames) await connection.execute("INSERT IGNORE INTO income_sources (name) VALUES (?)", [name]);
    const [sourceRows] = await connection.query("SELECT id, name FROM income_sources");
    const sourceIds = new Map(sourceRows.map((item) => [item.name, item.id]));
    await connection.query("DELETE FROM transactions");
    for (const item of entries) {
      const income = item.type === "income";
      await connection.execute("INSERT INTO transactions (id, description, amount, type, expense_type, taker, location, creditor, expense_type_id, taker_id, location_id, creditor_id, income_source_id, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [item.id, item.description, item.amount, income ? "income" : "expense", income ? null : item.expenseType || "Outros", income ? null : item.taker || "Pessoal", income ? null : item.location || "Casa", income ? null : item.creditor || "Caixa", income ? null : ids.expenseType.get(item.expenseType || "Outros"), income ? null : ids.taker.get(item.taker || "Pessoal"), income ? null : ids.location.get(item.location || "Casa"), income ? null : ids.creditor.get(item.creditor || "Caixa"), income ? sourceIds.get(item.source || "Salário") : null, item.date]);
    }
    await connection.execute("INSERT INTO app_settings (id, currency, schema_version) VALUES (1, 'BRL', 4) ON DUPLICATE KEY UPDATE schema_version = 4");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
