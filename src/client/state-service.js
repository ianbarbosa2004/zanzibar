import { fetchData, saveData } from "./data-api.js";
import { createAppState } from "./app-state.js";
import { readLocalState, writeLocalState } from "./local-store.js";
import { dataPayload } from "./state-persistence.js";

export async function loadAppState(apiUrl, fallbackUrl, defaults) {
  try {
    return createAppState(await fetchData(apiUrl), defaults);
  } catch {
    const localState = readLocalState({
      transactions: [],
      incomes: [],
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

export async function persistAppState(apiUrl, state) {
  writeLocalState(state);
  try {
    await saveData(apiUrl, dataPayload(state));
  } catch {
    // O modo local continua disponível quando a API de escrita não está acessível.
  }
}
