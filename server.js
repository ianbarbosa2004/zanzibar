import { createServer } from "node:http";
import { existsSync, promises as fs } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataFile = join(root, "data.json");
const settingsFile = join(root, "settings.json");
const port = Number(process.env.PORT) || 4173;
const contentTypes = { ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".html": "text/html" };
const basePath = process.env.CLAREZA_BASE_PATH || "/clareza";
const databaseHost = process.env.CLAREZA_DB_HOST?.trim() || "localhost";
const databaseName = process.env.CLAREZA_DB_NAME?.trim();
const databaseUser = process.env.CLAREZA_DB_USER?.trim();
const requestPath = (url) => {
  const pathname = new URL(url || "/", "http://localhost").pathname;
  if (basePath !== "/" && pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname;
};
const isDataApi = (url) => /\/api\/data\/?$/.test(requestPath(url));
const databaseConfigured = Boolean(process.env.CLAREZA_DB_PASSWORD);
const dbPool = databaseConfigured ? mysql.createPool({
  host: databaseHost,
  port: Number(process.env.CLAREZA_DB_PORT) || 3306,
  user: databaseUser,
  password: process.env.CLAREZA_DB_PASSWORD,
  database: databaseName,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4",
}) : null;

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.writeFile(file, JSON.stringify(fallback, null, 2) + "\n");
    return fallback;
  }
}

async function body(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw || "{}");
}

