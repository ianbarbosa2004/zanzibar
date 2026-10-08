import assert from "node:assert/strict";
import test from "node:test";
import { toSlug, uniqueSlug } from "../../src/shared/slugs.js";

test("converte nomes acentuados para slugs estáveis", () => {
  assert.equal(toSlug("Despesas de Alimentação"), "despesas-de-alimentacao");
  assert.equal(toSlug("José & Filhos"), "jose-e-filhos");
});

test("evita colisões de slug", () => {
  const used = new Set(["alimentacao"]);
  assert.equal(uniqueSlug("Alimentação", used), "alimentacao-2");
});
