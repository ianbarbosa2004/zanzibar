const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const formatMoney = (value) => money.format(Number(value) || 0).replace(/\u00a0/g, " ");

export function formatTransactionDate(value) {
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export const formatInputAmount = (value) => formatMoney(value);

export function parseInputAmount(value) {
  const digits = String(value).replace(/\D/g, "");
  return Number(digits) / 100;
}

export const formatDate = (value) => dateFormat.format(new Date(`${value}T12:00:00`));

export function formatLastTransactionUpdate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Última atualização indisponível";
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "Última atualização indisponível";
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", " -");
  return `Última atualização em ${formatted}`;
}
