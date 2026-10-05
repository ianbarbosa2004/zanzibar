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
const requestPath = (url) => {
  const pathname = new URL(url || "/", "http://localhost").pathname;
  if (basePath !== "/" && pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname;
};
const isDataApi = (url) => /\/api\/data\/?$/.test(requestPath(url));
const databaseConfigured = Boolean(process.env.CLAREZA_DB_PASSWORD);
const dbPool = databaseConfigured ? mysql.createPool({
  host: process.env.CLAREZA_DB_HOST || "localhost",
  port: Number(process.env.CLAREZA_DB_PORT) || 3306,
  user: process.env.CLAREZA_DB_USER,
  password: process.env.CLAREZA_DB_PASSWORD,
  database: process.env.CLAREZA_DB_NAME,
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
  if (!process.env.CLAREZA_DB_USER || !process.env.CLAREZA_DB_NAME) throw new Error("Configuração MySQL incompleta.");
  await dbPool.query(`CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(36) PRIMARY KEY,
    description VARCHAR(60) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'expense',
    expense_type VARCHAR(120) NOT NULL,
    taker VARCHAR(120) NOT NULL,
    location VARCHAR(120) NOT NULL,
    creditor VARCHAR(120) NOT NULL,
    transaction_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await dbPool.query(`CREATE TABLE IF NOT EXISTS app_settings (
    id TINYINT UNSIGNED PRIMARY KEY,
    settings JSON NOT NULL
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [[count]] = await dbPool.query("SELECT COUNT(*) AS total FROM transactions");
  const [[settings]] = await dbPool.query("SELECT settings FROM app_settings WHERE id = 1");
  if (count.total === 0 && !settings) {
    const transactions = await readJson(dataFile, []);
    const appSettings = await readJson(settingsFile, { expenseTypes: [], takers: [], locations: [], creditors: [] });
    const connection = await dbPool.getConnection();
    try {
      await connection.beginTransaction();
      for (const item of transactions) {
        await connection.execute(
          `INSERT INTO transactions (id, description, amount, type, expense_type, taker, location, creditor, transaction_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [item.id, item.description, item.amount, item.type || "expense", item.expenseType || item.category || "Outros", item.taker || "Pessoal", item.location || "Casa", item.creditor || "Caixa", item.date],
        );
      }
      await connection.execute("INSERT INTO app_settings (id, settings) VALUES (1, ?)", [JSON.stringify(appSettings)]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    console.log(`MySQL inicializado com ${transactions.length} transações migradas.`);
  }
}

async function readDatabase() {
  const [rows] = await dbPool.query(`SELECT id, description, amount, type, expense_type AS expenseType, taker, location,
    creditor, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS date FROM transactions ORDER BY transaction_date DESC, updated_at DESC`);
  const [[settings]] = await dbPool.query("SELECT settings FROM app_settings WHERE id = 1");
  const value = settings?.settings;
  return { transactions: rows.map((item) => ({ ...item, amount: Number(item.amount) })), settings: typeof value === "string" ? JSON.parse(value) : (value || {}) };
}

async function writeDatabase(payload) {
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM transactions");
    for (const item of payload.transactions) {
      await connection.execute(
        `INSERT INTO transactions (id, description, amount, type, expense_type, taker, location, creditor, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.description, item.amount, item.type || "expense", item.expenseType || "Outros", item.taker || "Pessoal", item.location || "Casa", item.creditor || "Caixa", item.date],
      );
    }
    await connection.execute(
      `INSERT INTO app_settings (id, settings) VALUES (1, ?)
       ON DUPLICATE KEY UPDATE settings = VALUES(settings)`,
      [JSON.stringify(payload.settings)],
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
    if (isDataApi(request.url) && request.method === "GET") {
      return send(response, 200, dbPool ? await readDatabase() : { transactions: await readJson(dataFile, []), settings: await readJson(settingsFile, { expenseTypes: [], takers: [], locations: [], creditors: [] }) });
    }
    if (isDataApi(request.url) && request.method === "PUT") {
      const payload = await body(request);
      if (!Array.isArray(payload.transactions) || typeof payload.settings !== "object" || payload.settings === null) return send(response, 400, { error: "Dados inválidos." });
      if (dbPool) {
        await writeDatabase(payload);
      } else {
        await fs.writeFile(dataFile, JSON.stringify(payload.transactions, null, 2) + "\n");
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
