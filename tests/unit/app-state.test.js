import assert from "node:assert/strict";
import test from "node:test";
import { createAppState } from "../../src/client/app-state.js";

const defaults = {
  expenseTypes: ["Outros"],
  takers: ["Pessoal"],
  locations: ["Casa"],
  creditors: ["Caixa"],
  incomeSources: ["Salário"],
};

test("normaliza dados unificados e separa receitas", () => {
  const state = createAppState({
    transactions: [
      { id: "e1", description: "Conta", amount: 20 },
      { id: "i1", type: "income", description: "Salário", amount: 100 },
    ],
    settings: {},
  }, defaults);
  assert.equal(state.transactions[0].expenseType, "Outros");
  assert.equal(state.incomes[0].id, "i1");
});

test("remove receita duplicada quando aparece nas listas unificada e separada", () => {
  const state = createAppState({
    transactions: [{ id: "i1", type: "income", description: "Salário", amount: 100 }],
    incomes: [{ id: "i1", description: "Salário", amount: 100 }],
    settings: {},
  }, defaults);
  assert.equal(state.incomes.length, 1);
  assert.equal(state.incomes[0].id, "i1");
});

test("usa catálogos padrão quando a API não retorna opções", () => {
  const state = createAppState({ transactions: [], settings: {} }, defaults);
  assert.deepEqual(state.incomeSources, ["Salário"]);
  assert.deepEqual(state.locations, ["Casa"]);
});
