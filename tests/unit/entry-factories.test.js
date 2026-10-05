import assert from "node:assert/strict";
import test from "node:test";
import { createExpenseEntry, createIncomeEntry, upsertEntry } from "../../src/shared/entry-factories.js";

const cryptoApi = { randomUUID: () => "generated-id" };

test("cria despesa com campos específicos", () => {
  assert.deepEqual(createExpenseEntry({
    description: "  Mercado  ", amount: 42, expenseType: "Alimentação", taker: "Pessoal",
    location: "Casa", creditor: "Caixa", date: "2026-10-05",
  }, "", cryptoApi), {
    id: "generated-id", description: "Mercado", amount: 42, type: "expense",
    expenseType: "Alimentação", taker: "Pessoal", location: "Casa", creditor: "Caixa", date: "2026-10-05",
  });
});

test("cria receita com fonte e preserva id na edição", () => {
  assert.deepEqual(createIncomeEntry({ description: "Salário", amount: 100, source: "Salário", date: "2026-10-05" }, "income-1", cryptoApi), {
    id: "income-1", description: "Salário", amount: 100, type: "income", source: "Salário", date: "2026-10-05",
  });
});

test("insere ou atualiza lançamento pelo id", () => {
  const original = [{ id: "1", amount: 10 }];
  assert.deepEqual(upsertEntry(original, { id: "2", amount: 20 }), [{ id: "2", amount: 20 }, ...original]);
  assert.deepEqual(upsertEntry(original, { id: "1", amount: 30 }), [{ id: "1", amount: 30 }]);
});
