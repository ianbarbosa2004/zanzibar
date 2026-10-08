import assert from "node:assert/strict";
import test from "node:test";
import { catalogImportMarkdown } from "../../src/shared/catalog-import-document.js";

test("gera documentação markdown das tabelas auxiliares e colunas aceitas", () => {
  const markdown = catalogImportMarkdown({
    expense_types: [{ id: 1, name: "Alimentação", slug: "alimentacao" }],
  });
  assert.match(markdown, /## Tipos de despesa/);
  assert.match(markdown, /\| id \| descricao \| slug \|/);
  assert.match(markdown, /Alimentação/);
  assert.match(markdown, /alimentacao/);
  assert.match(markdown, /\| 1 \| Alimentação \| alimentacao \|/);
});
