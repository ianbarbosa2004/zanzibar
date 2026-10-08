import assert from "node:assert/strict";
import test from "node:test";
import { loadAppState } from "../../src/client/state-service.js";

const defaults = {
  expenseTypes: ["Outros"],
  takers: ["Pessoal"],
  locations: ["Casa"],
  creditors: ["Caixa"],
  incomeSources: ["Salário"],
};

test("carrega e normaliza dados pela API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ transactions: [{ id: "e1", amount: 10 }], settings: {} }),
  });
  try {
    const state = await loadAppState("/api/data", "./data.json", defaults);
    assert.equal(state.transactions[0].type, "expense");
    assert.equal(state.transactions[0].expenseType, "Outros");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
