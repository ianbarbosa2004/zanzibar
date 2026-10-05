const keys = {
  transactions: "clareza-transactions",
  incomes: "clareza-incomes",
  expenseTypes: "clareza-expense-types",
  takers: "clareza-takers",
  locations: "clareza-locations",
  creditors: "clareza-creditors",
  incomeSources: "clareza-income-sources",
};

function read(key, fallback) {
  const value = localStorage.getItem(keys[key]);
  return value === null ? fallback : JSON.parse(value);
}

export function readLocalState(defaults) {
  return {
    transactions: read("transactions", defaults.transactions),
    incomes: read("incomes", defaults.incomes),
    expenseTypes: read("expenseTypes", defaults.expenseTypes),
    takers: read("takers", defaults.takers),
    locations: read("locations", defaults.locations),
    creditors: read("creditors", defaults.creditors),
    incomeSources: read("incomeSources", defaults.incomeSources),
  };
}

export function writeLocalState(state) {
  Object.entries(state).forEach(([key, value]) => {
    localStorage.setItem(keys[key], JSON.stringify(value));
  });
}
