import { isBuffetEntry } from "./buffet.js";

const monthPattern = /^\d{4}-\d{2}$/;
const amountOf = (item) => Math.max(0, Number(item?.amount || 0));
const labelOf = (item, property) => String(item?.[property] || "Sem cadastro").trim() || "Sem cadastro";
const monthDate = (month) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1, 1));
};
const previousMonth = (month) => {
  const date = monthDate(month);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};
const validMonth = (month) => monthPattern.test(String(month || ""));
const inPeriod = (item, month) => String(item?.date || "").startsWith(month);
const isIncome = (item) => item?.type === "income";
const aggregate = (items) => {
  const income = items.filter(isIncome).reduce((sum, item) => sum + amountOf(item), 0);
  const expense = items.filter((item) => !isIncome(item)).reduce((sum, item) => sum + amountOf(item), 0);
  return { income, expense, balance: income - expense, count: items.length };
};
const rankedTotals = (items, property) => {
  const totals = new Map();
  items.forEach((item) => {
    const label = labelOf(item, property);
    totals.set(label, (totals.get(label) || 0) + amountOf(item));
  });
  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
};
const dayTotals = (items) => {
  const totals = new Map();
  items.forEach((item) => {
    const date = String(item?.date || "");
    if (!date) return;
    totals.set(date, (totals.get(date) || 0) + amountOf(item));
  });
  return [...totals.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
};
const recurrence = (items, scope) => {
  const groups = new Map();
  items.forEach((item) => {
    const property = isIncome(item) ? (scope === "buffet" ? "product" : "source") : "expenseType";
    const label = labelOf(item, property);
    const key = `${isIncome(item) ? "income" : "expense"}:${label.toLocaleLowerCase("pt-BR")}`;
    const row = groups.get(key) || { label, type: isIncome(item) ? "income" : "expense", count: 0, total: 0 };
    row.count += 1;
    row.total += amountOf(item);
    groups.set(key, row);
  });
  return [...groups.values()].filter((item) => item.count >= 2).sort((a, b) => b.total - a.total).slice(0, 5);
};
const anomalies = (items) => {
  const amounts = items.map(amountOf).filter(Boolean);
  if (amounts.length < 4) return [];
  const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const threshold = average * 3;
  return items.filter((item) => amountOf(item) > threshold).sort((a, b) => amountOf(b) - amountOf(a)).slice(0, 5)
    .map((item) => ({ date: item.date, type: isIncome(item) ? "income" : "expense", amount: amountOf(item) }));
};

export function analyzeFinancialPeriod({ transactions = [], incomes = [], month, scope = "general" }) {
  if (!validMonth(month)) throw new Error("Informe um período no formato YYYY-MM.");
  if (!["general", "buffet"].includes(scope)) throw new Error("Escopo de análise inválido.");
  const all = [...transactions, ...incomes].filter((item) => !item?.id || item.id);
  const selected = all.filter((item) => inPeriod(item, month));
  const scoped = scope === "buffet" ? selected.filter(isBuffetEntry) : selected.filter((item) => !isBuffetEntry(item));
  const previous = all.filter((item) => inPeriod(item, previousMonth(month)) && (scope === "buffet" ? isBuffetEntry(item) : !isBuffetEntry(item)));
  const totals = aggregate(scoped);
  const priorTotals = aggregate(previous);
  const variation = (current, prior) => prior === 0 ? null : Number((((current - prior) / Math.abs(prior)) * 100).toFixed(2));
  const expenses = scoped.filter((item) => !isIncome(item));
  const incomeProperty = scope === "buffet" ? "product" : "source";
  return {
    period: month,
    previousPeriod: previousMonth(month),
    scope,
    totals,
    previousTotals: priorTotals,
    variations: {
      incomePercent: variation(totals.income, priorTotals.income),
      expensePercent: variation(totals.expense, priorTotals.expense),
      balancePercent: variation(totals.balance, priorTotals.balance),
    },
    concentration: {
      expensesByCategory: rankedTotals(expenses, "expenseType"),
      expensesByLocation: scope === "general" ? rankedTotals(expenses, "location") : [],
      incomeBySource: rankedTotals(scoped.filter(isIncome), incomeProperty),
    },
    recurrence: recurrence(scoped, scope),
    anomalies: anomalies(scoped),
    busiestDays: dayTotals(scoped),
    buffet: scope === "general" ? analyzeFinancialPeriod({ transactions, incomes, month, scope: "buffet" }) : null,
  };
}
