import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFinancialPeriod, compareFinancialPeriods } from "../../src/shared/financial-insights.js";

const transactions = [
  { id: "1", date: "2026-05-02", amount: 100, type: "expense", expenseType: "Casa", location: "Casa", description: "Aluguel" },
  { id: "2", date: "2026-05-05", amount: 40, type: "expense", expenseType: "Mercado", location: "Casa", description: "Mercado" },
  { id: "3", date: "2026-04-05", amount: 20, type: "expense", expenseType: "Mercado", location: "Casa", description: "Mercado" },
  { id: "4", date: "2026-05-07", amount: 80, type: "expense", expenseType: "Evento", location: "Buffet", description: "Buffet", },
];
const incomes = [
  { id: "5", date: "2026-05-10", amount: 300, type: "income", source: "Salário", description: "salário" },
  { id: "6", date: "2026-05-11", amount: 150, type: "income", source: "Buffet", product: "Buffet", description: "cliente" },
];

test("calcula agregados, variações, concentração e dias sem misturar Buffet", () => {
  const result = analyzeFinancialPeriod({ transactions, incomes, month: "2026-05" });
  assert.deepEqual(result.totals, { income: 300, expense: 140, balance: 160, count: 3 });
  assert.equal(result.buffet.totals.income, 150);
  assert.equal(result.buffet.totals.expense, 80);
  assert.equal(result.concentration.expensesByCategory[0].label, "Casa");
  assert.equal(result.recurrence.length, 0);
  assert.equal(result.previousTotals.expense, 20);
});

test("não duplica receitas quando transactions também contém incomes", () => {
  const income = { id: "income-1", date: "2026-05-02", amount: 100, type: "income", source: "Salário" };
  const result = analyzeFinancialPeriod({
    transactions: [income, { id: "expense-1", date: "2026-05-03", amount: 40, type: "expense", expenseType: "Casa" }],
    incomes: [income],
    month: "2026-05",
  });
  assert.deepEqual(result.totals, { income: 100, expense: 40, balance: 60, count: 2 });
});

test("mantém recorrência agregada sem expor descrições", () => {
  const result = analyzeFinancialPeriod({ transactions: [...transactions, { id: "7", date: "2026-05-12", amount: 40, type: "expense", expenseType: "Mercado", location: "Casa", description: "nome sensível" }], incomes, month: "2026-05" });
  assert.equal(result.recurrence[0].label, "Mercado");
  assert.equal("description" in result.recurrence[0], false);
  assert.equal(JSON.stringify(result.recurrence).includes("nome sensível"), false);
});

test("rejeita período inválido", () => {
  assert.throws(() => analyzeFinancialPeriod({ month: "maio" }), /YYYY-MM/);
});

test("gera alertas e comparação de períodos sem misturar Buffet", () => {
  const result = compareFinancialPeriods({
    transactions: [...transactions, { id: "8", date: "2026-03-02", amount: 10, type: "expense", expenseType: "Casa", location: "Casa" }],
    incomes,
    month: "2026-05",
    periods: 3,
  });
  assert.equal(result.periods.length, 3);
  assert.equal(result.scope, "general");
  assert.equal(result.periods[0].totals.income, 300);
  assert.equal(result.periods[0].totals.expense, 140);
  assert.equal(result.periods.some((period) => period.period === "2026-04"), true);
  assert.equal(result.periods[0].alerts.some((alert) => alert.type === "negative_balance"), false);
});
