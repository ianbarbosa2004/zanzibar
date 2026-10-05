import assert from "node:assert/strict";
import test from "node:test";
import { groupTotals, inMonth, summarize } from "../../src/shared/finance.js";

const entries = [
  { id: "e1", date: "2026-10-02", type: "expense", amount: 30, expenseType: "Casa" },
  { id: "i1", date: "2026-10-03", type: "income", amount: 100, source: "Salário" },
  { id: "e2", date: "2026-09-30", type: "expense", amount: 20, expenseType: "Casa" },
];

test("filtra movimentações pelo mês", () => {
  assert.deepEqual(inMonth(entries, "2026-10").map(({ id }) => id), ["e1", "i1"]);
});

test("calcula despesas, receitas e saldo", () => {
  assert.deepEqual(summarize(entries, "2026-10"), {
    items: [entries[0], entries[1]],
    expense: 30,
    income: 100,
    balance: 70,
  });
});

test("agrupa totais por propriedade", () => {
  assert.deepEqual(groupTotals(entries.filter((item) => item.type === "expense"), "expenseType"), [["Casa", 50]]);
});
