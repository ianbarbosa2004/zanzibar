export function createExpenseEntry(form, id, cryptoApi = globalThis.crypto) {
  return {
    id: id || cryptoApi.randomUUID(),
    description: form.description.trim(),
    amount: form.amount,
    type: "expense",
    expenseType: form.expenseType,
    taker: form.taker,
    location: form.location,
    creditor: form.creditor,
    date: form.date,
  };
}

export function createIncomeEntry(form, id, cryptoApi = globalThis.crypto) {
  return {
    id: id || cryptoApi.randomUUID(),
    description: form.description.trim(),
    amount: form.amount,
    type: "income",
    source: form.source,
    date: form.date,
  };
}

export function upsertEntry(entries, entry) {
  return entry.id && entries.some((item) => String(item.id) === String(entry.id))
    ? entries.map((item) => String(item.id) === String(entry.id) ? entry : item)
    : [entry, ...entries];
}
