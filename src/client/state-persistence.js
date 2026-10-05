export function defaultAppState(defaults) {
  return {
    transactions: [],
    incomes: [],
    expenseTypes: [...defaults.expenseTypes],
    takers: [...defaults.takers],
    locations: [...defaults.locations],
    creditors: [...defaults.creditors],
    incomeSources: [...defaults.incomeSources],
  };
}

export function dataPayload(state) {
  return {
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
}
