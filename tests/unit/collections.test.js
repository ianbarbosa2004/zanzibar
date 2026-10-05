import assert from "node:assert/strict";
import test from "node:test";
import { filterEntries, paginate, sortByDateDescending } from "../../src/shared/collections.js";

const entries = [
  { id: "1", date: "2026-10-01", description: "Mercado", expenseType: "Alimentação", taker: "Pessoal" },
  { id: "2", date: "2026-10-05", description: "Internet", expenseType: "Contas", taker: "Zanzibar" },
  { id: "3", date: "2026-10-03", description: "Feira", expenseType: "Alimentação", taker: "Pessoal" },
];

test("filtra por busca e campos", () => {
  assert.deepEqual(filterEntries(entries, { query: "feira", fields: ["description", "expenseType"] }).map(({ id }) => id), ["3"]);
});

test("aplica filtros exatos", () => {
  assert.deepEqual(filterEntries(entries, { filters: { expenseType: "Alimentação", taker: "Pessoal" } }).map(({ id }) => id), ["1", "3"]);
});

test("ordena por data e pagina sem ultrapassar limites", () => {
  const sorted = sortByDateDescending(entries);
  assert.deepEqual(sorted.map(({ id }) => id), ["2", "3", "1"]);
  assert.deepEqual(paginate(sorted, 2, 2), { items: [entries[0]], page: 2, totalPages: 2 });
  assert.deepEqual(paginate(sorted, 99, 2).page, 2);
});
