import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { cashClosingCsvTemplate, importCashClosingsCsv } from "../../src/shared/csv-cash-closings.js";

test("importa fechamentos de caixa em CSV brasileiro", () => {
  const result = importCashClosingsCsv("data;forma_de_recebimento;vendas;valor\n06/10/2026;Pix;4;120,50");
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.entries[0], { id: result.entries[0].id, date: "2026-10-06", paymentMethod: "Pix", saleCount: 4, totalAmount: 120.5 });
});

test("informa linhas inválidas de fechamento sem descartar as válidas", () => {
  const result = importCashClosingsCsv("data,forma_de_recebimento,vendas,valor\n2026-10-06,Pix,2,10.00\n,Pix,abc,");
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.errors, [{ line: 3, message: "data inválida; quantidade de vendas inválida; valor inválido" }]);
});

test("fornece modelo de fechamento compatível", async () => {
  const result = importCashClosingsCsv(cashClosingCsvTemplate);
  const file = await readFile(new URL("../../public/modelo-fechamentos-caixa.csv", import.meta.url), "utf8");
  assert.equal(result.errors.length, 0);
  assert.equal(result.entries.length, 2);
  assert.equal(importCashClosingsCsv(file).errors.length, 0);
});
