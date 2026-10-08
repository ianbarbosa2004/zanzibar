import { createServer } from "node:http";

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
  const encodedContentType = /^(application\/json|text\/)/.test(contentType) && !contentType.includes("charset")
    ? `${contentType}; charset=utf-8`
    : contentType;
  response.writeHead(status, { "Content-Type": encodedContentType, "Cache-Control": "no-store" });
  const body = Buffer.isBuffer(payload) || payload instanceof Uint8Array
    ? payload
    : contentType === "application/json"
      ? JSON.stringify(payload)
      : payload;
  response.end(body);
}

export function createHttpServer({ basePath, readData, writeCashClosing, writeCatalog, writeLimit, writeMonthlyCashClosings, writeTransaction, writeBillings, readStaticFile, logger = console }) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", "http://localhost").pathname;
      const apiPath = requestPath(request.url, basePath);
      if (request.method === "GET" && basePath !== "/" && pathname === basePath) {
        response.writeHead(308, { Location: `${basePath}/` });
        return response.end();
      }
      if (apiPath === "/api/data" && request.method === "GET") return send(response, 200, await readData());
      if (apiPath === "/api/cash-closings" && request.method === "PUT") {
        const payload = await readBody(request);
        await writeCashClosing(payload.date, payload.items || []);
        return send(response, 200, { ok: true });
      }
      if (apiPath === "/api/monthly-cash-closings" && request.method === "PUT") {
        const payload = await readBody(request);
        await writeMonthlyCashClosings(payload.items || []);
        return send(response, 200, { ok: true });
      }
      if (apiPath === "/api/billings" && request.method === "PUT") {
        const billings = await writeBillings();
        return send(response, 200, { ok: true, billings });
      }
      if (apiPath === "/api/transactions" && request.method === "PUT") {
        await writeTransaction(await readBody(request));
        return send(response, 200, { ok: true });
      }
      if (apiPath === "/api/limits" && request.method === "PUT") {
        await writeLimit(await readBody(request));
        return send(response, 200, { ok: true });
      }
      if (apiPath === "/api/catalogs" && request.method === "PUT") {
        await writeCatalog(await readBody(request));
        return send(response, 200, { ok: true });
      }
      const requested = apiPath === "/" ? "index.html" : apiPath.replace(/^\/+/, "");
      const file = await readStaticFile(requested);
      if (!file) return send(response, 404, { error: "Não encontrado." });
      return send(response, 200, file.body, file.contentType);
    } catch (error) {
      logger.error(error);
      return send(response, 503, { error: error.message || "MySQL indisponível. Dados não foram gravados." });
    }
  });
}
