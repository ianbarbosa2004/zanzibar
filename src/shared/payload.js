export function isDataPayload(payload) {
  return Boolean(
    payload
    && Array.isArray(payload.transactions)
    && (payload.incomes === undefined || Array.isArray(payload.incomes))
    && (payload.cashClosings === undefined || Array.isArray(payload.cashClosings))
    && (payload.limits === undefined || Array.isArray(payload.limits))
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
    cashClosings: payload.cashClosings || [],
    limits: payload.limits || [],
    settings: payload.settings,
  };
}
