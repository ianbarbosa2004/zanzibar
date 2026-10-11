import { mergeTransactions, splitTransactions } from "../shared/transactions.js";

export function createAppState(data, defaults) {
  const unified = mergeTransactions(data.transactions || [], data.incomes || []);
  const { transactions, incomes } = splitTransactions(unified);
  const settings = data.settings || {};
  const catalogMetadata = settings.catalogMetadata || {};
  const cashClosings = (data.cashClosings || []).map((item) => ({
    ...item,
    saleCount: Number(item.saleCount || 0),
    totalAmount: Number(item.totalAmount || 0),
  }));
  const monthlyCashClosings = (data.monthlyCashClosings || []).map((item) => ({
    ...item,
    month: Number(item.month),
    year: Number(item.year),
    saleCount: Number(item.saleCount || 0),
    totalAmount: Number(item.totalAmount || 0),
  }));
  const limits = (data.limits || []).map((item) => ({
    ...item,
    month: Number(item.month),
    year: Number(item.year),
    target: Number(item.target || 0),
    budget: Number(item.budget || 0),
    forecast: Number(item.forecast || 0),
    patamar: Number(item.patamar || 0),
    result: Number(item.result || 0),
    closed: Boolean(item.closed),
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
    monthlyCashClosings,
    billings: (data.billings || []).map((item) => ({
      ...item,
      month: Number(item.month),
      year: Number(item.year),
      saleCount: Number(item.saleCount || 0),
      averageTicket: Number(item.averageTicket || 0),
      amount: Number(item.amount || 0),
    })),
    limits,
    expenseTypes: settings.expenseTypes?.length ? settings.expenseTypes : [...defaults.expenseTypes],
    takers: settings.takers?.length ? settings.takers : [...defaults.takers],
    locations: settings.locations?.length ? settings.locations : [...defaults.locations],
    creditors: settings.creditors?.length ? settings.creditors : [...defaults.creditors],
    paymentMethods: settings.paymentMethods?.length ? settings.paymentMethods : [...(defaults.paymentMethods || [])],
    incomeSources: settings.incomeSources?.length ? settings.incomeSources : [...defaults.incomeSources],
    catalogMetadata,
  };
}
