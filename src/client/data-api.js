export async function fetchData(apiUrl) {
  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`API indisponível: ${response.status}`);
  return response.json();
}

export async function saveData(apiUrl, payload) {
  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`API indisponível: ${response.status}`);
  return response.json();
}
