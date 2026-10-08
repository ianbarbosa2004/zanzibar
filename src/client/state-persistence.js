export function defaultAppState(defaults) {
  const payload = {
    transactions: [],
    incomes: [],
    cashClosings: [],
    monthlyCashClosings: [],
    billings: [],
    limits: [],
    expenseTypes: [...defaults.expenseTypes],
    takers: [...defaults.takers],
    locations: [...defaults.locations],
    creditors: [...defaults.creditors],
    paymentMethods: [...(defaults.paymentMethods || [])],
    incomeSources: [...defaults.incomeSources],
    catalogMetadata: defaults.catalogMetadata || {},
  };
  return payload;
}
