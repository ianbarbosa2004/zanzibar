const HEADER_ALIASES = {
  id: ["id", "clientid", "client_id", "codigo"],
  date: ["data", "date"],
  paymentMethod: ["formaderecebimento", "formapagamento", "paymentmethod", "metodopagamento"],
  saleCount: ["vendas", "quantidadedevendas", "salecount", "sales"],
  totalAmount: ["valor", "total", "amount", "valorrecebido"],
};

const normalizeHeader = (value) => String(value || "").trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((item) => item.trim())) rows.push(row);
      row = []; value = "";
    } else value += character;
  }
  if (value || row.length) {
    row.push(value);
    if (row.some((item) => item.trim())) rows.push(row);
  }
  if (quoted) throw new Error("O CSV contém aspas não fechadas.");
  return rows;
}

function parseAmount(value) {
  const raw = String(value || "").trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!raw) return NaN;
  return Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
}

function parseDate(value) {
  const raw = String(value || "").trim();
  const brazilian = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (brazilian) return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

export function importCashClosingsCsv(text) {
  const sample = String(text || "").split(/\r?\n/, 1)[0] || "";
  const delimiter = (sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length ? ";" : ",";
  const rows = parseRows(String(text || "").replace(/^\uFEFF/, ""), delimiter);
  if (rows.length < 2) throw new Error("O CSV precisa conter cabeçalho e pelo menos uma linha.");
  const headers = rows[0].map(normalizeHeader);
  const columns = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, headers.findIndex((header) => aliases.includes(header))]));
  const missing = ["date", "paymentMethod", "saleCount", "totalAmount"].filter((key) => columns[key] < 0);
  if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);
  const entries = [];
  const errors = [];
  rows.slice(1).forEach((cells, rowIndex) => {
    const line = rowIndex + 2;
    const value = (key) => columns[key] < 0 ? "" : String(cells[columns[key]] || "").trim();
    const date = parseDate(value("date"));
    const saleCount = Number(value("saleCount"));
    const totalAmount = parseAmount(value("totalAmount"));
    const rowErrors = [];
    if (!date) rowErrors.push("data inválida");
    if (!value("paymentMethod")) rowErrors.push("forma de recebimento vazia");
    if (!Number.isInteger(saleCount) || saleCount < 0) rowErrors.push("quantidade de vendas inválida");
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) rowErrors.push("valor inválido");
    if (rowErrors.length) {
      errors.push({ line, message: rowErrors.join("; ") });
      return;
    }
    entries.push({
      id: value("id") || globalThis.crypto?.randomUUID?.() || `cash-csv-${Date.now()}-${line}`,
      date,
      paymentMethod: value("paymentMethod"),
      saleCount,
      totalAmount,
    });
  });
  return { entries, errors, delimiter };
}

export const cashClosingCsvTemplate = [
  "id;data;forma_de_recebimento;vendas;valor",
  ["", "06/10/2026", "Pix", "12", "480,00"].join(";"),
  ["", "06/10/2026", "Cartão de crédito", "8", "320,00"].join(";"),
].join("\n");
