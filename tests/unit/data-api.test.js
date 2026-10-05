import assert from "node:assert/strict";
import test from "node:test";
import { fetchData, saveData } from "../../src/client/data-api.js";

test("fetchData retorna o JSON da API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ transactions: [] }) });
  try {
    assert.deepEqual(await fetchData("/api/data"), { transactions: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchData informa falha HTTP", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    await assert.rejects(fetchData("/api/data"), /503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saveData envia payload JSON e retorna a resposta", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = options;
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    assert.deepEqual(await saveData("/api/data", { transactions: [] }), { ok: true });
    assert.equal(request.method, "PUT");
    assert.equal(request.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(request.body), { transactions: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
