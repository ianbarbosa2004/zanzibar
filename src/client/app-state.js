import { mergeTransactions, splitTransactions } from "../shared/transactions.js";

export function createAppState(data, defaults) {
  const unified = mergeTransactions(data.transactions || [], data.incomes || []);
  const { transactions, incomes } = splitTransactions(unified);
  const settings = data.settings || {};
  const cashClosings = (data.cashClosings || []).map((item) => ({
    ...item,
    saleCount: Number(item.saleCount || 0),
    totalAmount: Number(item.totalAmount || 0),
  }));
  return {
    transactions: transactions.map((item) => ({
      ...item,
      expenseType: item.expenseType || item.category || "Outros",
      taker: item.taker || "Pessoal",
      location: item.location || "Casa",
      creditor: item.creditor || "Caixa",
    })),
    incomes,
    cashClosings,
    expenseTypes: settings.expenseTypes?.length ? settings.expenseTypes : [...defaults.expenseTypes],
    takers: settings.takers?.length ? settings.takers : [...defaults.takers],
    locations: settings.locations?.length ? settings.locations : [...defaults.locations],
    creditors: settings.creditors?.length ? settings.creditors : [...defaults.creditors],
    paymentMethods: settings.paymentMethods?.length ? settings.paymentMethods : [...(defaults.paymentMethods || [])],
    incomeSources: settings.incomeSources?.length ? settings.incomeSources : [...defaults.incomeSources],
  };
}
