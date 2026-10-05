export const isIncome = (transaction) => transaction?.type === "income";

export function normalizeTransaction(transaction) {
  return {
    ...transaction,
    type: isIncome(transaction) ? "income" : "expense",
    amount: Number(transaction.amount) || 0,
  };
}

export function splitTransactions(transactions = []) {
  const normalized = transactions.map(normalizeTransaction);
  return {
    transactions: normalized.filter((transaction) => !isIncome(transaction)),
    incomes: normalized.filter(isIncome),
  };
}

export function mergeTransactions(transactions = [], incomes = []) {
  const entries = [
    ...transactions.map(normalizeTransaction),
    ...incomes.map((income) => normalizeTransaction({ ...income, type: "income" })),
  ];
  return entries.filter((entry, index, all) => !entry.id || all.findIndex((candidate) => candidate.id === entry.id) === index);
}
