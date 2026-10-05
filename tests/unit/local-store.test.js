import assert from "node:assert/strict";
import test from "node:test";
import { readLocalState, writeLocalState } from "../../src/client/local-store.js";

function withLocalStorage() {
  const values = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
  return () => { globalThis.localStorage = original; };
}

test("lê estado local usando valores padrão", () => {
  const restore = withLocalStorage();
  try {
    assert.deepEqual(readLocalState({ transactions: [], incomes: [], expenseTypes: ["Outros"], takers: [], locations: [], creditors: [], incomeSources: ["Salário"], cashClosings: [] }), {
      transactions: [],
      incomes: [],
      expenseTypes: ["Outros"],
      takers: [],
      locations: [],
      creditors: [],
      incomeSources: ["Salário"],
      cashClosings: [],
    });
  } finally {
    restore();
  }
});

test("grava e recupera o estado local", () => {
  const restore = withLocalStorage();
  try {
    const state = { transactions: [{ id: "1" }], incomes: [], expenseTypes: [], takers: [], locations: [], creditors: [], incomeSources: [], cashClosings: [] };
    writeLocalState(state);
    assert.deepEqual(readLocalState(state), state);
  } finally {
    restore();
  }
});
