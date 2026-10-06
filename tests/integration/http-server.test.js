import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createHttpServer } from "../../src/server/http-server.js";

function startServer() {
  let writes = [];
  const server = createHttpServer({
    basePath: "/clareza",
    readData: async () => ({ transactions: [], incomes: [], settings: {} }),
    writeData: async (payload) => writes.push(payload),
    readStaticFile: async (file) => file === "index.html"
      ? { body: Buffer.from("<main>ok</main>"), contentType: "text/html" }
      : null,
    logger: { error: () => {} },
  });
  return { server, writes };
}

test("serve arquivos JSON estáticos sem serializar o buffer", async (t) => {
  const staticServer = createHttpServer({
    basePath: "/clareza",
    readData: async () => ({}),
    writeData: async () => {},
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

test("serve dados e rejeita payload inválido pela API", async (t) => {
  const { server } = startServer();
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  const response = await fetch(`http://localhost:${port}/clareza/api/data`, { method: "PUT", body: "{}" });
  assert.equal(response.status, 400);
});

test("aceita payload válido e encaminha para persistência", async (t) => {
  const { server, writes } = startServer();
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  const response = await fetch(`http://localhost:${port}/clareza/api/data`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions: [], incomes: [], settings: {} }),
  });
  assert.equal(response.status, 200);
  assert.equal(writes.length, 1);
});
