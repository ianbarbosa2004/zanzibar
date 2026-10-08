async function requestError(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  return payload.error || `${fallback} (${response.status})`;
}

export async function saveCashClosing(apiUrl, date, items) {
  const response = await fetch(`${apiUrl}/../cash-closings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, items }),
  });
  if (!response.ok) throw new Error(await requestError(response, "Falha ao salvar fechamento"));
}

export async function saveMonthlyCashClosings(apiUrl, items) {
  const response = await fetch(`${apiUrl}/../monthly-cash-closings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error(await requestError(response, "Falha ao salvar fechamento mensal"));
}

export async function saveTransaction(apiUrl, item) {
  const response = await fetch(`${apiUrl}/../transactions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
  if (!response.ok) throw new Error(await requestError(response, "Falha ao salvar lançamento"));
}

export async function saveLimit(apiUrl, item) {
  const response = await fetch(`${apiUrl}/../limits`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
  if (!response.ok) throw new Error(await requestError(response, "Falha ao salvar limite"));
}

export async function saveCatalog(apiUrl, operation) {
  const response = await fetch(`${apiUrl}/../catalogs`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation) });
  if (!response.ok) throw new Error(await requestError(response, "Falha ao salvar cadastro"));
}

export async function refreshBillings(apiUrl) {
  const response = await fetch(`${apiUrl}/../billings`, { method: "PUT" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Falha ao atualizar faturamento (${response.status})`);
  return payload.billings || [];
}
