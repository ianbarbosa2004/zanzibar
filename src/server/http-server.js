import { createServer } from "node:http";
import { normalizeDataPayload } from "../shared/payload.js";

function requestPath(url, basePath) {
  const pathname = new URL(url || "/", "http://localhost").pathname;
  if (basePath !== "/" && pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length) || "/";
  return pathname;
}

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw || "{}");
}

function send(response, status, payload, contentType = "application/json") {
  response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  response.end(contentType === "application/json" ? JSON.stringify(payload) : payload);
}

export function createHttpServer({ basePath, readData, writeData, readStaticFile, logger = console }) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", "http://localhost").pathname;
      const apiPath = requestPath(request.url, basePath);
      if (request.method === "GET" && basePath !== "/" && pathname === basePath) {
        response.writeHead(308, { Location: `${basePath}/` });
        return response.end();
      }
      if (apiPath === "/api/data" && request.method === "GET") return send(response, 200, await readData());
      if (apiPath === "/api/data" && request.method === "PUT") {
        let payload;
        try {
          payload = normalizeDataPayload(await readBody(request));
        } catch {
          return send(response, 400, { error: "Dados inválidos." });
        }
        await writeData(payload);
        return send(response, 200, { ok: true });
      }
      const requested = apiPath === "/" ? "index.html" : apiPath.replace(/^\/+/, "");
      const file = await readStaticFile(requested);
      if (!file) return send(response, 404, { error: "Não encontrado." });
      return send(response, 200, file.body, file.contentType);
    } catch (error) {
      logger.error(error);
      return send(response, 500, { error: "Erro interno ao salvar os dados." });
    }
  });
}
