import { splitTransactions } from "../shared/transactions.js";

export function createAppState(data, defaults) {
  const unified = data.transactions?.length || data.incomes?.length
    ? [...(data.transactions || []), ...(data.incomes || [])]
    : [];
  const { transactions, incomes } = splitTransactions(unified);
  const settings = data.settings || {};
  return {
    transactions: transactions.map((item) => ({
      ...item,
      expenseType: item.expenseType || item.category || "Outros",
      taker: item.taker || "Pessoal",
      location: item.location || "Casa",
      creditor: item.creditor || "Caixa",
    })),
    incomes,
    expenseTypes: settings.expenseTypes?.length ? settings.expenseTypes : [...defaults.expenseTypes],
    takers: settings.takers?.length ? settings.takers : [...defaults.takers],
    locations: settings.locations?.length ? settings.locations : [...defaults.locations],
    creditors: settings.creditors?.length ? settings.creditors : [...defaults.creditors],
    incomeSources: settings.incomeSources?.length ? settings.incomeSources : [...defaults.incomeSources],
  };
}
