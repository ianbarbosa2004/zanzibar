const HEADER_ALIASES = {
  id: ["id", "clientid", "client_id", "codigo"],
  description: ["descricao", "description", "historico", "titulo"],
  amount: ["valor", "amount", "quantia"],
  type: ["tipo", "type", "natureza"],
  expenseType: ["tipodedespesa", "expensetype", "category", "categoria"],
  expenseTypeSlug: ["tipodedespesaslug", "expensetypeslug", "categoryslug"],
  taker: ["tomador", "taker", "responsavel"],
  takerSlug: ["tomadorslug", "takerslug"],
  location: ["local", "location"],
  locationSlug: ["localslug", "locationslug"],
  creditor: ["credor", "creditor", "favorecido"],
  creditorSlug: ["credorslug", "creditorslug"],
  source: ["fonte", "source", "fontedereceita"],
  sourceSlug: ["fonteslug", "sourceslug"],
  date: ["data", "date", "datadatransacao", "transactiondate"],
};

const normalizeHeader = (value) => String(value || "").trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function parseCsvRows(text, delimiter) {
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
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      value = "";
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
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  return Number(normalized);
}

function parseDate(value) {
  const raw = String(value || "").trim();
  let match = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? raw : "";
}

const firstMatchingHeader = (headers, aliases) => headers.findIndex((header) => aliases.includes(header));

export function importTransactionsCsv(text) {
  const sample = String(text || "").split(/\r?\n/, 1)[0] || "";
  const delimiter = (sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length ? ";" : ",";
  const rows = parseCsvRows(String(text || "").replace(/^\uFEFF/, ""), delimiter);
  if (rows.length < 2) throw new Error("O CSV precisa conter cabeçalho e pelo menos uma linha.");
  const headers = rows[0].map(normalizeHeader);
  const columns = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, firstMatchingHeader(headers, aliases)]));
  const missing = ["description", "amount", "date"].filter((key) => columns[key] < 0);
  if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}.`);
  const entries = [];
  const errors = [];
  rows.slice(1).forEach((cells, rowIndex) => {
    const line = rowIndex + 2;
    const value = (key) => columns[key] < 0 ? "" : String(cells[columns[key]] || "").trim();
    const amount = parseAmount(value("amount"));
    const date = parseDate(value("date"));
    const type = value("type").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isIncomeRow = ["income", "receita", "entrada", "r"].includes(type);
    const rowErrors = [];
    if (!value("description")) rowErrors.push("descrição vazia");
    if (!Number.isFinite(amount) || amount <= 0) rowErrors.push("valor inválido");
    if (!date) rowErrors.push("data inválida");
    if (type && !isIncomeRow && !["expense", "despesa", "saida", "s"].includes(type)) rowErrors.push("tipo inválido");
    if (rowErrors.length) {
      errors.push({ line, message: rowErrors.join("; ") });
      return;
    }
    const entry = {
      id: value("id") || globalThis.crypto?.randomUUID?.() || `csv-${Date.now()}-${line}`,
      description: value("description"),
      amount,
      type: isIncomeRow ? "income" : "expense",
      date,
    };
    if (entry.type === "income") {
      entry.source = value("source") || "Salário";
      if (value("sourceSlug")) entry.sourceSlug = value("sourceSlug");
    }
    else Object.assign(entry, {
      expenseType: value("expenseType") || "Outros",
      taker: value("taker") || "Pessoal",
      location: value("location") || "Casa",
      creditor: value("creditor") || "Caixa",
    });
    if (entry.type === "expense") {
      for (const [field, slugField] of [["expenseType", "expenseTypeSlug"], ["taker", "takerSlug"], ["location", "locationSlug"], ["creditor", "creditorSlug"]]) {
        if (value(slugField)) entry[slugField] = value(slugField);
      }
    }
    entries.push(entry);
  });
  return { entries, errors, delimiter };
}

export const csvTemplate = [
  "id;descricao;valor;tipo;tipo_de_despesa;tipo_de_despesa_slug;tomador;tomador_slug;local;local_slug;credor;credor_slug;fonte;fonte_slug;data",
  ["", "Mercado do mês", "125,90", "despesa", "Alimentação", "alimentacao", "Pessoal", "pessoal", "Casa", "casa", "Caixa", "caixa", "", "", "06/10/2026"].join(";"),
  ["", "Salário", "5000,00", "receita", "", "", "", "", "", "", "", "", "Salário", "salario", "05/10/2026"].join(";"),
].join("\n");
