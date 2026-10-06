import { mergeTransactions } from "../../shared/transactions.js";
import { dbPool } from "./pool.js";
import { databaseName, databaseUser } from "../config.js";
export { dbPool };

export async function initializeDatabase({ readJson, dataFile, settingsFile, incomesFile, cashClosingsFile, defaultSettings }) {
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
    await dbPool.query(`CREATE TABLE IF NOT EXISTS ${table} (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS income_sources (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
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
  const timestampTables = ["transactions", "app_settings", "expense_types", "takers", "locations", "creditors", "income_sources", "payment_methods", "cash_closings"];
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
  for (const name of [...new Set(["Salário", ...(appSettings.incomeSources || []), ...incomes.map((item) => item.source).filter(Boolean)])]) await dbPool.execute("INSERT IGNORE INTO income_sources (name) VALUES (?)", [name]);
  const [existingTransactions] = await dbPool.query("SELECT expense_type, taker, location, creditor FROM transactions");
  const catalogs = {
    expense_types: [...new Set([...(appSettings.expenseTypes || []), ...transactions.map((item) => item.expenseType || item.category || "Outros"), ...existingTransactions.map((item) => item.expense_type)])],
    takers: [...new Set([...(appSettings.takers || []), ...transactions.map((item) => item.taker || "Pessoal"), ...existingTransactions.map((item) => item.taker)])],
    locations: [...new Set([...(appSettings.locations || []), ...transactions.map((item) => item.location || "Casa"), ...existingTransactions.map((item) => item.location)])],
    creditors: [...new Set([...(appSettings.creditors || []), ...transactions.map((item) => item.creditor || "Caixa"), ...existingTransactions.map((item) => item.creditor)])],
    payment_methods: [...new Set(["Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito", "Boleto", "Transferência bancária", ...(appSettings.paymentMethods || [])])],
  };
  for (const [table, names] of Object.entries(catalogs)) for (const name of names.filter(Boolean)) await dbPool.execute(`INSERT IGNORE INTO ${table} (name) VALUES (?)`, [name]);
  await dbPool.execute("INSERT IGNORE INTO takers (name) VALUES ('Zanzibar')");
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
  await dbPool.query("INSERT INTO app_settings (id, currency, schema_version) VALUES (1, 'BRL', 8) ON DUPLICATE KEY UPDATE schema_version = 8");
}

export async function readDatabase() {
  const [rows] = await dbPool.query("SELECT t.id, t.client_id AS clientId, t.description, t.amount, t.type, et.name AS expenseType, tk.name AS taker, l.name AS location, c.name AS creditor, s.name AS source, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date, t.created_at AS createdAt, t.updated_at AS updatedAt FROM transactions t LEFT JOIN expense_types et ON et.id = t.expense_type_id LEFT JOIN takers tk ON tk.id = t.taker_id LEFT JOIN locations l ON l.id = t.location_id LEFT JOIN creditors c ON c.id = t.creditor_id LEFT JOIN income_sources s ON s.id = t.income_source_id ORDER BY t.transaction_date DESC, t.updated_at DESC");
  const [[settings]] = await dbPool.query("SELECT currency, schema_version AS schemaVersion FROM app_settings WHERE id = 1");
  const catalogRows = {};
  for (const table of ["expense_types", "takers", "locations", "creditors", "payment_methods", "income_sources"]) {
    const hasOrder = ["takers", "creditors", "payment_methods", "income_sources"].includes(table);
    const [rows] = await dbPool.query(`SELECT name, ${hasOrder ? "display_order" : "0"} AS displayOrder, is_active AS isActive FROM ${table} ORDER BY ${hasOrder ? "display_order," : ""} name`);
    catalogRows[table] = rows;
  }
  const expenseTypes = catalogRows.expense_types;
  const takers = catalogRows.takers;
  const locations = catalogRows.locations;
  const creditors = catalogRows.creditors;
  const paymentMethods = catalogRows.payment_methods;
  const incomeSources = catalogRows.income_sources;
  const catalogMetadata = Object.fromEntries(Object.entries(catalogRows).map(([table, rows]) => [table, rows.map((item) => ({ name: item.name, displayOrder: Number(item.displayOrder), isActive: Boolean(item.isActive) }))]));
  const normalizedRows = rows.map((item) => ({ ...item, amount: Number(item.amount) }));
  const [cashClosings] = await dbPool.query("SELECT c.id, c.client_id AS clientId, DATE_FORMAT(c.closing_date, '%Y-%m-%d') AS date, p.name AS paymentMethod, c.sale_count AS saleCount, c.total_amount AS totalAmount, c.created_at AS createdAt, c.updated_at AS updatedAt FROM cash_closings c JOIN payment_methods p ON p.id = c.payment_method_id ORDER BY c.closing_date DESC, c.updated_at DESC");
  return { transactions: normalizedRows, incomes: normalizedRows.filter((item) => item.type === "income"), cashClosings: cashClosings.map((item) => ({ ...item, saleCount: Number(item.saleCount), totalAmount: Number(item.totalAmount) })), settings: { currency: settings?.currency || "BRL", schemaVersion: settings?.schemaVersion || 8, expenseTypes: expenseTypes.map((item) => item.name), takers: takers.map((item) => item.name), locations: locations.map((item) => item.name), creditors: creditors.map((item) => item.name), paymentMethods: paymentMethods.map((item) => item.name), incomeSources: incomeSources.map((item) => item.name), catalogMetadata } };
}

export async function writeDatabase(payload) {
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const catalogTables = { expenseType: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" };
    const catalogSettings = { expenseType: "expenseTypes", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "paymentMethods", incomeSource: "incomeSources" };
    const ids = {};
    for (const [property, table] of Object.entries(catalogTables)) {
      ids[property] = new Map();
      const sourceEntries = property === "incomeSource" ? [...(payload.incomes || []), ...(payload.transactions || [])] : payload.transactions;
      const values = [...new Set([...sourceEntries.map((item) => property === "incomeSource" ? item.source : item[property]), ...(payload.settings?.[catalogSettings[property]] || [])].filter(Boolean))];
      for (const value of values) await connection.execute(`INSERT IGNORE INTO ${table} (name) VALUES (?)`, [value]);
      const [rows] = await connection.query(`SELECT id, name FROM ${table}`);
      rows.forEach((item) => ids[property].set(item.name, item.id));
    }
    const catalogMetadata = payload.settings?.catalogMetadata || {};
    for (const [table, entries] of Object.entries(catalogMetadata)) {
      if (!catalogTables || !["expense_types", "takers", "locations", "creditors", "payment_methods", "income_sources"].includes(table)) continue;
      const hasOrder = ["takers", "creditors", "payment_methods", "income_sources"].includes(table);
      for (const entry of entries || []) {
        await connection.execute(`UPDATE ${table} SET ${hasOrder ? "display_order = ?, " : ""}is_active = ? WHERE name = ?`, hasOrder ? [Number(entry.displayOrder) || 0, entry.isActive === false ? 0 : 1, entry.name] : [entry.isActive === false ? 0 : 1, entry.name]);
      }
    }
    const deleteRules = {
      expense_types: { referenceTable: "transactions", referenceColumn: "expense_type_id" },
      takers: { referenceTable: "transactions", referenceColumn: "taker_id" },
      locations: { referenceTable: "transactions", referenceColumn: "location_id" },
      creditors: { referenceTable: "transactions", referenceColumn: "creditor_id" },
      payment_methods: { referenceTable: "cash_closings", referenceColumn: "payment_method_id" },
      income_sources: { referenceTable: "transactions", referenceColumn: "income_source_id" },
    };
    for (const [table, { referenceTable, referenceColumn }] of Object.entries(deleteRules)) {
      const submittedNames = (catalogMetadata[table] || []).map((entry) => entry.name);
      if (!submittedNames.length) continue;
      const placeholders = submittedNames.map(() => "?").join(",");
      await connection.query(`DELETE c FROM ${table} c LEFT JOIN ${referenceTable} r ON r.${referenceColumn} = c.id WHERE c.name NOT IN (${placeholders}) AND r.id IS NULL`, submittedNames);
    }
    const closingIncomeEntries = [...new Set((payload.cashClosings || []).map((item) => item.date))].map((date) => {
      const rows = (payload.cashClosings || []).filter((item) => item.date === date);
      return { id: `cash-closing-income-${date}`, description: `Vendas dia ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`, amount: rows.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0), type: "income", source: "Vendas", date };
    });
    const entries = mergeTransactions(payload.transactions, [...(payload.incomes || []), ...closingIncomeEntries]);
    const [paymentMethodRows] = await connection.query("SELECT id, name FROM payment_methods");
    const paymentMethodIds = new Map(paymentMethodRows.map((item) => [item.name, item.id]));
    const sourceNames = [...new Set([...entries.filter((item) => item.type === "income").map((item) => item.source), ...(payload.settings?.incomeSources || [])].filter(Boolean))];
    for (const name of sourceNames) await connection.execute("INSERT IGNORE INTO income_sources (name) VALUES (?)", [name]);
    const [sourceRows] = await connection.query("SELECT id, name FROM income_sources");
    const sourceIds = new Map(sourceRows.map((item) => [item.name, item.id]));
    const [existing] = await connection.query("SELECT id, client_id AS clientId FROM transactions");
    const retainedIds = new Set();
    for (const item of entries) {
      const income = item.type === "income";
      const numericId = Number.isInteger(item.id) || /^\d+$/.test(String(item.id)) ? Number(item.id) : null;
      const existingRow = numericId
        ? existing.find((row) => row.id === numericId)
        : existing.find((row) => row.clientId === String(item.id));
      const values = [item.description, item.amount, income ? "income" : "expense", income ? null : item.expenseType || "Outros", income ? null : item.taker || "Pessoal", income ? null : item.location || "Casa", income ? null : item.creditor || "Caixa", income ? null : ids.expenseType.get(item.expenseType || "Outros"), income ? null : ids.taker.get(item.taker || "Pessoal"), income ? null : ids.location.get(item.location || "Casa"), income ? null : ids.creditor.get(item.creditor || "Caixa"), income ? item.incomeSourceId || sourceIds.get(item.source || "Salário") : null, item.date];
      if (existingRow) {
        await connection.execute("UPDATE transactions SET description = ?, amount = ?, type = ?, expense_type = ?, taker = ?, location = ?, creditor = ?, expense_type_id = ?, taker_id = ?, location_id = ?, creditor_id = ?, income_source_id = ?, transaction_date = ? WHERE id = ?", [...values, existingRow.id]);
        retainedIds.add(existingRow.id);
      } else {
        const [result] = await connection.execute("INSERT INTO transactions (client_id, description, amount, type, expense_type, taker, location, creditor, expense_type_id, taker_id, location_id, creditor_id, income_source_id, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [numericId ? null : String(item.id), ...values]);
        retainedIds.add(result.insertId);
      }
    }
    if (retainedIds.size) await connection.query("DELETE FROM transactions WHERE id NOT IN (?)", [[...retainedIds]]);
    else await connection.query("DELETE FROM transactions");
    const [existingClosings] = await connection.query("SELECT id, client_id AS clientId FROM cash_closings");
    const retainedClosingIds = new Set();
    const closingDates = [...new Set((payload.cashClosings || []).map((item) => item.date))];
    for (const date of closingDates) {
      const submittedIds = (payload.cashClosings || []).filter((item) => item.date === date).map((item) => String(item.id));
      const [duplicates] = await connection.query("SELECT id FROM cash_closings WHERE closing_date = ? AND (client_id IS NULL OR client_id NOT IN (?)) LIMIT 1", [date, submittedIds.length ? submittedIds : [""]]);
      if (duplicates.length) throw new Error(`Já existe fechamento para ${date}.`);
    }
    for (const item of payload.cashClosings || []) {
      const numericId = Number.isInteger(item.id) || /^\d+$/.test(String(item.id)) ? Number(item.id) : null;
      const existing = numericId ? existingClosings.find((row) => row.id === numericId) : existingClosings.find((row) => row.clientId === String(item.id));
      const values = [item.date, paymentMethodIds.get(item.paymentMethod), item.saleCount || 0, item.totalAmount || 0];
      if (!values[1]) throw new Error(`Forma de recebimento não encontrada: ${item.paymentMethod}`);
      if (existing) {
        await connection.execute("UPDATE cash_closings SET closing_date = ?, payment_method_id = ?, sale_count = ?, total_amount = ? WHERE id = ?", [...values, existing.id]);
        retainedClosingIds.add(existing.id);
      } else {
        const [result] = await connection.execute("INSERT INTO cash_closings (client_id, closing_date, payment_method_id, sale_count, total_amount) VALUES (?, ?, ?, ?, ?)", [numericId ? null : String(item.id), ...values]);
        retainedClosingIds.add(result.insertId);
      }
    }
    if (retainedClosingIds.size) await connection.query("DELETE FROM cash_closings WHERE id NOT IN (?)", [[...retainedClosingIds]]);
    else await connection.query("DELETE FROM cash_closings");
    await connection.execute("INSERT INTO app_settings (id, currency, schema_version) VALUES (1, 'BRL', 8) ON DUPLICATE KEY UPDATE schema_version = 8");
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
