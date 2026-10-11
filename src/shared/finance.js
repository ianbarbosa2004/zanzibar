import { isIncome } from "./transactions.js";

export const inMonth = (transactions, month) => transactions.filter((item) => item.date?.startsWith(month));

export function summarize(transactions, month) {
  const items = inMonth(transactions, month);
  const expense = items.filter((item) => !isIncome(item)).reduce((total, item) => total + Number(item.amount || 0), 0);
  const income = items.filter(isIncome).reduce((total, item) => total + Number(item.amount || 0), 0);
  return { items, expense, income, balance: income - expense };
}

export function groupTotals(transactions, property) {
  return Object.entries(transactions.reduce((result, item) => {
    const label = item[property] || "Sem cadastro";
    result[label] = (result[label] || 0) + Number(item.amount || 0);
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
}
