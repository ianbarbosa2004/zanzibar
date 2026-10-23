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

async function readRawBody(request, limit = 12 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Arquivo maior que o limite permitido.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseMultipart(body, contentType) {
  const boundary = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) throw new Error("Upload multipart inválido.");
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    const next = body.indexOf(delimiter, start + delimiter.length);
    if (next === -1) break;
    const part = body.subarray(start + delimiter.length, next);
    const content = part.subarray(part.indexOf(Buffer.from("\r\n")) + 2);
    if (content.length > 2) {
      const separator = content.indexOf(Buffer.from("\r\n\r\n"));
      if (separator !== -1) {
        const headers = content.subarray(0, separator).toString("utf8");
        const data = content.subarray(separator + 4, content.length - 2);
        const disposition = headers.match(/Content-Disposition:[^\r\n]*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
        if (disposition) parts.push({ name: disposition[1], filename: disposition[2] || "", mimeType: headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream", data });
      }
    }
    start = next;
  }
  return parts;
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

export function createHttpServer({ basePath, readData, writeCashClosing, writeCatalog, writeLimit, writeMonthlyCashClosings, writeTransaction, writeBillings, writeTask, listTasks, archiveTask, readStaticFile, listMarkdownFiles, readMarkdownFile, auth, analyzeFinancialInsights, compareFinancialInsights, askFinancialQuestion, saveFinancialInsightHistory, readFinancialInsightHistory, listMessagingUsers, readMessagingConversations, readMessagingFile, readMessagingMessages, saveMessageFile, saveMessage, saveMessagingConversation, markMessagingConversationRead, createTelegramLinkCode, consumeTelegramLink, sendTelegramTest, telegramBotToken = "", telegramWebhookSecret = "", logger = console }) {
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
      if (consumeTelegramLink && apiPath === "/api/telegram/webhook" && request.method === "POST") {
        if (!telegramWebhookSecret || request.headers["x-telegram-bot-api-secret-token"] !== telegramWebhookSecret) return send(response, 403, { error: "Webhook Telegram não autorizado." });
        const update = await readBody(request);
        const text = update.message?.text || "";
        const match = String(text).match(/^\/vincular(?:@\w+)?\s+([A-Z0-9]{8})$/i);
        if (match) await consumeTelegramLink({ code: match[1], chatId: update.message.chat.id, username: update.message.from?.username || null });
        return send(response, 200, { ok: true });
      }
      const currentUser = auth ? await auth.current(request) : { role: "admin" };
      const protectedApi = apiPath.startsWith("/api/");
      if (auth && protectedApi && !currentUser) return send(response, 401, { error: "Autenticação necessária." });
      if (createTelegramLinkCode && apiPath === "/api/telegram/link-code" && request.method === "POST") return send(response, 200, await createTelegramLinkCode(currentUser.id));
      if (sendTelegramTest && apiPath === "/api/telegram/test" && request.method === "POST") return send(response, 200, await sendTelegramTest({ userId: currentUser.id, token: telegramBotToken }));
      const documentationPath = new URL(request.url || "/", "http://localhost").searchParams.get("path");
      if (listMarkdownFiles && apiPath === "/api/documentation" && !documentationPath && request.method === "GET") return send(response, 200, { files: await listMarkdownFiles() });
      const markdownFile = apiPath.match(/^\/api\/documentation\/(.+)$/);
      if ((markdownFile || documentationPath) && readMarkdownFile && request.method === "GET") {
        const file = await readMarkdownFile(documentationPath || decodeURIComponent(markdownFile[1]));
        if (!file) return send(response, 404, { error: "Documento não encontrado." });
        return send(response, 200, file);
      }
      if (listMessagingUsers && apiPath === "/api/messaging/users" && request.method === "GET") return send(response, 200, { users: await listMessagingUsers(currentUser.id) });
      if (readMessagingConversations && apiPath === "/api/messaging/conversations" && request.method === "GET") return send(response, 200, { conversations: await readMessagingConversations(currentUser.id) });
      if (saveMessagingConversation && apiPath === "/api/messaging/conversations" && request.method === "POST") {
        const payload = await readBody(request);
        return send(response, 201, { conversation: await saveMessagingConversation({ userId: currentUser.id, participantId: payload.participantId }) });
      }
      const conversationRead = apiPath.match(/^\/api\/messaging\/conversations\/(\d+)\/read$/);
      if (conversationRead && markMessagingConversationRead && request.method === "POST") return send(response, 200, { read: await markMessagingConversationRead(currentUser.id, Number(conversationRead[1])) });
      const conversationMessages = apiPath.match(/^\/api\/messaging\/conversations\/(\d+)\/messages$/);
      if (conversationMessages && readMessagingMessages && request.method === "GET") return send(response, 200, { messages: await readMessagingMessages(currentUser.id, Number(conversationMessages[1]), new URL(request.url || "/", "http://localhost").searchParams.get("limit")) });
      if (conversationMessages && saveMessage && request.method === "POST") {
        const payload = await readBody(request);
        return send(response, 201, { message: await saveMessage({ userId: currentUser.id, conversationId: Number(conversationMessages[1]), body: payload.body, fileIds: payload.fileIds }) });
      }
      if (saveMessageFile && apiPath === "/api/messaging/files" && request.method === "POST") {
        const parts = parseMultipart(await readRawBody(request), request.headers["content-type"]);
        const file = parts.find((part) => part.filename);
        if (!file) {
          const error = new Error("Selecione um arquivo.");
          error.statusCode = 400;
          throw error;
        }
        return send(response, 201, { file: await saveMessageFile({ userId: currentUser.id, originalName: file.filename, mimeType: file.mimeType, data: file.data }) });
      }
      const messageFile = apiPath.match(/^\/api\/messaging\/files\/(\d+)$/);
      if (messageFile && readMessagingFile && request.method === "GET") {
        const file = await readMessagingFile(currentUser.id, Number(messageFile[1]));
        return send(response, 200, file.data, file.mimeType, { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}` });
      }
      if (apiPath === "/api/data" && request.method === "GET") return send(response, 200, await readData());
      if (listTasks && apiPath === "/api/tasks" && request.method === "GET") {
        const date = new URL(request.url || "/", "http://localhost").searchParams.get("date");
        return send(response, 200, { tasks: await listTasks(currentUser.id, date) });
      }
      if (writeTask && apiPath === "/api/tasks" && request.method === "POST") {
        return send(response, 201, { task: await writeTask(currentUser.id, await readBody(request)) });
      }
      const taskPath = apiPath.match(/^\/api\/tasks\/(\d+)$/);
      if (taskPath && archiveTask && request.method === "PUT") {
        return send(response, 200, { task: await archiveTask(currentUser.id, Number(taskPath[1])) });
      }
      if (compareFinancialInsights && apiPath === "/api/financial-insights/compare" && request.method === "GET") {
        const query = new URL(request.url || "/", "http://localhost").searchParams;
        return send(response, 200, await compareFinancialInsights({
          data: await readData(),
          month: query.get("month"),
          scope: query.get("scope") || "general",
          periods: query.get("periods") || 3,
        }));
      }
      if (askFinancialQuestion && apiPath === "/api/financial-insights/ask" && request.method === "POST") {
        const payload = await readBody(request);
        return send(response, 200, await askFinancialQuestion({
          data: await readData(),
          month: payload.month,
          scope: payload.scope || "general",
          question: payload.question,
        }));
      }
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
