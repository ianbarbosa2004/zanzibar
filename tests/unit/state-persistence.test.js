import assert from "node:assert/strict";
import test from "node:test";
import { dataPayload, defaultAppState } from "../../src/client/state-persistence.js";

test("cria estado inicial independente dos defaults", () => {
  const defaults = { expenseTypes: ["Outros"], takers: ["Pessoal"], locations: ["Casa"], creditors: ["Caixa"], incomeSources: ["Salário"] };
  const state = defaultAppState(defaults);
  state.expenseTypes.push("Casa");
  assert.deepEqual(defaults.expenseTypes, ["Outros"]);
});

test("monta payload da API com configurações agrupadas", () => {
  const state = { transactions: [{ id: "1" }], incomes: [], cashClosings: [], catalogMetadata: {}, expenseTypes: ["Outros"], takers: [], locations: [], creditors: [], incomeSources: ["Salário"] };
  assert.deepEqual(dataPayload(state), {
    transactions: [{ id: "1" }],
    incomes: [],
    cashClosings: [],
    settings: { expenseTypes: ["Outros"], takers: [], locations: [], creditors: [], incomeSources: ["Salário"], catalogMetadata: {} },
  });
});
