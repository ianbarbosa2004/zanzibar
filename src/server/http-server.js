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

function send(response, status, payload, contentType = "application/json", headers = {}) {
  const encodedContentType = /^(application\/json|text\/)/.test(contentType) && !contentType.includes("charset")
    ? `${contentType}; charset=utf-8`
    : contentType;
  response.writeHead(status, { "Content-Type": encodedContentType, "Cache-Control": "no-store", ...headers });
  const body = Buffer.isBuffer(payload) || payload instanceof Uint8Array
    ? payload
    : contentType === "application/json"
      ? JSON.stringify(payload)
      : payload;
  response.end(body);
}

function staticCacheHeaders(file) {
  if (file.contentType === "text/html") return { "Cache-Control": "no-cache, no-store, must-revalidate", Pragma: "no-cache", Expires: "0" };
  if (/\.[a-f0-9_-]{6,}\.(?:js|css)$/i.test(file.name || "")) return { "Cache-Control": "public, max-age=31536000, immutable" };
  return { "Cache-Control": "no-cache" };
}

export function createHttpServer({ basePath, readData, writeCashClosing, writeCatalog, writeLimit, writeMonthlyCashClosings, writeTransaction, writeBillings, readStaticFile, auth, logger = console }) {
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || "/", "http://localhost").pathname;
      const apiPath = requestPath(request.url, basePath);
      if (request.method === "GET" && basePath !== "/" && pathname === basePath) {
        response.writeHead(308, { Location: `${basePath}/` });
        return response.end();
      }
      if (auth && apiPath === "/auth/google" && request.method === "GET") return auth.begin(request, response);
      if (auth && apiPath === "/auth/google/callback" && request.method === "GET") return await auth.callback(request, response);
      if (auth && apiPath === "/api/auth/me" && request.method === "GET") {
        const user = await auth.current(request);
        return send(response, 200, { authenticated: Boolean(user), user: user ? { id: user.id, email: user.email, name: user.name, picture: user.picture, role: user.role, authorized: user.authorized } : null });
      }
      if (auth && apiPath === "/api/auth/logout" && request.method === "POST") return auth.logout(request, response);
      const currentUser = auth ? await auth.current(request) : { role: "admin" };
      const protectedApi = apiPath.startsWith("/api/");
      if (auth && protectedApi && !currentUser) return send(response, 401, { error: "Autenticação necessária." });
      if (apiPath === "/api/data" && request.method === "GET") return send(response, 200, await readData());
      if (apiPath === "/api/auth/users" && request.method === "GET") {
        if (currentUser.role !== "admin") return send(response, 403, { error: "Acesso restrito ao administrador." });
        return send(response, 200, { users: await auth.users() });
      }
      if (apiPath === "/api/auth/users" && request.method === "PUT") {
        if (currentUser.role !== "admin") return send(response, 403, { error: "Acesso restrito ao administrador." });
        const payload = await readBody(request);
        return send(response, 200, { user: await auth.authorize(payload.email, payload.authorized) });
      }
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
      return send(response, 200, file.body, file.contentType, staticCacheHeaders(file));
    } catch (error) {
      logger.error(error);
      return send(response, 503, { error: error.message || "MySQL indisponível. Dados não foram gravados." });
    }
  });
}