async function initializeDatabase() {
  if (!dbPool) return;
  if (!databaseUser || !databaseName) throw new Error("Configuração MySQL incompleta.");
  await dbPool.query(`CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(36) PRIMARY KEY,
    description VARCHAR(60) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'expense',
    expense_type VARCHAR(120) NULL,
    taker VARCHAR(120) NULL,
    location VARCHAR(120) NULL,
    creditor VARCHAR(120) NULL,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS app_settings (
    id TINYINT UNSIGNED PRIMARY KEY,
    settings JSON NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const appSettingColumns = {
    currency: "CHAR(3) NOT NULL DEFAULT 'BRL'",
    schema_version: "INT UNSIGNED NOT NULL DEFAULT 1",
  };
  for (const [column, definition] of Object.entries(appSettingColumns)) {
    const [[found]] = await dbPool.query(
      "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_settings' AND column_name = ?",
      [column],
    );
    if (!found.total) await dbPool.query(`ALTER TABLE app_settings ADD COLUMN ${column} ${definition}`);
  }
  const [[settingsColumn]] = await dbPool.query(
    "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_settings' AND column_name = 'settings'",
  );
  if (settingsColumn.total) {
    await dbPool.query(
      `UPDATE app_settings
       SET currency = COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(settings, '$.currency')), ''), 'BRL'),
           schema_version = COALESCE(JSON_EXTRACT(settings, '$.schemaVersion'), 1)`,
    );
    await dbPool.query("ALTER TABLE app_settings DROP COLUMN settings");
  }
  for (const table of ["expense_types", "takers", "locations", "creditors"]) {
    await dbPool.query(`CREATE TABLE IF NOT EXISTS ${table} (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
  await dbPool.query(`CREATE TABLE IF NOT EXISTS income_sources (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const transactions = await readJson(dataFile, []);
  const appSettings = await readJson(settingsFile, { expenseTypes: [], takers: [], locations: [], creditors: [], incomeSources: [] });
  const incomes = await readJson(join(root, "incomes.json"), []);
  for (const name of [...new Set(["Salário", ...appSettings.incomeSources || [], ...incomes.map((item) => item.source).filter(Boolean)])]) {
    await dbPool.execute("INSERT IGNORE INTO income_sources (name) VALUES (?)", [name]);
  }
  const [existingTransactions] = await dbPool.query("SELECT expense_type, taker, location, creditor FROM transactions");
  const catalogs = {
    expense_types: [...new Set([...appSettings.expenseTypes || [], ...transactions.map((item) => item.expenseType || item.category || "Outros"), ...existingTransactions.map((item) => item.expense_type)])],
    takers: [...new Set([...appSettings.takers || [], ...transactions.map((item) => item.taker || "Pessoal"), ...existingTransactions.map((item) => item.taker)])],
    locations: [...new Set([...appSettings.locations || [], ...transactions.map((item) => item.location || "Casa"), ...existingTransactions.map((item) => item.location)])],
    creditors: [...new Set([...appSettings.creditors || [], ...transactions.map((item) => item.creditor || "Caixa"), ...existingTransactions.map((item) => item.creditor)])],
  };
  for (const [table, names] of Object.entries(catalogs)) {
    for (const name of names.filter(Boolean)) await dbPool.execute(`INSERT IGNORE INTO ${table} (name) VALUES (?)`, [name]);
  }
  await dbPool.execute("INSERT IGNORE INTO takers (name) VALUES ('Zanzibar')");
  const columns = {
    expense_type_id: "INT UNSIGNED NULL",
    taker_id: "INT UNSIGNED NULL",
    location_id: "INT UNSIGNED NULL",
    creditor_id: "INT UNSIGNED NULL",
  };
  for (const [column, definition] of Object.entries(columns)) {
    const [[found]] = await dbPool.query(
      "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = ?",
      [column],
    );
    if (!found.total) await dbPool.query(`ALTER TABLE transactions ADD COLUMN ${column} ${definition}`);
  }
  for (const column of ["expense_type", "taker", "location", "creditor"]) {
    await dbPool.query(`ALTER TABLE transactions MODIFY COLUMN ${column} VARCHAR(120) NULL`);
  }
  const [[incomeSourceColumn]] = await dbPool.query(
    "SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'transactions' AND column_name = 'income_source_id'",
  );
  if (!incomeSourceColumn.total) await dbPool.query("ALTER TABLE transactions ADD COLUMN income_source_id INT UNSIGNED NULL");
  await dbPool.query("UPDATE transactions t JOIN expense_types c ON c.name = t.expense_type SET t.expense_type_id = c.id WHERE t.expense_type_id IS NULL");
  await dbPool.query("UPDATE transactions t JOIN takers c ON c.name = t.taker SET t.taker_id = c.id WHERE t.taker_id IS NULL");
  await dbPool.query("UPDATE transactions t JOIN locations c ON c.name = t.location SET t.location_id = c.id WHERE t.location_id IS NULL");
  await dbPool.query("UPDATE transactions t JOIN creditors c ON c.name = t.creditor SET t.creditor_id = c.id WHERE t.creditor_id IS NULL");
  const relations = [
    ["fk_transactions_expense_type", "expense_type_id", "expense_types"],
    ["fk_transactions_taker", "taker_id", "takers"],
    ["fk_transactions_location", "location_id", "locations"],
    ["fk_transactions_creditor", "creditor_id", "creditors"],
    ["fk_transactions_income_source", "income_source_id", "income_sources"],
  ];
  for (const [constraint, column, table] of relations) {
    const [[found]] = await dbPool.query(
      "SELECT COUNT(*) AS total FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE() AND constraint_name = ?",
      [constraint],
    );
    if (!found.total) await dbPool.query(`ALTER TABLE transactions ADD CONSTRAINT ${constraint} FOREIGN KEY (${column}) REFERENCES ${table}(id)`);
  }
  const [[legacyIncomeTable]] = await dbPool.query(
    "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'incomes'",
  );
  if (legacyIncomeTable.total) {
    const [[legacyIncomeCount]] = await dbPool.query("SELECT COUNT(*) AS total FROM incomes");
    await dbPool.query(
      `INSERT IGNORE INTO transactions
       (id, description, amount, type, income_source_id, transaction_date, created_at, updated_at)
       SELECT i.id, i.description, i.amount, 'income', i.source_id, i.income_date, i.created_at, i.updated_at
       FROM incomes i`,
    );
    await dbPool.query("DROP TABLE incomes");
    if (legacyIncomeCount.total) console.log(`Tabela incomes consolidada: ${legacyIncomeCount.total} receitas migradas para transactions.`);
  }
  for (const item of incomes) {
    await dbPool.execute(
      `INSERT IGNORE INTO transactions
       (id, description, amount, type, income_source_id, transaction_date)
       VALUES (?, ?, ?, 'income', (SELECT id FROM income_sources WHERE name = ?), ?)`,
      [item.id, item.description, item.amount, item.source || "Salário", item.date],
    );
  }
  const [[transactionCount]] = await dbPool.query("SELECT COUNT(*) AS total FROM transactions");
  if (transactionCount.total === 0 && transactions.length) {
    const [expenseTypeRows] = await dbPool.query("SELECT id, name FROM expense_types");
    const [takerRows] = await dbPool.query("SELECT id, name FROM takers");
    const [locationRows] = await dbPool.query("SELECT id, name FROM locations");
    const [creditorRows] = await dbPool.query("SELECT id, name FROM creditors");
    const idFor = (rows, name) => rows.find((item) => item.name === name)?.id;
    for (const item of transactions) {
      const expenseType = item.expenseType || item.category || "Outros";
      const taker = item.taker || "Pessoal";
      const location = item.location || "Casa";
      const creditor = item.creditor || "Caixa";
      await dbPool.execute(
        `INSERT INTO transactions (id, description, amount, type, expense_type, taker, location, creditor,
          expense_type_id, taker_id, location_id, creditor_id, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.description, item.amount, item.type || "expense", expenseType, taker, location, creditor,
          idFor(expenseTypeRows, expenseType), idFor(takerRows, taker), idFor(locationRows, location), idFor(creditorRows, creditor), item.date],
      );
    }
  }
  await dbPool.query(
    "INSERT INTO app_settings (id, currency, schema_version) VALUES (1, 'BRL', 4) ON DUPLICATE KEY UPDATE schema_version = 4",
  );
  if (transactionCount.total === 0 && transactions.length) console.log(`MySQL inicializado com ${transactions.length} transações migradas.`);
}

