export function defaultAppState(defaults) {
  const payload = {
    transactions: [],
    incomes: [],
    cashClosings: [],
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

export function dataPayload(state) {
  const payload = {
    transactions: state.transactions,
    incomes: state.incomes,
    cashClosings: state.cashClosings || [],
    limits: state.limits || [],
    settings: {
      expenseTypes: state.expenseTypes,
      takers: state.takers,
      locations: state.locations,
      creditors: state.creditors,
      incomeSources: state.incomeSources,
      catalogMetadata: state.catalogMetadata || {},
    },
  };
  if (state.paymentMethods !== undefined) payload.settings.paymentMethods = state.paymentMethods;
  return payload;
}
