import assert from "node:assert/strict";
import test from "node:test";
import { cashClosingMatchesExistingRow } from "../../src/shared/cash-closings.js";

test("reconhece fechamento legado pelo id numérico", () => {
  assert.equal(cashClosingMatchesExistingRow({ id: 12 }, { id: 12, clientId: null }), true);
  assert.equal(cashClosingMatchesExistingRow({ id: "12" }, { id: 12, clientId: null }), true);
});

test("reconhece fechamento novo pelo client_id", () => {
  assert.equal(cashClosingMatchesExistingRow({ id: "closing-1" }, { id: 12, clientId: "closing-1" }), true);
  assert.equal(cashClosingMatchesExistingRow({ clientId: "closing-1" }, { id: 12, clientId: "closing-1" }), true);
});

test("não confunde fechamento diferente com registro existente", () => {
  assert.equal(cashClosingMatchesExistingRow({ id: "closing-2" }, { id: 12, clientId: "closing-1" }), false);
  assert.equal(cashClosingMatchesExistingRow({ id: 13 }, { id: 12, clientId: null }), false);
});
