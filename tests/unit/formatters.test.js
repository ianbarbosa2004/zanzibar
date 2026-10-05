import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney, formatTransactionDate, parseInputAmount } from "../../src/shared/formatters.js";

test("formata valores monetários em reais", () => {
  assert.equal(formatMoney(1234.5), "R$ 1.234,50");
});

test("formata data ISO para exibição brasileira", () => {
  assert.equal(formatTransactionDate("2026-10-05"), "05/10/2026");
});

test("converte valor digitado em centavos", () => {
  assert.equal(parseInputAmount("R$ 1.234,50"), 1234.5);
});
