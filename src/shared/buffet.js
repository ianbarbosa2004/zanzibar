const buffetValue = (value) => String(value || "").trim().toLocaleLowerCase("pt-BR");

export const isBuffetExpense = (item) => item?.type !== "income" && buffetValue(item?.location) === "buffet";
export const isBuffetIncome = (item) => item?.type === "income" && (buffetValue(item?.source) === "buffet" || buffetValue(item?.product) === "buffet");
export const isBuffetEntry = (item) => isBuffetExpense(item) || isBuffetIncome(item);

export function buffetEntries(transactions = [], incomes = []) {
  return [...transactions.filter(isBuffetExpense), ...incomes.filter(isBuffetIncome)]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

export function buffetDailyClosings(entries = []) {
  const grouped = new Map();
  entries.forEach((item) => {
    const row = grouped.get(item.date) || { date: item.date, income: 0, expense: 0, incomeCount: 0, expenseCount: 0 };
    const amount = Number(item.amount || 0);
    if (item.type === "income") {
      row.income += amount;
      row.incomeCount += 1;
    } else {
      row.expense += amount;
      row.expenseCount += 1;
    }
    grouped.set(item.date, row);
  });
  return [...grouped.values()]
    .map((row) => ({ ...row, balance: row.income - row.expense, count: row.incomeCount + row.expenseCount }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function buffetMonthlyClosings(entries = []) {
  const grouped = new Map();
  entries.forEach((item) => {
    const month = String(item.date || "").slice(0, 7);
    const row = grouped.get(month) || { month, income: 0, expense: 0, incomeCount: 0, expenseCount: 0 };
    const amount = Number(item.amount || 0);
    if (item.type === "income") {
      row.income += amount;
      row.incomeCount += 1;
    } else {
      row.expense += amount;
      row.expenseCount += 1;
    }
    grouped.set(month, row);
  });
  return [...grouped.values()]
    .map((row) => ({ ...row, balance: row.income - row.expense, count: row.incomeCount + row.expenseCount }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
