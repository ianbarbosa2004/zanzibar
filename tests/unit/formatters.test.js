import assert from "node:assert/strict";
import test from "node:test";
import { formatLastTransactionUpdate, formatMoney, formatTransactionDate, parseInputAmount } from "../../src/shared/formatters.js";

test("formata valores monetários em reais", () => {
  assert.equal(formatMoney(1234.5), "R$ 1.234,50");
});

test("formata data ISO para exibição brasileira", () => {
  assert.equal(formatTransactionDate("2026-10-05"), "05/10/2026");
});

test("converte valor digitado em centavos", () => {
  assert.equal(parseInputAmount("R$ 1.234,50"), 1234.5);
});

test("formata a última atualização da tabela de transações", () => {
  assert.match(formatLastTransactionUpdate("2026-10-06 14:23:00"), /^Última atualização em 06\/10\/2026 - 14:23$/);
});

test("formata timestamps UTC no fuso de São Paulo", () => {
  assert.equal(formatLastTransactionUpdate("2026-10-07T03:16:29.000Z"), "Última atualização em 07/10/2026 - 00:16");
});
