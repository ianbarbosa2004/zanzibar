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
  if (/(?:-|_)[a-z0-9]{6,}\.(?:js|css)$/i.test(file.name || "")) return { "Cache-Control": "public, max-age=31536000, immutable" };
  return { "Cache-Control": "no-cache" };
}

export function createHttpServer({ basePath, readData, writeCashClosing, writeCatalog, writeLimit, writeMonthlyCashClosings, writeTransaction, writeBillings, readStaticFile, auth, analyzeFinancialInsights, saveFinancialInsightHistory, readFinancialInsightHistory, logger = console }) {
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
        return send(response, 200, { authenticated: Boolean(user), user: user ? { id: user.id, email: user.email, name: user.name, givenName: user.givenName, familyName: user.familyName, picture: user.picture, lastLoginAt: user.lastLoginAt, role: user.role, authorized: user.authorized } : null });
      }
      if (auth && apiPath === "/api/auth/logout" && request.method === "POST") return auth.logout(request, response);
      if (auth && apiPath === "/api/auth/heartbeat" && request.method === "POST") {
        const user = await auth.heartbeat(request);
        if (!user) return send(response, 401, { error: "Sessão expirada por inatividade." });
        response.writeHead(204, { "Cache-Control": "no-store" });
        return response.end();
      }
      const currentUser = auth ? await auth.current(request) : { role: "admin" };
      const protectedApi = apiPath.startsWith("/api/");
      if (auth && protectedApi && !currentUser) return send(response, 401, { error: "Autenticação necessária." });
      if (apiPath === "/api/data" && request.method === "GET") return send(response, 200, await readData());
      if (readFinancialInsightHistory && apiPath === "/api/financial-insights/history" && request.method === "GET") {
        return send(response, 200, { history: await readFinancialInsightHistory(currentUser.id, new URL(request.url || "/", "http://localhost").searchParams.get("limit")) });
      }
      if (analyzeFinancialInsights && apiPath === "/api/financial-insights" && (request.method === "GET" || request.method === "POST")) {
        const payload = request.method === "POST" ? await readBody(request) : Object.fromEntries(new URL(request.url || "/", "http://localhost").searchParams);
        const data = await readData();
        const result = await analyzeFinancialInsights({ data, month: payload.month, scope: payload.scope, withAi: request.method === "POST" && payload.withAi === true });
        if (request.method === "POST" && payload.saveHistory === true) {
          if (!saveFinancialInsightHistory) throw new Error("Histórico de análises não configurado.");
          const deterministic = result.deterministic || result;
          const history = await saveFinancialInsightHistory({
            userId: currentUser.id,
            period: deterministic.period,
            scope: deterministic.scope,
            indicators: deterministic,
            aiResult: result.ai || null,
            promptVersion: result.ai?.promptVersion || null,
          });
          return send(response, 201, { ...result, history });
        }
        return send(response, 200, result);
      }
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
      return send(response, error.statusCode || 503, { error: error.message || "MySQL indisponível. Dados não foram gravados." });
    }
  });
}
