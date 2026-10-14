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
    readMarkdownFile: async (path) => path === "README.md" ? { path, content: "# Clareza" } : null,
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
