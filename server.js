import { createServer } from "node:http";
import { existsSync, promises as fs } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const dataFile = join(root, "data.json");
const settingsFile = join(root, "settings.json");
const port = Number(process.env.PORT) || 4173;
const contentTypes = { ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".html": "text/html" };
const isDataApi = (url) => /\/api\/data\/?$/.test(url.split("?")[0]);

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

function send(response, status, payload, contentType = "application/json") {
  response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  response.end(contentType === "application/json" ? JSON.stringify(payload) : payload);
}

const server = createServer(async (request, response) => {
  try {
    if (isDataApi(request.url) && request.method === "GET") return send(response, 200, { transactions: await readJson(dataFile, []), settings: await readJson(settingsFile, {}) });
    if (isDataApi(request.url) && request.method === "PUT") {
      const payload = await body(request);
      if (!Array.isArray(payload.transactions) || typeof payload.settings !== "object" || payload.settings === null) return send(response, 400, { error: "Dados inválidos." });
      await fs.writeFile(dataFile, JSON.stringify(payload.transactions, null, 2) + "\n");
      await fs.writeFile(settingsFile, JSON.stringify(payload.settings, null, 2) + "\n");
      return send(response, 200, { ok: true });
    }

    const requested = request.url === "/" ? "index.html" : request.url.split("?")[0].replace(/^\/+/, "");
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

server.listen(port, () => console.log(`Clareza disponível em http://localhost:${port}`));
