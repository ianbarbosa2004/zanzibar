import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { csvTemplate, importTransactionsCsv } from "../../src/shared/csv-transactions.js";

test("importa CSV brasileiro com despesas e receitas", () => {
  const result = importTransactionsCsv("descricao;valor;tipo;local;data\nMercado;1.234,50;despesa;Casa;06/10/2026\nSalário;5000,00;receita;;2026-10-05");
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.entries.map((entry) => [entry.type, entry.amount, entry.date]), [
    ["expense", 1234.5, "2026-10-06"],
    ["income", 5000, "2026-10-05"],
  ]);
});

test("informa linhas inválidas sem descartar as válidas", () => {
  const result = importTransactionsCsv("description,amount,date\nOk,10.50,2026-01-02\nSem valor,,2026-01-02");
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.errors, [{ line: 3, message: "valor inválido" }]);
});

test("fornece um modelo CSV válido para download", () => {
  const result = importTransactionsCsv(csvTemplate);
  assert.equal(result.errors.length, 0);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries.map((entry) => entry.type), ["expense", "income"]);
});

test("mantém o arquivo CSV estático compatível com o importador", async () => {
  const file = await readFile(new URL("../../public/modelo-transacoes.csv", import.meta.url), "utf8");
  const result = importTransactionsCsv(file);
  assert.equal(result.errors.length, 0);
  assert.equal(result.entries.length, 2);
});
