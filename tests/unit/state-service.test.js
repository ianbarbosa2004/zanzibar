import assert from "node:assert/strict";
import test from "node:test";
import { loadAppState, persistAppState } from "../../src/client/state-service.js";

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

test("persistAppState propaga falhas da API para permitir rollback visual", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: "Erro interno" }) });
  try {
    await assert.rejects(
      persistAppState("/api/data", {
        transactions: [],
        incomes: [],
        cashClosings: [],
        expenseTypes: [],
        takers: [],
        locations: [],
        creditors: [],
        paymentMethods: [],
        incomeSources: [],
        catalogMetadata: {},
      }),
      /API indisponível: 500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  }
});
