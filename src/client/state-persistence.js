export function defaultAppState(defaults) {
  const payload = {
    transactions: [],
    incomes: [],
    expenseTypes: [...defaults.expenseTypes],
    takers: [...defaults.takers],
    locations: [...defaults.locations],
    creditors: [...defaults.creditors],
    paymentMethods: [...(defaults.paymentMethods || [])],
    incomeSources: [...defaults.incomeSources],
  };
  return payload;
}

export function dataPayload(state) {
  const payload = {
    transactions: state.transactions,
    incomes: state.incomes,
    settings: {
      expenseTypes: state.expenseTypes,
      takers: state.takers,
      locations: state.locations,
      creditors: state.creditors,
      incomeSources: state.incomeSources,
    },
  };
  if (state.paymentMethods !== undefined) payload.settings.paymentMethods = state.paymentMethods;
  return payload;
}
