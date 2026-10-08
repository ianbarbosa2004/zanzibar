import { fetchData } from "./data-api.js";
import { createAppState } from "./app-state.js";
import { readLocalState } from "./local-store.js";

export async function loadAppState(apiUrl, fallbackUrl, defaults) {
  try {
    return createAppState(await fetchData(apiUrl), defaults);
  } catch {
    const localState = readLocalState({
      transactions: [],
      incomes: [],
      cashClosings: [],
      monthlyCashClosings: [],
      billings: [],
      limits: [],
      catalogMetadata: {},
      expenseTypes: [...defaults.expenseTypes],
      takers: [...defaults.takers],
      locations: [...defaults.locations],
      creditors: [...defaults.creditors],
      paymentMethods: [...(defaults.paymentMethods || [])],
      incomeSources: [...defaults.incomeSources],
    });
    if (localState.transactions.length) return localState;
    return createAppState({ transactions: await fetchData(fallbackUrl), incomes: [], settings: {} }, defaults);
  }
}
