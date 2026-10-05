const keys = {
  transactions: "clareza-transactions",
  incomes: "clareza-incomes",
  expenseTypes: "clareza-expense-types",
  takers: "clareza-takers",
  locations: "clareza-locations",
  creditors: "clareza-creditors",
  paymentMethods: "clareza-payment-methods",
  incomeSources: "clareza-income-sources",
  cashClosings: "clareza-cash-closings",
};

function read(key, fallback) {
  const value = localStorage.getItem(keys[key]);
  return value === null ? fallback : JSON.parse(value);
}

export function readLocalState(defaults) {
  const state = {
    transactions: read("transactions", defaults.transactions),
    incomes: read("incomes", defaults.incomes),
    expenseTypes: read("expenseTypes", defaults.expenseTypes),
    takers: read("takers", defaults.takers),
    locations: read("locations", defaults.locations),
    creditors: read("creditors", defaults.creditors),
    incomeSources: read("incomeSources", defaults.incomeSources),
  };
  if (defaults.paymentMethods !== undefined) state.paymentMethods = read("paymentMethods", defaults.paymentMethods);
  state.cashClosings = read("cashClosings", defaults.cashClosings || []);
  return state;
}

export function writeLocalState(state) {
  Object.entries(state).forEach(([key, value]) => {
    localStorage.setItem(keys[key], JSON.stringify(value));
  });
}