async function readDatabase() {
  const [rows] = await dbPool.query(`SELECT t.id, t.description, t.amount, t.type, et.name AS expenseType,
    tk.name AS taker, l.name AS location, c.name AS creditor, s.name AS source,
    DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS date
    FROM transactions t
    LEFT JOIN expense_types et ON et.id = t.expense_type_id
    LEFT JOIN takers tk ON tk.id = t.taker_id
    LEFT JOIN locations l ON l.id = t.location_id
    LEFT JOIN creditors c ON c.id = t.creditor_id
    LEFT JOIN income_sources s ON s.id = t.income_source_id
    ORDER BY t.transaction_date DESC, t.updated_at DESC`);
  const [[settings]] = await dbPool.query("SELECT currency, schema_version AS schemaVersion FROM app_settings WHERE id = 1");
  const [expenseTypes] = await dbPool.query("SELECT name FROM expense_types ORDER BY name");
  const [takers] = await dbPool.query("SELECT name FROM takers ORDER BY name");
  const [locations] = await dbPool.query("SELECT name FROM locations ORDER BY name");
  const [creditors] = await dbPool.query("SELECT name FROM creditors ORDER BY name");
  const [incomeSources] = await dbPool.query("SELECT name FROM income_sources ORDER BY name");
  const normalizedRows = rows.map((item) => ({ ...item, amount: Number(item.amount) }));
  return {
    transactions: normalizedRows,
    incomes: normalizedRows.filter((item) => item.type === "income"),
    settings: {
      currency: settings?.currency || "BRL",
      schemaVersion: settings?.schemaVersion || 4,
      expenseTypes: expenseTypes.map((item) => item.name),
      takers: takers.map((item) => item.name),
      locations: locations.map((item) => item.name),
      creditors: creditors.map((item) => item.name),
      incomeSources: incomeSources.map((item) => item.name),
    },
  };
}

