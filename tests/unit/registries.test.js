import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteRegistry, hasRegistryName, renameRegistry } from "../../src/shared/registries.js";

const state = {
  transactions: [{ id: "e1", expenseType: "Casa" }],
  incomes: [{ id: "i1", source: "Salário" }],
  expenseTypes: ["Casa", "Outros"],
  takers: ["Pessoal"],
  locations: ["Casa"],
  creditors: ["Caixa"],
  incomeSources: ["Salário", "Freelance"],
};

test("detecta nomes repetidos ignorando maiúsculas", () => {
  assert.equal(hasRegistryName(["Casa", "Outros"], "casa"), true);
  assert.equal(hasRegistryName(["Casa", "Outros"], "casa", 0), false);
});

test("renomeia cadastro e atualiza os lançamentos vinculados", () => {
  const result = renameRegistry("type", "Casa", "Moradia", state);
  assert.deepEqual(result.expenseTypes, ["Moradia", "Outros"]);
  assert.equal(result.transactions[0].expenseType, "Moradia");
});

test("impede excluir cadastro vinculado", () => {
  assert.equal(canDeleteRegistry("type", "Casa", state), false);
  assert.equal(canDeleteRegistry("type", "Outros", state), true);
  assert.equal(canDeleteRegistry("incomeSource", "Salário", state), false);
});
