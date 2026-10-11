import assert from "node:assert/strict";
import test from "node:test";
import { buffetDailyClosings, buffetEntries, buffetMonthlyClosings, isBuffetEntry } from "../../src/shared/buffet.js";

const transactions = [
  { id: "e1", type: "expense", location: "Buffet", date: "2026-10-02", amount: 30 },
  { id: "e2", type: "expense", location: "Casa", date: "2026-10-02", amount: 10 },
];
const incomes = [
  { id: "i1", type: "income", source: "Buffet", date: "2026-10-02", amount: 100 },
  { id: "i2", type: "income", source: "Salário", date: "2026-10-01", amount: 500 },
];

test("separa somente as movimentações do Buffet", () => {
  assert.deepEqual(buffetEntries(transactions, incomes).map((item) => item.id), ["e1", "i1"]);
  assert.equal(isBuffetEntry(transactions[1]), false);
});

test("calcula fechamento diário automaticamente", () => {
  assert.deepEqual(buffetDailyClosings(buffetEntries(transactions, incomes)), [{
    date: "2026-10-02", income: 100, expense: 30, incomeCount: 1, expenseCount: 1, balance: 70, count: 2,
  }]);
});

test("calcula fechamento mensal automaticamente", () => {
  assert.deepEqual(buffetMonthlyClosings(buffetEntries(transactions, incomes)), [{
    month: "2026-10", income: 100, expense: 30, incomeCount: 1, expenseCount: 1, balance: 70, count: 2,
  }]);
});
