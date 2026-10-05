export function isDataPayload(payload) {
  return Boolean(
    payload
    && Array.isArray(payload.transactions)
    && (payload.incomes === undefined || Array.isArray(payload.incomes))
    && typeof payload.settings === "object"
    && payload.settings !== null
    && !Array.isArray(payload.settings),
  );
}

export function normalizeDataPayload(payload) {
  if (!isDataPayload(payload)) throw new TypeError("Dados inválidos.");
  return {
    transactions: payload.transactions,
    incomes: payload.incomes || [],
    settings: payload.settings,
  };
}
