import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createHttpServer } from "../../src/server/http-server.js";

function startServer() {
  const server = createHttpServer({
    basePath: "/clareza",
    readData: async () => ({ transactions: [], incomes: [], settings: {} }),
    writeCashClosing: async () => {},
    writeMonthlyCashClosings: async () => {},
    writeTransaction: async () => {},
    writeLimit: async () => {},
    writeCatalog: async () => {},
    writeBillings: async () => [],
    readStaticFile: async (file) => file === "index.html"
      ? { body: Buffer.from("<main>ok</main>"), contentType: "text/html" }
      : null,
    logger: { error: () => {} },
  });
  return { server };
}

test("serve arquivos JSON estáticos sem serializar o buffer", async (t) => {
  const staticServer = createHttpServer({
    basePath: "/clareza",
    readData: async () => ({}),
    writeCashClosing: async () => {},
    writeMonthlyCashClosings: async () => {},
    writeTransaction: async () => {},
    writeLimit: async () => {},
    writeCatalog: async () => {},
    writeBillings: async () => [],
    readStaticFile: async (file) => file === "deploy-version.json"
      ? { body: Buffer.from('{"commit":"abc"}'), contentType: "application/json" }
      : null,
    logger: { error: () => {} },
  });
  t.after(() => staticServer.close());
  staticServer.listen(0);
  await once(staticServer, "listening");
  const staticPort = staticServer.address().port;
  const staticResponse = await fetch(`http://localhost:${staticPort}/clareza/deploy-version.json`);
  assert.equal(staticResponse.status, 200);
  assert.deepEqual(await staticResponse.json(), { commit: "abc" });
});

test("serve dados pela API", async (t) => {
  const { server } = startServer();
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  const response = await fetch(`http://localhost:${port}/clareza/api/data`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { transactions: [], incomes: [], settings: {} });
});

test("lista e abre documentos Markdown sem expor a rota como download", async (t) => {
  const documentationServer = createHttpServer({
    basePath: "/clareza",
    auth: { current: async () => ({ id: 7, role: "user", authorized: true }) },
    listMarkdownFiles: async () => ["README.md", "docs/DEPLOYMENT.md"],
    readMarkdownFile: async (path) => path === "README.md"
      ? { path, content: "# Clareza" }
      : path === "docs/DEPLOYMENT.md"
        ? { path, content: "# Deploy" }
        : null,
    readData: async () => ({}),
    readStaticFile: async () => null,
    logger: { error: () => {} },
  });
  t.after(() => documentationServer.close());
  documentationServer.listen(0);
  await once(documentationServer, "listening");
  const base = `http://localhost:${documentationServer.address().port}/clareza/api/documentation`;
  const list = await fetch(base);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).files, ["README.md", "docs/DEPLOYMENT.md"]);
  const document = await fetch(`${base}/README.md`);
  assert.equal(document.status, 200);
  assert.deepEqual(await document.json(), { path: "README.md", content: "# Clareza" });
  const nestedDocument = await fetch(`${base}?path=${encodeURIComponent("docs/DEPLOYMENT.md")}`);
  assert.equal(nestedDocument.status, 200);
  assert.deepEqual(await nestedDocument.json(), { path: "docs/DEPLOYMENT.md", content: "# Deploy" });
});

test("cria, lista e arquiva tarefas do usuário", async (t) => {
  const calls = [];
  const tasksServer = createHttpServer({
    basePath: "/clareza",
    auth: { current: async () => ({ id: 9, role: "user", authorized: true }) },
    listTasks: async (userId, date) => {
      calls.push(["list", userId, date]);
      return [{ id: 4, date, title: "Conferir caixa", status: "active", archived: false }];
    },
    writeTask: async (userId, task) => {
      calls.push(["create", userId, task]);
      return { id: 4, date: task.date, title: task.title, status: "active", archived: false };
    },
    archiveTask: async (userId, id) => {
      calls.push(["archive", userId, id]);
      return { id, date: "2026-10-15", title: "Conferir caixa", status: "archived", archived: true };
    },
    readData: async () => ({}),
    readStaticFile: async () => null,
    logger: { error: () => {} },
  });
  t.after(() => tasksServer.close());
  tasksServer.listen(0);
  await once(tasksServer, "listening");
  const base = `http://localhost:${tasksServer.address().port}/clareza/api/tasks`;
  const created = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: "2026-10-15", title: "Conferir caixa" }) });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).task.title, "Conferir caixa");
  const listed = await fetch(`${base}?date=2026-10-15`);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).tasks[0].title, "Conferir caixa");
  const archived = await fetch(`${base}/4`, { method: "PUT" });
  assert.equal(archived.status, 200);
  assert.equal((await archived.json()).task.archived, true);
  assert.deepEqual(calls, [
    ["create", 9, { date: "2026-10-15", title: "Conferir caixa" }],
    ["list", 9, "2026-10-15"],
    ["archive", 9, 4],
  ]);
});

test("atualiza billings pela API", async (t) => {
  const server = createHttpServer({
    basePath: "/clareza",
    readData: async () => ({}),
    writeCashClosing: async () => {},
    writeMonthlyCashClosings: async () => {},
    writeTransaction: async () => {},
    writeLimit: async () => {},
    writeCatalog: async () => {},
    writeBillings: async () => [{ month: 10, year: 2026, saleCount: 4, averageTicket: 25, amount: 100 }],
    readStaticFile: async () => null,
    logger: { error: () => {} },
  });
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  const response = await fetch(`http://localhost:${port}/clareza/api/billings`, { method: "PUT" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, billings: [{ month: 10, year: 2026, saleCount: 4, averageTicket: 25, amount: 100 }] });
});
