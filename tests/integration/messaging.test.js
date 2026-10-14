import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createHttpServer } from "../../src/server/http-server.js";

function startMessagingServer() {
  const calls = [];
  const server = createHttpServer({
    basePath: "/clareza",
    auth: {
      current: async () => ({ id: 7, role: "user", authorized: true }),
    },
    readData: async () => ({}),
    writeCashClosing: async () => {},
    writeMonthlyCashClosings: async () => {},
    writeTransaction: async () => {},
    writeLimit: async () => {},
    writeCatalog: async () => {},
    writeBillings: async () => [],
    readStaticFile: async () => null,
    listMessagingUsers: async (userId) => [{ id: 8, email: "other@example.com", name: "Outro", userId }],
    readMessagingConversations: async () => [{ id: 12, participant: { id: 8, name: "Outro" }, lastMessage: null }],
    saveMessagingConversation: async (input) => ({ id: 12, ...input }),
    readMessagingMessages: async () => [{ id: 1, senderId: 8, body: "Olá", files: [] }],
    saveMessage: async (input) => { calls.push(input); return { id: 2, ...input }; },
    logger: { error: () => {} },
  });
  return { server, calls };
}

test("protege e expõe rotas de mensagens privadas", async (t) => {
  const { server, calls } = startMessagingServer();
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const port = server.address().port;
  const base = `http://localhost:${port}/clareza/api/messaging`;

  const users = await fetch(`${base}/users`);
  assert.equal(users.status, 200);
  assert.deepEqual((await users.json()).users[0].id, 8);

  const conversation = await fetch(`${base}/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: 8 }) });
  assert.equal(conversation.status, 201);
  assert.equal((await conversation.json()).conversation.userId, 7);

  const messages = await fetch(`${base}/conversations/12/messages`);
  assert.equal(messages.status, 200);
  assert.equal((await messages.json()).messages[0].body, "Olá");

  const sent = await fetch(`${base}/conversations/12/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "Tudo bem?", fileIds: [] }) });
  assert.equal(sent.status, 201);
  assert.deepEqual(calls[0], { userId: 7, conversationId: 12, body: "Tudo bem?", fileIds: [] });
});

test("rejeita mensagens sem autenticação", async (t) => {
  const server = createHttpServer({
    basePath: "/clareza",
    auth: { current: async () => null },
    readData: async () => ({}),
    readStaticFile: async () => null,
    logger: { error: () => {} },
  });
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const response = await fetch(`http://localhost:${server.address().port}/clareza/api/messaging/conversations`);
  assert.equal(response.status, 401);
});
