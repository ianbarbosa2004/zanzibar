export function localDate() {
  const now = new Date();
  const utcMinusThree = -180;
  const offset = utcMinusThree - now.getTimezoneOffset();
  return new Date(now.getTime() + offset * 60000).toISOString().slice(0, 10);
}

export const currentMonth = () => localDate().slice(0, 7);

export const todayLabel = () => new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
}).format(new Date());
