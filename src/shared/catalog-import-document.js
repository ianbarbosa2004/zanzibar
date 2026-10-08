export const auxiliaryTableDefinitions = [
  { table: "expense_types", label: "Tipos de despesa", importFields: ["tipo_de_despesa", "tipo_de_despesa_slug"] },
  { table: "takers", label: "Tomadores", importFields: ["tomador", "tomador_slug"] },
  { table: "locations", label: "Locais", importFields: ["local", "local_slug"] },
  { table: "creditors", label: "Credores", importFields: ["credor", "credor_slug"] },
  { table: "payment_methods", label: "Formas de recebimento", importFields: ["forma_de_recebimento"] },
  { table: "income_sources", label: "Fontes de receita", importFields: ["fonte", "fonte_slug"] },
];

const markdownCell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function catalogImportMarkdown(metadata = {}, catalogs = {}) {
  const lines = [
    "# Tabelas auxiliares do Clareza",
    "",
  ];
  auxiliaryTableDefinitions.forEach(({ table, label, importFields }) => {
    lines.push(`## ${label} (\`${table}\`)`, "", "| id | descricao | slug |", "| --- | --- | --- |");
    const entries = Array.isArray(metadata[table]) ? metadata[table] : (catalogs[table] || []).map((name) => ({ name }));
    if (entries.length) entries.forEach((entry) => lines.push(`| ${markdownCell(entry.id)} | ${markdownCell(entry.name || entry.descricao)} | ${markdownCell(entry.slug || toSlug(entry.name || entry.descricao))} |`));
    else lines.push("| — | Nenhum registro carregado | — |");
    lines.push("");
  });
  return lines.join("\n");
}
import { toSlug } from "./slugs.js";
