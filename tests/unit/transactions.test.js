import assert from "node:assert/strict";
import test from "node:test";
import { mergeTransactions, normalizeTransaction, splitTransactions } from "../../src/shared/transactions.js";

test("normaliza tipo e valor da movimentação", () => {
  assert.deepEqual(normalizeTransaction({ id: "1", amount: "12.50" }), {
    id: "1",
    amount: 12.5,
    type: "expense",
  });
  assert.equal(normalizeTransaction({ type: "income", amount: "8" }).type, "income");
});

test("separa receitas e despesas de uma coleção unificada", () => {
  const result = splitTransactions([
    { id: "expense-1", type: "expense", amount: 10 },
    { id: "income-1", type: "income", amount: 25 },
  ]);
  assert.deepEqual(result.transactions.map(({ id }) => id), ["expense-1"]);
  assert.deepEqual(result.incomes.map(({ id }) => id), ["income-1"]);
});

test("une coleções sem duplicar uma movimentação pelo id", () => {
  const result = mergeTransactions(
    [{ id: "same", type: "expense", amount: 10 }],
    [{ id: "same", description: "duplicada", amount: 20 }],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "expense");
});