async function writeDatabase(payload) {
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const catalogTables = { expenseType: "expense_types", taker: "takers", location: "locations", creditor: "creditors" };
    const catalogSettings = { expenseType: "expenseTypes", taker: "takers", location: "locations", creditor: "creditors" };
    const ids = {};
    for (const [property, table] of Object.entries(catalogTables)) {
      ids[property] = new Map();
      const values = [...new Set([
        ...payload.transactions.map((item) => item[property]),
        ...(payload.settings?.[catalogSettings[property]] || []),
      ].filter(Boolean))];
      for (const value of values) {
        await connection.execute(`INSERT IGNORE INTO ${table} (name) VALUES (?)`, [value]);
      }
      const [rows] = await connection.query(`SELECT id, name FROM ${table}`);
      rows.forEach((item) => ids[property].set(item.name, item.id));
    }
    const entries = [
      ...payload.transactions,
      ...(payload.incomes || []).map((item) => ({ ...item, type: "income" })),
    ].filter((item, index, all) => all.findIndex((entry) => entry.id === item.id) === index);
    const incomeSourceNames = [...new Set([
      ...entries.filter((item) => item.type === "income").map((item) => item.source),
      ...(payload.settings?.incomeSources || []),
    ].filter(Boolean))];
    for (const name of incomeSourceNames) await connection.execute("INSERT IGNORE INTO income_sources (name) VALUES (?)", [name]);
    const [incomeSourceRows] = await connection.query("SELECT id, name FROM income_sources");
    const incomeSourceIds = new Map(incomeSourceRows.map((item) => [item.name, item.id]));
    await connection.query("DELETE FROM transactions");
    for (const item of entries) {
      const isIncome = item.type === "income";
      await connection.execute(
        `INSERT INTO transactions (id, description, amount, type, expense_type, taker, location, creditor,
          expense_type_id, taker_id, location_id, creditor_id, income_source_id, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.description, item.amount, isIncome ? "income" : "expense",
          isIncome ? null : item.expenseType || "Outros", isIncome ? null : item.taker || "Pessoal",
          isIncome ? null : item.location || "Casa", isIncome ? null : item.creditor || "Caixa",
          isIncome ? null : ids.expenseType.get(item.expenseType || "Outros"),
          isIncome ? null : ids.taker.get(item.taker || "Pessoal"),
          isIncome ? null : ids.location.get(item.location || "Casa"),
          isIncome ? null : ids.creditor.get(item.creditor || "Caixa"),
          isIncome ? incomeSourceIds.get(item.source || "Salário") : null, item.date],
      );
    }
    await connection.execute(
      `INSERT INTO app_settings (id, currency, schema_version) VALUES (1, 'BRL', 4)
       ON DUPLICATE KEY UPDATE schema_version = 4`,
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function send(response, status, payload, contentType = "application/json") {
  response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  response.end(contentType === "application/json" ? JSON.stringify(payload) : payload);
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (request.method === "GET" && basePath !== "/" && pathname === basePath) {
      response.writeHead(308, { Location: `${basePath}/` });
      return response.end();
    }
    if (isDataApi(request.url) && request.method === "GET") {
      return send(response, 200, dbPool ? await readDatabase() : { transactions: await readJson(dataFile, []), incomes: await readJson(join(root, "incomes.json"), []), settings: await readJson(settingsFile, { expenseTypes: [], takers: [], locations: [], creditors: [], incomeSources: [] }) });
    }
    if (isDataApi(request.url) && request.method === "PUT") {
      const payload = await body(request);
      if (!Array.isArray(payload.transactions) || (payload.incomes !== undefined && !Array.isArray(payload.incomes)) || typeof payload.settings !== "object" || payload.settings === null) return send(response, 400, { error: "Dados inválidos." });
      if (dbPool) {
        await writeDatabase(payload);
      } else {
        await fs.writeFile(dataFile, JSON.stringify(payload.transactions, null, 2) + "\n");
        await fs.writeFile(join(root, "incomes.json"), JSON.stringify(payload.incomes || payload.transactions.filter((item) => item.type === "income"), null, 2) + "\n");
        await fs.writeFile(settingsFile, JSON.stringify(payload.settings, null, 2) + "\n");
      }
      return send(response, 200, { ok: true });
    }

    const normalizedPath = requestPath(request.url);
    const requested = normalizedPath === "/" ? "index.html" : normalizedPath.replace(/^\/+/, "");
    const publicRoot = existsSync(join(root, "dist")) ? join(root, "dist") : root;
    let file = normalize(join(publicRoot, requested));
    if (!file.startsWith(publicRoot)) return send(response, 404, { error: "Não encontrado." });
    if (!existsSync(file)) {
      file = join(publicRoot, "index.html");
      if (!existsSync(file)) return send(response, 404, { error: "Não encontrado." });
    }
    send(response, 200, await fs.readFile(file), contentTypes[extname(file)] || "application/octet-stream");
  } catch (error) {
    console.error(error);
    send(response, 500, { error: "Erro interno ao salvar os dados." });
  }
});

initializeDatabase().then(() => {
  server.listen(port, () => console.log(`Clareza disponível em http://localhost:${port}${dbPool ? " (MySQL)" : ""}`));
}).catch((error) => {
  console.error("Não foi possível inicializar o banco de dados.", error);
  process.exitCode = 1;
});
