import assert from "node:assert/strict";
import test from "node:test";
import { isDataPayload, normalizeDataPayload } from "../../src/shared/payload.js";

test("aceita payload com transações, receitas, fechamentos e configurações", () => {
  assert.equal(isDataPayload({ transactions: [], incomes: [], cashClosings: [], limits: [], settings: {} }), true);
});

test("aceita payload legado sem a lista separada de receitas", () => {
  assert.deepEqual(normalizeDataPayload({ transactions: [], settings: {} }), {
    transactions: [],
    incomes: [],
    cashClosings: [],
    limits: [],
    settings: {},
  });
});

test("preserva fechamentos no payload normalizado", () => {
  const cashClosings = [{ id: "closing-1", date: "2026-10-05", paymentMethod: "Pix", saleCount: 1, totalAmount: 10 }];
  assert.deepEqual(normalizeDataPayload({ transactions: [], incomes: [], cashClosings, settings: {} }), {
    transactions: [],
    incomes: [],
    cashClosings,
    limits: [],
    settings: {},
  });
});

test("rejeita payload sem transações ou configurações válidas", () => {
  assert.equal(isDataPayload({ incomes: [], settings: {} }), false);
  assert.equal(isDataPayload({ transactions: [], settings: [] }), false);
  assert.throws(() => normalizeDataPayload(null), /Dados inválidos/);
});
