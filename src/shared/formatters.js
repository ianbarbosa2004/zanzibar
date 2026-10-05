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
