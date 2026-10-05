import assert from "node:assert/strict";
import test from "node:test";
import { isDataPayload, normalizeDataPayload } from "../../src/shared/payload.js";

test("aceita payload com transações, receitas e configurações", () => {
  assert.equal(isDataPayload({ transactions: [], incomes: [], settings: {} }), true);
});

test("aceita payload legado sem a lista separada de receitas", () => {
  assert.deepEqual(normalizeDataPayload({ transactions: [], settings: {} }), {
    transactions: [],
    incomes: [],
    settings: {},
  });
});

test("rejeita payload sem transações ou configurações válidas", () => {
  assert.equal(isDataPayload({ incomes: [], settings: {} }), false);
  assert.equal(isDataPayload({ transactions: [], settings: [] }), false);
  assert.throws(() => normalizeDataPayload(null), /Dados inválidos/);
});
