import { createServer } from "node:http";
import { readStaticFile } from "./src/server/static-files.js";
import { basePath, port } from "./src/server/config.js";
import { dbPool, initializeDataStore, readData, writeData } from "./src/server/data-store.js";
import { normalizeDataPayload } from "./src/shared/payload.js";

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
      return send(response, 200, await readData());
    }
    if (isDataApi(request.url) && request.method === "PUT") {
      let payload;
      try {
        payload = normalizeDataPayload(await body(request));
      } catch {
        return send(response, 400, { error: "Dados inválidos." });
      }
      await writeData(payload);
      return send(response, 200, { ok: true });
    }
    const normalizedPath = requestPath(request.url);
    const requested = normalizedPath === "/" ? "index.html" : normalizedPath.replace(/^\/+/, "");
    const file = await readStaticFile(requested);
    if (!file) return send(response, 404, { error: "Não encontrado." });
    return send(response, 200, file.body, file.contentType);
  } catch (error) {
    console.error(error);
    return send(response, 500, { error: "Erro interno ao salvar os dados." });
  }
});

initializeDataStore().then(() => {
  server.listen(port, () => console.log(`Clareza disponível em http://localhost:${port}${dbPool ? " (MySQL)" : ""}`));
}).catch((error) => {
  console.error("Não foi possível inicializar o banco de dados.", error);
  process.exitCode = 1;
});
