import { createServer } from "node:http";
import { existsSync, promises as fs } from "node:fs";
import { extname, join, normalize } from "node:path";
import { basePath, contentTypes, dataFile, defaultSettings, incomesFile, port, root, settingsFile } from "./src/server/config.js";
import { readJson, writeJson } from "./src/server/json-store.js";
import { dbPool, initializeDatabase, readDatabase, writeDatabase } from "./src/server/database/repository.js";

const requestPath = (url) => {
  const pathname = new URL(url || "/", "http://localhost").pathname;
  if (basePath !== "/" && pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname;
};
const isDataApi = (url) => /\/api\/data\/?$/.test(requestPath(url));

async function body(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw || "{}");
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
      const data = dbPool
        ? await readDatabase()
        : { transactions: await readJson(dataFile, []), incomes: await readJson(incomesFile, []), settings: await readJson(settingsFile, defaultSettings) };
      return send(response, 200, data);
    }
    if (isDataApi(request.url) && request.method === "PUT") {
      const payload = await body(request);
      if (!Array.isArray(payload.transactions) || (payload.incomes !== undefined && !Array.isArray(payload.incomes)) || typeof payload.settings !== "object" || payload.settings === null) {
        return send(response, 400, { error: "Dados inválidos." });
      }
      if (dbPool) {
        await writeDatabase(payload);
      } else {
        await writeJson(dataFile, payload.transactions);
        await writeJson(incomesFile, payload.incomes || payload.transactions.filter((item) => item.type === "income"));
        await writeJson(settingsFile, payload.settings);
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
    return send(response, 200, await fs.readFile(file), contentTypes[extname(file)] || "application/octet-stream");
  } catch (error) {
    console.error(error);
    return send(response, 500, { error: "Erro interno ao salvar os dados." });
  }
});

initializeDatabase({ readJson, dataFile, settingsFile, incomesFile, defaultSettings }).then(() => {
  server.listen(port, () => console.log(`Clareza disponível em http://localhost:${port}${dbPool ? " (MySQL)" : ""}`));
}).catch((error) => {
  console.error("Não foi possível inicializar o banco de dados.", error);
  process.exitCode = 1;
});
