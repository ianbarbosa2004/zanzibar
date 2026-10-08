export async function fetchData(apiUrl) {
  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`API indisponível: ${response.status}`);
  return response.json();
}
