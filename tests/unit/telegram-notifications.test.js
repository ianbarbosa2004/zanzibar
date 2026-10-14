import assert from "node:assert/strict";
import test from "node:test";
import { sendTelegramDocument, sendTelegramMessage } from "../../src/server/telegram-notifications.js";

test("envia texto ao método Telegram sendMessage", async () => {
  let request;
  await sendTelegramMessage({
    token: "token-nao-logado",
    chatId: 123,
    text: "Nova mensagem",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.equal(request.url, "https://api.telegram.org/bottoken-nao-logado/sendMessage");
  assert.deepEqual(JSON.parse(request.options.body), { chat_id: "123", text: "Nova mensagem" });
});

test("envia arquivo ao método Telegram sendDocument", async () => {
  let request;
  await sendTelegramDocument({
    token: "token-nao-logado",
    chatId: 123,
    caption: "Novo arquivo",
    file: { name: "teste.txt", mimeType: "text/plain", bytes: Buffer.from("conteudo") },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.equal(request.url, "https://api.telegram.org/bottoken-nao-logado/sendDocument");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body.get("chat_id"), "123");
  assert.equal(request.options.body.get("caption"), "Novo arquivo");
  assert.equal(request.options.body.get("document").name, "teste.txt");
});
