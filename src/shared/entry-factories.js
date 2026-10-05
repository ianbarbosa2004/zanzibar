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
    ...(form.paymentMethod ? { paymentMethod: form.paymentMethod } : {}),
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
  return entry.id && entries.some((item) => item.id === entry.id)
    ? entries.map((item) => item.id === entry.id ? entry : item)
    : [entry, ...entries];
}
