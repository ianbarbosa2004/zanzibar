import { inMonth, groupTotals, summarize } from "./src/shared/finance.js";
import { currentMonth, localDate, todayLabel } from "./src/shared/dates.js";
import { formatDate, formatInputAmount, formatLastTransactionUpdate, formatMoney, formatTransactionDate, parseInputAmount } from "./src/shared/formatters.js";
import { canDeleteRegistry, hasRegistryName, registryDefinition, renameRegistry } from "./src/shared/registries.js";
import { defaultAppState } from "./src/client/state-persistence.js";
import { createExpenseEntry, createIncomeEntry, upsertEntry } from "./src/shared/entry-factories.js";
import { filterEntries, paginate, sortByDateDescending } from "./src/shared/collections.js";
import { loadAppState } from "./src/client/state-service.js";
import { catalogDefaults } from "./src/shared/catalog-defaults.js";
import { importTransactionsCsv } from "./src/shared/csv-transactions.js";
import { importCashClosingsCsv } from "./src/shared/csv-cash-closings.js";
import { catalogImportMarkdown } from "./src/shared/catalog-import-document.js";
import { toSlug } from "./src/shared/slugs.js";
import { refreshBillings, saveCashClosing, saveCatalog, saveLimit, saveMonthlyCashClosings, saveTransaction } from "./src/client/crud-api.js";
import { buffetDailyClosings, buffetEntries, buffetMonthlyClosings, isBuffetExpense, isBuffetIncome } from "./src/shared/buffet.js";

const { expenseTypes: defaultExpenseTypes, takers: defaultTakers, locations: defaultLocations, creditors: defaultCreditors, paymentMethods: defaultPaymentMethods, incomeSources: defaultIncomeSources } = catalogDefaults;
const API_URL = new URL("api/data", document.baseURI).pathname;
let transactions = [];
let expenseTypes = [...defaultExpenseTypes];
let takers = [...defaultTakers];
let locations = [...defaultLocations];
let creditors = [...defaultCreditors];
let paymentMethods = [...defaultPaymentMethods];
let incomes = [];
let incomeSources = [...defaultIncomeSources];
let catalogMetadata = {};
let lastTransactionUpdate = null;
const pendingRegistryOrderSaves = new Set();
let cashClosings = [];
let monthlyCashClosings = [];
let billings = [];
let limits = [];
const initialState = defaultAppState({
  expenseTypes: defaultExpenseTypes,
  takers: defaultTakers,
  locations: defaultLocations,
  creditors: defaultCreditors,
  paymentMethods: defaultPaymentMethods,
  incomeSources: defaultIncomeSources,
});
const paginationState = {
  Casa: { page: 1, pageSize: 5 },
  Zanzibar: { page: 1, pageSize: 5 },
  Empréstimos: { page: 1, pageSize: 5 },
  Receitas: { page: 1, pageSize: 5 },
  Fechamentos: { page: 1, pageSize: 5 },
  FechamentosMensais: { page: 1, pageSize: 5 },
  Limites: { page: 1, pageSize: 5 },
};

const $ = (selector) => document.querySelector(selector);
const selectedMonth = () => {
  const reportPeriod = $("#report-period-select")?.value;
  if (reportPeriod) return reportPeriod;
  const month = $("#month-filter-month")?.value;
  const year = $("#month-filter-year")?.value;
  return month && year ? `${year}-${month}` : currentMonth();
};
const reportSortState = {
  daily: { field: "date", direction: "desc" },
  type: { field: "value", direction: "desc" },
  taker: { field: "value", direction: "desc" },
  "income-daily": { field: "date", direction: "desc" },
  "income-source": { field: "value", direction: "desc" },
};

async function loadData() {
  ({ transactions, incomes, cashClosings, monthlyCashClosings, billings, limits, expenseTypes, takers, locations, creditors, paymentMethods, incomeSources, catalogMetadata } = await loadAppState(API_URL, "./data.json", initialState));
  const persistedEntities = [...transactions, ...incomes];
  lastTransactionUpdate = persistedEntities.reduce((latest, item) => {
    const value = item.updatedAt || item.createdAt;
    return value && (!latest || new Date(String(value).replace(" ", "T")) > new Date(String(latest).replace(" ", "T"))) ? value : latest;
  }, null);
  const catalogs = { type: ["expense_types", expenseTypes], taker: ["takers", takers], location: ["locations", locations], creditor: ["creditors", creditors], paymentMethod: ["payment_methods", paymentMethods], incomeSource: ["income_sources", incomeSources] };
  Object.values(catalogs).forEach(([key, values]) => { catalogMetadata[key] ||= values.map((name, displayOrder) => ({ name, displayOrder, isActive: true })); });
}
function markTransactionsUpdated() {
  lastTransactionUpdate = new Date().toISOString();
  $("#last-update").textContent = formatLastTransactionUpdate(lastTransactionUpdate);
}

function captureState() {
  return { transactions: [...transactions], incomes: [...incomes], cashClosings: [...cashClosings], monthlyCashClosings: [...monthlyCashClosings], billings: [...billings], limits: [...limits], expenseTypes: [...expenseTypes], takers: [...takers], locations: [...locations], creditors: [...creditors], paymentMethods: [...paymentMethods], incomeSources: [...incomeSources], catalogMetadata: structuredClone(catalogMetadata) };
}
function restoreState(previous) {
  ({ transactions, incomes, cashClosings, monthlyCashClosings, billings, limits, expenseTypes, takers, locations, creditors, paymentMethods, incomeSources, catalogMetadata } = previous);
}

function setupFormOptions() {
  const active = (kind, values) => values.filter((name) => catalogMetadata[kind]?.find((item) => item.name === name)?.isActive !== false).sort((a, b) => kind === "expense_types" ? a.localeCompare(b, "pt-BR") : (catalogMetadata[kind]?.find((item) => item.name === a)?.displayOrder || 0) - (catalogMetadata[kind]?.find((item) => item.name === b)?.displayOrder || 0) || a.localeCompare(b, "pt-BR"));
  if (!takers.some((taker) => taker.toLowerCase() === "zanzibar")) takers.push("Zanzibar");
  const withoutBuffet = (values) => values.filter((value) => String(value).trim().toLocaleLowerCase("pt-BR") !== "buffet");
  const available = { expenseTypes: withoutBuffet(active("expense_types", expenseTypes)), takers: withoutBuffet(active("takers", takers)), locations: withoutBuffet(active("locations", locations)), creditors: withoutBuffet(active("creditors", creditors)), paymentMethods: active("payment_methods", paymentMethods), incomeSources: withoutBuffet(active("income_sources", incomeSources)) };
  $("#expense-type").innerHTML = available.expenseTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("");
  $("#taker").innerHTML = available.takers.map((taker) => `<option>${escapeHtml(taker)}</option>`).join("");
  $("#creditor").innerHTML = available.creditors.map((creditor) => `<option>${escapeHtml(creditor)}</option>`).join("");
  $("#income-source").innerHTML = available.incomeSources.map((source) => `<option>${escapeHtml(source)}</option>`).join("");
  renderLocationOptions();
  const availableMonths = [...new Set([currentMonth(), ...transactions.map((item) => item.date), ...incomes.map((item) => item.date), ...limits.map((item) => `${item.year}-${String(item.month).padStart(2, "0")}-01`)].map((date) => date.slice(0, 7)))].sort().reverse();
  const monthOptions = availableMonths.map((month) => `<option value="${month}">${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-15`))}</option>`).join("");
  document.querySelectorAll("[data-month-select]").forEach((select) => { select.innerHTML = monthOptions; select.value = currentMonth(); });
  $("#report-period-select").innerHTML = monthOptions;
  const [currentYear, currentMonthNumber] = currentMonth().split("-");
  const years = [...new Set([currentYear, ...availableMonths.map((month) => month.slice(0, 4))])].sort((a, b) => Number(b) - Number(a));
  $("#month-filter-month").innerHTML = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const label = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(Date.UTC(2020, index, 15)));
    return `<option value="${month}">${label}</option>`;
  }).join("");
  $("#month-filter-year").innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");
  $("#month-filter-month").value = currentMonthNumber;
  $("#month-filter-year").value = currentYear;
  $("#report-period-select").value = currentMonth();
  document.querySelectorAll("[data-type-filter]").forEach((filter) => {
    filter.innerHTML = `<option value="all">Todos os tipos</option>${available.expenseTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("")}`;
  });
  document.querySelectorAll("[data-taker-filter]").forEach((filter) => {
    filter.innerHTML = `<option value="all">Todos os tomadores</option>${available.takers.map((taker) => `<option>${escapeHtml(taker)}</option>`).join("")}`;
  });
  $("[data-income-source-filter]").innerHTML = `<option value="all">Todas as fontes</option>${available.incomeSources.map((source) => `<option>${escapeHtml(source)}</option>`).join("")}`;
  applyLocationRules($("#location-options").dataset.value || "Casa");
}

function monthTransactions() {
  return inMonth(transactions.filter((item) => !isBuffetExpense(item)), selectedMonth());
}
function monthIncomes() {
  return inMonth(incomes.filter((item) => !isBuffetIncome(item)), selectedMonth());
}

function selectedBuffetMonth() {
  return $("#buffet-period-select")?.value || currentMonth();
}

function renderBuffet() {
  const allEntries = buffetEntries(transactions, incomes);
  const periods = [...new Set([currentMonth(), ...allEntries.map((item) => String(item.date || "").slice(0, 7))])].filter(Boolean).sort().reverse();
  const buffetPeriod = $("#buffet-period-select");
  const previousPeriod = buffetPeriod.value || currentMonth();
  buffetPeriod.innerHTML = periods.map((item) => `<option value="${item}">${escapeHtml(new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${item}-15T12:00:00`)))}</option>`).join("");
  buffetPeriod.value = periods.includes(previousPeriod) ? previousPeriod : periods[0];
  const period = selectedBuffetMonth();
  const entries = allEntries.filter((item) => String(item.date || "").startsWith(period));
  const incomeTotal = entries.filter(isBuffetIncome).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = entries.filter(isBuffetExpense).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  $("#buffet-income-total").textContent = formatMoney(incomeTotal);
  $("#buffet-expense-total").textContent = formatMoney(-expenseTotal);
  $("#buffet-balance-total").textContent = formatMoney(incomeTotal - expenseTotal);
  $("#buffet-income-count").textContent = `${entries.filter(isBuffetIncome).length} entradas`;
  $("#buffet-expense-count").textContent = `${entries.filter(isBuffetExpense).length} saídas`;
  const entryRows = entries.map((item) => `<tr><td>${escapeHtml(formatTransactionDate(item.date))}</td><td>${item.type === "income" ? "Receita" : "Despesa"}</td><td>${escapeHtml(item.description)}</td><td class="align-right ${item.type === "income" ? "income-text" : "expense-text"}">${item.type === "income" ? "+ " : "- "}${formatMoney(item.amount)}</td><td class="align-right"><button class="action-button" data-edit-buffet="${escapeHtml(String(item.id))}" aria-label="Editar ${escapeHtml(item.description)}">•••</button></td></tr>`).join("");
  $("#buffet-entries-list").innerHTML = entryRows;
  $("#buffet-entries-empty").hidden = entries.length > 0;
  const daily = buffetDailyClosings(entries);
  $("#buffet-daily-list").innerHTML = daily.map((item) => `<tr><td>${escapeHtml(formatTransactionDate(item.date))}</td><td class="align-right income-text">${formatMoney(item.income)}</td><td class="align-right expense-text">${formatMoney(-item.expense)}</td><td class="align-right ${item.balance >= 0 ? "income-text" : "expense-text"}">${formatMoney(item.balance)}</td></tr>`).join("");
  $("#buffet-daily-empty").hidden = daily.length > 0;
  const monthly = buffetMonthlyClosings(allEntries);
  $("#buffet-monthly-list").innerHTML = monthly.map((item) => `<tr><td>${escapeHtml(new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${item.month}-15T12:00:00`)))}</td><td class="align-right income-text">${formatMoney(item.income)}</td><td class="align-right expense-text">${formatMoney(-item.expense)}</td><td class="align-right ${item.balance >= 0 ? "income-text" : "expense-text"}">${formatMoney(item.balance)}</td></tr>`).join("");
  $("#buffet-monthly-empty").hidden = monthly.length > 0;
  renderBuffetCalendar(entries, period);
}

function renderBuffetCalendar(entries, period) {
  const [year, monthNumber] = period.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const daily = new Map(buffetDailyClosings(entries).map((item) => [item.date, item]));
  const cells = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => `<div class="calendar-weekday">${day}</div>`);
  for (let index = 0; index < firstDay; index += 1) cells.push('<div class="calendar-day calendar-day-empty" aria-hidden="true"></div>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${period}-${String(day).padStart(2, "0")}`;
    const item = daily.get(date) || { income: 0, expense: 0, balance: 0 };
    cells.push(`<article class="calendar-day"><strong class="calendar-date">${day}</strong><div class="calendar-values"><span class="calendar-income">Entradas <b>${formatMoney(item.income)}</b></span><span class="calendar-expense">Saídas <b>${formatMoney(-item.expense)}</b></span></div><div class="calendar-balance ${item.balance >= 0 ? "calendar-balance-positive" : "calendar-balance-negative"}"><span>Saldo</span><strong>${formatMoney(item.balance)}</strong></div></article>`);
  }
  $("#buffet-calendar").innerHTML = cells.join("");
}

function renderSummary() {
  const summary = summarize([...monthTransactions(), ...monthIncomes()], selectedMonth());
  const [limitYear, limitMonth] = selectedMonth().split("-").map(Number);
  const limit = limits.find((item) => item.year === limitYear && item.month === limitMonth);
  const incomeCount = summary.items.filter((item) => item.type === "income").length;
  const locationSummary = (location) => {
    const items = monthTransactions().filter((item) => item.location === location);
    return {
      amount: items.reduce((total, item) => total + Number(item.amount || 0), 0),
      count: items.length,
    };
  };
  const home = locationSummary("Casa");
  const business = locationSummary("Zanzibar");
  const loans = locationSummary("Empréstimos");
  $("#summary-limit-target").textContent = formatMoney(limit?.target || 0);
  $("#summary-limit-budget").textContent = formatMoney(limit?.budget || 0);
  $("#summary-limit-forecast").textContent = formatMoney(limit?.forecast || 0);
  $("#summary-limit-patamar").textContent = formatMoney(limit?.patamar || 0);
  $("#summary-limit-result").textContent = formatMoney(limit?.result || 0);
  $("#income-value").textContent = formatMoney(summary.income);
  $("#income-caption").textContent = `${incomeCount} ${incomeCount === 1 ? "entrada registrada" : "entradas registradas"}`;
  $("#home-expense-value").textContent = formatMoney(-home.amount);
  $("#home-expense-caption").textContent = `${home.count} ${home.count === 1 ? "despesa registrada" : "despesas registradas"}`;
  $("#business-expense-value").textContent = formatMoney(-business.amount);
  $("#business-expense-caption").textContent = `${business.count} ${business.count === 1 ? "despesa registrada" : "despesas registradas"}`;
  $("#loans-expense-value").textContent = formatMoney(-loans.amount);
  $("#loans-expense-caption").textContent = `${loans.count} ${loans.count === 1 ? "despesa registrada" : "despesas registradas"}`;
  $("#expense-section-total").textContent = `(${formatMoney(summary.expense)})`;
  $("#income-section-total").textContent = `(${formatMoney(summary.income)})`;
  document.querySelectorAll("[data-location-panel]").forEach((panel) => {
    const location = panel.dataset.locationPanel;
    const total = monthTransactions().filter((item) => item.location === location).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    panel.querySelector("[data-location-total]").textContent = `(${formatMoney(total)})`;
  });
  const balanceValue = $("#balance-value");
  balanceValue.textContent = formatMoney(summary.balance);
  balanceValue.classList.toggle("value-positive", summary.balance >= 0);
  balanceValue.classList.toggle("value-negative", summary.balance < 0);
}

function renderFinancialCalendar() {
  const month = selectedMonth();
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const entries = new Map();
  const addEntry = (date, callback) => {
    if (!entries.has(date)) entries.set(date, { home: 0, zanzibar: 0, loans: 0, income: 0 });
    callback(entries.get(date));
  };
  monthTransactions().forEach((item) => addEntry(item.date, (day) => {
    const amount = Number(item.amount || 0);
    if (item.location === "Casa") day.home += amount;
    if (item.location === "Zanzibar") day.zanzibar += amount;
    if (item.location === "Empréstimos") day.loans += amount;
  }));
  monthIncomes().forEach((item) => addEntry(item.date, (day) => { day.income += Number(item.amount || 0); }));
  const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, monthNumber - 1, 15)));
  $("#calendar-period").textContent = monthLabel;
  const cells = weekdays.map((weekday) => `<div class="calendar-weekday">${weekday}</div>`);
  for (let index = 0; index < firstDay; index += 1) cells.push('<div class="calendar-day calendar-day-empty" aria-hidden="true"></div>');
  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = `${month}-${String(dayNumber).padStart(2, "0")}`;
    const values = entries.get(date) || { home: 0, zanzibar: 0, loans: 0, income: 0 };
    const balance = values.income - values.home - values.zanzibar - values.loans;
    const balanceClass = balance > 0 ? "calendar-balance-positive" : balance < 0 ? "calendar-balance-negative" : "calendar-balance-zero";
    const balanceSign = balance > 0 ? "+ " : balance < 0 ? "− " : "";
    const balanceLabel = `${balanceSign}${formatMoney(Math.abs(balance))}`;
    const weekday = new Date(Date.UTC(year, monthNumber - 1, dayNumber)).getUTCDay();
    cells.push(`<article class="calendar-day ${weekday === 0 ? "calendar-day-sunday" : ""} ${weekday === 6 ? "calendar-day-saturday" : ""}">
      <strong class="calendar-date">${dayNumber}</strong>
      <div class="calendar-values">
        <span class="calendar-expense">Casa <b>${formatMoney(-values.home)}</b></span>
        <span class="calendar-expense">Zanzibar <b>${formatMoney(-values.zanzibar)}</b></span>
        <span class="calendar-expense">Empréstimos <b>${formatMoney(-values.loans)}</b></span>
        <span class="calendar-income">Receitas <b>${formatMoney(values.income)}</b></span>
      </div>
      <div class="calendar-balance ${balanceClass}"><span>Saldo</span><strong>${balanceLabel}</strong></div>
    </article>`);
  }
  $("#financial-calendar").innerHTML = cells.join("");
}

function renderLocationTransactions(location) {
  const panel = document.querySelector(`[data-location-panel="${location}"]`);
  const state = paginationState[location];
  const query = panel.querySelector("[data-search]").value.toLowerCase().trim();
  const type = panel.querySelector("[data-type-filter]").value;
  const taker = panel.querySelector("[data-taker-filter]").value;
  const filtered = sortByDateDescending(filterEntries(monthTransactions(), {
    query,
    fields: ["description", "expenseType", "taker", "location", "creditor"],
    filters: { location, expenseType: type, taker },
  }));
  const paged = paginate(filtered, state.page, state.pageSize);
  state.page = paged.page;
  const { items: pageItems, totalPages } = paged;
  panel.querySelector("[data-transactions-list]").innerHTML = pageItems.map((item) => `<tr>
    <td>${escapeHtml(formatTransactionDate(item.date))}</td><td><div class="transaction-description"><span class="transaction-icon expense">↘</span>${escapeHtml(item.description)}</div></td>
    <td><span class="tag">${escapeHtml(item.expenseType)}</span></td><td>${escapeHtml(item.taker)}</td><td>${escapeHtml(item.creditor)}</td>
    <td class="align-right expense-text">- ${formatMoney(item.amount)}</td>
    <td class="align-right"><button class="action-button" data-edit="${item.id}" aria-label="Editar ${escapeHtml(item.description)}">•••</button></td></tr>`).join("");
  panel.querySelector("[data-empty-state]").hidden = filtered.length > 0;
  panel.querySelector("[data-pagination-status]").textContent = `Página ${state.page} de ${totalPages}`;
  panel.querySelector("[data-pagination-prev]").disabled = state.page === 1;
  panel.querySelector("[data-pagination-next]").disabled = state.page === totalPages;
}

function renderTransactions() {
  ["Casa", "Zanzibar", "Empréstimos"].forEach(renderLocationTransactions);
  renderIncomeTransactions();
}

function renderIncomeTransactions() {
  const panel = $("[data-income-panel]");
  const state = paginationState.Receitas;
  const query = panel.querySelector("[data-income-search]").value.toLowerCase().trim();
  const source = panel.querySelector("[data-income-source-filter]").value;
  const filtered = sortByDateDescending(filterEntries(monthIncomes(), {
    query,
    fields: ["description", "source"],
    filters: { source },
  }));
  const paged = paginate(filtered, state.page, state.pageSize);
  state.page = paged.page;
  const { items: pageItems, totalPages } = paged;
  panel.querySelector("[data-income-list]").innerHTML = pageItems.map((item) => `<tr><td>${escapeHtml(formatTransactionDate(item.date))}</td><td><div class="transaction-description"><span class="transaction-icon income">↗</span>${escapeHtml(item.description)}</div></td><td>${escapeHtml(item.source)}</td><td class="align-right income-text">+ ${formatMoney(item.amount)}</td><td class="align-right"><button class="action-button" data-edit-income="${item.id}" aria-label="Editar ${escapeHtml(item.description)}">•••</button></td></tr>`).join("");
  panel.querySelector("[data-income-empty]").hidden = filtered.length > 0;
  panel.querySelector("[data-income-pagination-status]").textContent = `Página ${state.page} de ${totalPages}`;
  panel.querySelector("[data-income-pagination-prev]").disabled = state.page === 1;
  panel.querySelector("[data-income-pagination-next]").disabled = state.page === totalPages;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}
function normalizeCatalogValue(value) {
  const text = String(value || "");
  const repaired = /[ÃÂ]/.test(text)
    ? new TextDecoder("utf-8").decode(Uint8Array.from(text, (character) => character.charCodeAt(0)))
    : text;
  return repaired.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function render() { renderSummary(); renderFinancialCalendar(); renderTransactions(); renderBuffet(); }

function renderReports() {
  const items = monthTransactions();
  const incomeItems = monthIncomes();
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const incomeTotal = incomeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const sortEntries = (entries, state) => [...entries].sort((a, b) => {
    const comparison = state.field === "value" ? a[1] - b[1] : String(a[0]).localeCompare(String(b[0]), "pt-BR", { numeric: true });
    return state.direction === "asc" ? comparison : -comparison;
  });
  const rows = (entries) => entries.length ? entries.map(([label, value]) => `<div class="report-row"><span>${escapeHtml(label)}</span><strong>${formatMoney(value)}</strong><i><b style="width:${total ? value / total * 100 : 0}%"></b></i></div>`).join("") : `<p class="muted">Nenhuma despesa neste período.</p>`;
  const dailyEntries = Object.entries(items.reduce((result, item) => { result[item.date] = (result[item.date] || 0) + item.amount; return result; }, {})).map(([date, value]) => [date, value]);
  const groupedEntries = (key) => groupTotals(items, key).map(([label, value]) => [label, value]);
  const daily = sortEntries(dailyEntries, reportSortState.daily).map(([date, value]) => [formatDate(date), value]);
  $("#daily-report").innerHTML = rows(daily);
  $("#type-report").innerHTML = rows(sortEntries(groupedEntries("expenseType"), reportSortState.type));
  $("#taker-report").innerHTML = rows(sortEntries(groupedEntries("taker"), reportSortState.taker));
  $("#report-total").textContent = formatMoney(total);
  const incomeRows = (entries) => entries.length ? entries.map(([label, value]) => `<div class="report-row"><span>${escapeHtml(label)}</span><strong>${formatMoney(value)}</strong><i><b style="width:${incomeTotal ? value / incomeTotal * 100 : 0}%"></b></i></div>`).join("") : `<p class="muted">Nenhuma receita neste período.</p>`;
  const dailyIncome = Object.entries(incomeItems.reduce((result, item) => { result[item.date] = (result[item.date] || 0) + Number(item.amount || 0); return result; }, {})).map(([date, value]) => [date, value]);
  const groupedIncome = (key) => Object.entries(incomeItems.reduce((result, item) => { const label = item[key] || "Sem cadastro"; result[label] = (result[label] || 0) + Number(item.amount || 0); return result; }, {}));
  $("#income-daily-report").innerHTML = incomeRows(sortEntries(dailyIncome, reportSortState["income-daily"]).map(([date, value]) => [formatDate(date), value]));
  $("#income-source-report").innerHTML = incomeRows(sortEntries(groupedIncome("source"), reportSortState["income-source"]));
  $("#income-report-total").textContent = formatMoney(incomeTotal);
}

function renderRegistries() {
  const renderList = (items, kind) => {
    const visibleItems = items.map((item, index) => ({ item, index })).filter(({ item }) => String(item).trim().toLocaleLowerCase("pt-BR") !== "buffet");
    return visibleItems.length ? visibleItems.map(({ item, index }) => {
    const table = { type: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" }[kind];
    const metadata = catalogMetadata[table]?.find((entry) => entry.name === item) || { displayOrder: 0, isActive: true };
    const sortable = ["taker", "creditor", "paymentMethod", "incomeSource"].includes(kind);
    const orderControl = sortable ? `<input class="registry-order" data-catalog-order="${kind}" data-registry-index="${index}" type="text" inputmode="numeric" pattern="[0-9]*" value="${metadata.displayOrder}" aria-label="Ordem de ${escapeHtml(item)}" />` : "";
    return `<li class="${sortable ? "registry-sortable" : ""}" ${sortable ? `draggable="true" data-registry-drag-kind="${kind}" data-registry-drag-index="${index}"` : ""}>${sortable ? `<span class="registry-drag-hint" aria-hidden="true">⠿</span>` : ""}<span class="registry-name">${orderControl}${escapeHtml(item)}</span><span class="registry-actions"><label class="switch" title="${metadata.isActive ? "Ativo" : "Inativo"}"><input data-catalog-status="${kind}" data-registry-index="${index}" type="checkbox" ${metadata.isActive ? "checked" : ""} aria-label="${metadata.isActive ? "Desativar" : "Ativar"} ${escapeHtml(item)}" /><span class="switch-track" aria-hidden="true"></span></label><button type="button" class="registry-action" data-edit-registry="${kind}" data-registry-index="${index}" aria-label="Editar ${escapeHtml(item)}">✎</button><button type="button" class="registry-action danger registry-delete" data-delete-registry="${kind}" data-registry-index="${index}" aria-label="Excluir ${escapeHtml(item)}">×</button></span></li>`;
    }).join("") + (pendingRegistryOrderSaves.has(kind) ? `<li class="registry-order-save-row"><button type="button" class="small-button registry-order-save" data-save-registry-order="${kind}">Salvar Ordem</button></li>` : "") : `<li class="registry-empty">Nenhum cadastro criado.</li>`;
  };
  $("#type-registry-list").innerHTML = renderList(expenseTypes, "type");
  $("#taker-registry-list").innerHTML = renderList(takers, "taker");
  $("#creditor-registry-list").innerHTML = renderList(creditors, "creditor");
  $("#payment-method-registry-list").innerHTML = renderList(paymentMethods, "paymentMethod");
  $("#income-source-registry-list").innerHTML = renderList(incomeSources, "incomeSource");
}

$("#download-auxiliary-tables").addEventListener("click", () => {
  const catalogs = { expense_types: expenseTypes, takers, locations, creditors, payment_methods: paymentMethods, income_sources: incomeSources };
  const markdown = catalogImportMarkdown(catalogMetadata, catalogs);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`\uFEFF${markdown}`], { type: "text/markdown;charset=utf-8" }));
  link.download = "tabelas-auxiliares-importacao.md";
  link.click();
  URL.revokeObjectURL(link.href);
});

function renderCashClosings() {
  const orderedPaymentMethods = activeCatalog("payment_methods", paymentMethods);
  const paymentMethodOrder = new Map(orderedPaymentMethods.map((method, index) => [normalizeCatalogValue(method), index]));
  const sortRowsByPaymentMethod = (rows) => [...rows].sort((a, b) => {
    const orderA = paymentMethodOrder.get(normalizeCatalogValue(a.paymentMethod));
    const orderB = paymentMethodOrder.get(normalizeCatalogValue(b.paymentMethod));
    return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
  });
  const grouped = [...new Map([...cashClosings].sort((a, b) => b.date.localeCompare(a.date)).map((item) => [item.date, cashClosings.filter((entry) => entry.date === item.date)])).entries()];
  const state = paginationState.Fechamentos;
  const paged = paginate(grouped, state.page, state.pageSize);
  state.page = paged.page;
  $("#cash-closings-list").innerHTML = paged.items.map(([date, rows]) => {
    rows = sortRowsByPaymentMethod(rows);
    const paymentMethods = rows.map((item) => `<div>${escapeHtml(item.paymentMethod)}</div>`).join("");
    const sales = rows.map((item) => `<div>${item.saleCount}</div>`).join("");
    const amounts = rows.map((item) => `<div>${formatMoney(item.totalAmount)}</div>`).join("");
    const totalAmount = rows.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    const totalSales = rows.reduce((sum, item) => sum + Number(item.saleCount || 0), 0);
    return `<tr><td>${escapeHtml(formatTransactionDate(date))}</td><td><div class="cash-closing-stack">${paymentMethods}</div></td><td><div class="cash-closing-stack">${sales}</div></td><td class="align-right"><div class="cash-closing-stack cash-closing-stack-total">${amounts}</div></td><td class="align-right income-text"><div class="cash-closing-stack cash-closing-stack-total"><strong>${formatMoney(totalAmount)}</strong><strong>${totalSales} vendas</strong></div></td><td class="align-right"><button class="action-button" data-edit-cash-closing-date="${escapeHtml(date)}" aria-label="Editar fechamento de ${escapeHtml(formatTransactionDate(date))}">•••</button></td></tr>`;
  }).join("");
  $("#cash-closings-empty").hidden = cashClosings.length > 0;
  $("#cash-closing-pagination-status").textContent = `Página ${state.page} de ${paged.totalPages}`;
  $("#cash-closing-pagination-prev").disabled = state.page === 1;
  $("#cash-closing-pagination-next").disabled = state.page === paged.totalPages;
  renderMonthlyCashClosings(sortRowsByPaymentMethod);
}

function renderMonthlyCashClosings(sortRowsByPaymentMethod) {
  const grouped = new Map();
  monthlyCashClosings.forEach((item) => {
    const month = `${item.year}-${String(item.month).padStart(2, "0")}`;
    const key = `${month}:${normalizeCatalogValue(item.paymentMethod)}`;
    const current = grouped.get(key) || { month, paymentMethod: item.paymentMethod, saleCount: 0, totalAmount: 0 };
    current.saleCount += Number(item.saleCount || 0);
    current.totalAmount += Number(item.totalAmount || 0);
    grouped.set(key, current);
  });
  const monthly = new Map();
  [...grouped.values()].forEach((item) => { const rows = monthly.get(item.month) || []; rows.push(item); monthly.set(item.month, rows); });
  const state = paginationState.FechamentosMensais;
  const currentMonthKey = currentMonth();
  const currentCashRows = cashClosings
    .filter((item) => String(item.date || "").slice(0, 7) === currentMonthKey)
    .reduce((rows, item) => {
      const key = normalizeCatalogValue(item.paymentMethod);
      const current = rows.get(key) || { month: currentMonthKey, paymentMethod: item.paymentMethod, saleCount: 0, totalAmount: 0 };
      current.saleCount += Number(item.saleCount || 0);
      current.totalAmount += Number(item.totalAmount || 0);
      rows.set(key, current);
      return rows;
    }, new Map());
  const currentBilling = billings.find((item) => `${item.year}-${String(item.month).padStart(2, "0")}` === currentMonthKey);
  const currentMonthRows = currentCashRows.size
    ? [...currentCashRows.values()]
    : currentBilling
      ? [{ month: currentMonthKey, paymentMethod: "Total do mês", saleCount: Number(currentBilling.saleCount || 0), totalAmount: Number(currentBilling.amount || 0) }]
      : monthly.get(currentMonthKey);
  const otherMonths = [...monthly.entries()].filter(([month]) => month !== currentMonthKey).sort(([a], [b]) => b.localeCompare(a));
  const paged = paginate(otherMonths, state.page, state.pageSize);
  state.page = paged.page;
  const renderMonthlyRow = (month, rows, current = false) => {
    rows = sortRowsByPaymentMethod(rows);
    const paymentMethods = rows.map((item) => `<div>${escapeHtml(item.paymentMethod)}</div>`).join("");
    const sales = rows.map((item) => `<div>${item.saleCount}</div>`).join("");
    const amounts = rows.map((item) => `<div>${formatMoney(item.totalAmount)}</div>`).join("");
    const totalAmount = rows.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalSales = rows.reduce((sum, item) => sum + item.saleCount, 0);
    const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00`));
    return `<tr class="${current ? "monthly-current-row" : ""}"><td>${escapeHtml(monthLabel)}</td><td><div class="cash-closing-stack">${paymentMethods}</div></td><td><div class="cash-closing-stack">${sales}</div></td><td class="align-right"><div class="cash-closing-stack cash-closing-stack-total">${amounts}</div></td><td class="align-right income-text"><div class="cash-closing-stack cash-closing-stack-total"><strong>${formatMoney(totalAmount)}</strong><strong>${totalSales} vendas</strong></div></td><td class="align-right"><button class="action-button" data-edit-monthly-cash-closing="${month}" aria-label="Editar fechamento de ${escapeHtml(monthLabel)}">•••</button></td></tr>`;
  };
  $("#monthly-cash-closings-list").innerHTML = (currentMonthRows ? renderMonthlyRow(currentMonthKey, currentMonthRows, true) : "")
    + paged.items.map(([month, rows]) => renderMonthlyRow(month, rows)).join("");
  $("#monthly-cash-closings-empty").hidden = monthly.size > 0;
  $("#monthly-cash-closing-pagination-status").textContent = `Página ${state.page} de ${paged.totalPages}`;
  $("#monthly-cash-closing-pagination-prev").disabled = state.page === 1;
  $("#monthly-cash-closing-pagination-next").disabled = state.page === paged.totalPages;
}

function renderBillings() {
  const rows = [...billings].sort((a, b) => `${b.year}-${String(b.month).padStart(2, "0")}`.localeCompare(`${a.year}-${String(a.month).padStart(2, "0")}`));
  const currentPeriod = currentMonth();
  const closedRows = rows.filter((item) => `${item.year}-${String(item.month).padStart(2, "0")}` !== currentPeriod);
  const summaryRows = [
    ["12 últimos meses", closedRows.slice(0, 12)],
    ["6 últimos meses", closedRows.slice(0, 6)],
    ["3 últimos meses", closedRows.slice(0, 3)],
  ].map(([label, periodRows]) => {
    const totalSales = periodRows.reduce((sum, item) => sum + Number(item.saleCount || 0), 0);
    const totalAmount = periodRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const monthCount = periodRows.length;
    const averageSales = monthCount ? Math.ceil(totalSales / monthCount) : 0;
    const averageAmount = monthCount ? totalAmount / monthCount : 0;
    const averageTicket = totalSales ? totalAmount / totalSales : 0;
    const formatSales = (value) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return `<tr class="billing-summary-row"><td>${label}</td><td>Total: ${formatSales(totalSales)}<br>Média: ${formatSales(averageSales)}</td><td class="align-right">${formatMoney(averageTicket)}</td><td class="align-right">Total: ${formatMoney(totalAmount)}<br>Média: ${formatMoney(averageAmount)}</td></tr>`;
  }).join("");
  $("#billings-list").innerHTML = summaryRows + rows.map((item) => {
    const periodKey = `${item.year}-${String(item.month).padStart(2, "0")}`;
    const period = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${item.year}-${String(item.month).padStart(2, "0")}-15T12:00:00`));
    return `<tr class="${periodKey === currentPeriod ? "billing-current-row" : ""}"><td>${escapeHtml(period)}</td><td>${item.saleCount}</td><td class="align-right">${formatMoney(item.averageTicket)}</td><td class="align-right income-text"><strong>${formatMoney(item.amount)}</strong></td></tr>`;
  }).join("");
  $("#billings-empty").hidden = rows.length > 0;
}

function renderLimits() {
  const state = paginationState.Limites;
  const paged = paginate([...limits].sort((a, b) => (b.year - a.year) || (b.month - a.month)), state.page, state.pageSize);
  state.page = paged.page;
  $("#limits-list").innerHTML = paged.items.map((item) => {
    const period = `${String(item.month).padStart(2, "0")}/${item.year}`;
    const status = item.closed ? '<span class="status-badge">Fechado</span>' : '<span class="status-badge status-open">Aberto</span>';
    return `<tr><td>${period}</td><td class="align-right">${formatMoney(item.target)}</td><td class="align-right">${formatMoney(item.budget)}</td><td class="align-right">${formatMoney(item.forecast)}</td><td class="align-right">${formatMoney(item.patamar)}</td><td class="align-right">${formatMoney(item.result)}</td><td>${status}</td><td class="align-right"><button class="action-button" data-edit-limit="${item.id}" aria-label="Editar limite">•••</button></td></tr>`;
  }).join("");
  $("#limits-empty").hidden = limits.length > 0;
  $("#limit-pagination-status").textContent = `Página ${state.page} de ${paged.totalPages}`;
  $("#limit-pagination-prev").disabled = state.page === 1;
  $("#limit-pagination-next").disabled = state.page === paged.totalPages;
}

function activeCatalog(table, values) {
  return values.filter((name) => catalogMetadata[table]?.find((item) => item.name === name)?.isActive !== false)
    .sort((a, b) => table === "expense_types"
      ? a.localeCompare(b, "pt-BR")
      : (catalogMetadata[table]?.find((item) => item.name === a)?.displayOrder || 0)
        - (catalogMetadata[table]?.find((item) => item.name === b)?.displayOrder || 0)
        || a.localeCompare(b, "pt-BR"));
}

function openDialog(item) {
  if (item && isBuffetExpense(item)) return showFeedback("Movimentações do Buffet devem ser editadas no menu Buffet.");
  $("#dialog-title").textContent = item ? "Editar despesa" : "Nova despesa";
  $("#transaction-id").value = item?.id || "";
  $("#description").value = item?.description || "";
  $("#amount").value = item ? formatInputAmount(item.amount) : "";
  setLocation(item?.location || "Casa");
  const expenseType = item?.expenseType || expenseTypes[0];
  const taker = item?.taker || takers[0];
  const creditor = item?.creditor || (creditors.includes("Caixa") ? "Caixa" : creditors[0] || "Caixa");
  if (expenseTypes.includes(expenseType)) $("#expense-type").value = expenseType;
  if (Array.from($("#taker").options).some((option) => option.value === taker)) $("#taker").value = taker;
  if (Array.from($("#creditor").options).some((option) => option.value === creditor)) $("#creditor").value = creditor;
  $("#date").value = item?.date || localDate();
  $("#transaction-dialog").showModal();
  requestAnimationFrame(() => $("#description").focus());
}

function openIncomeDialog(item) {
  if (item && isBuffetIncome(item)) return showFeedback("Receitas do Buffet devem ser editadas no menu Buffet.");
  $("#income-dialog-title").textContent = item ? "Editar receita" : "Nova receita";
  $("#income-id").value = item?.id || "";
  $("#income-description").value = item?.description || "";
  $("#income-amount").value = item ? formatInputAmount(item.amount) : "";
  $("#income-source").value = item?.source || incomeSources[0];
  $("#income-date").value = item?.date || localDate();
  $("#income-dialog").showModal();
  requestAnimationFrame(() => $("#income-description").focus());
}

let feedbackTimer;
function showFeedback(message, persistent = false) {
  $("#feedback").textContent = message;
  $("#feedback").classList.add("visible");
  clearTimeout(feedbackTimer);
  if (!persistent) feedbackTimer = setTimeout(() => $("#feedback").classList.remove("visible"), 4000);
}
function showRegistryDeleteError() {
  $("#registry-error-dialog").showModal();
}

$("#transaction-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#transaction-id").value;
  const amount = parseInputAmount($("#amount").value);
  if (!amount) return showFeedback("Informe um valor maior que zero.");
  const item = createExpenseEntry({
    description: $("#description").value,
    amount,
    expenseType: $("#expense-type").value,
    taker: $("#taker").value,
    location: $("#location-options").dataset.value || "Casa",
    creditor: $("#creditor").value,
    date: $("#date").value,
  }, id);
  const previous = captureState();
  transactions = upsertEntry(transactions, item);
  saveTransaction(API_URL, item).then(() => { markTransactionsUpdated(); setupFormOptions(); render(); renderReports(); renderRegistries(); $("#transaction-dialog").close(); showFeedback(id ? "Despesa atualizada." : "Despesa adicionada."); }).catch((error) => { console.error("Falha ao salvar despesa.", error); restoreState(previous); setupFormOptions(); render(); renderReports(); renderRegistries(); showFeedback(`Não foi possível salvar a despesa: ${error.message}`); });
});
$("#income-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#income-id").value;
  const amount = parseInputAmount($("#income-amount").value);
  if (!amount) return showFeedback("Informe um valor maior que zero.");
  const item = createIncomeEntry({
    description: $("#income-description").value,
    amount,
    source: $("#income-source").value,
    date: $("#income-date").value,
  }, id);
  const previous = captureState();
  incomes = upsertEntry(incomes, item);
  saveTransaction(API_URL, item).then(() => { markTransactionsUpdated(); setupFormOptions(); render(); renderReports(); renderRegistries(); $("#income-dialog").close(); showFeedback(id ? "Receita atualizada." : "Receita adicionada."); }).catch((error) => { console.error(error); restoreState(previous); setupFormOptions(); render(); renderReports(); renderRegistries(); showFeedback("Não foi possível salvar a receita."); });
});
function renderLocationOptions() {
  const selected = $("#location-options").dataset.value || "Casa";
  const locationOrder = ["Casa", "Zanzibar", "Empréstimos"];
  const activeLocations = locationOrder
    .filter((name) => locations.includes(name) && catalogMetadata.locations?.find((item) => item.name === name)?.isActive !== false)
    .concat(locations.filter((name) => !locationOrder.includes(name) && catalogMetadata.locations?.find((item) => item.name === name)?.isActive !== false));
  $("#location-options").innerHTML = activeLocations.map((location) => `<button type="button" class="location-option${location === selected ? " selected" : ""}" role="radio" aria-checked="${location === selected}" data-location="${escapeHtml(location)}"><span class="location-radio" aria-hidden="true"></span>${escapeHtml(location)}</button>`).join("");
}
function setLocation(location) {
  $("#location-options").dataset.value = location;
  $("#location-options").querySelectorAll("[data-location]").forEach((option) => {
    const selected = option.dataset.location === location;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-checked", String(selected));
  });
  applyLocationRules(location);
}
function applyLocationRules(location) {
  const taker = $("#taker");
  const creditor = $("#creditor");
  const expenseType = $("#expense-type");
  if (location === "Empréstimos") {
    expenseType.innerHTML = "<option>Empréstimo</option>";
    expenseType.value = "Empréstimo";
    taker.innerHTML = "<option>Zanzibar</option>";
    taker.value = "Zanzibar";
    taker.disabled = true;
    taker.setAttribute("aria-disabled", "true");
    const availableCreditors = creditors.filter((item) => item !== "Caixa");
    creditor.innerHTML = availableCreditors.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
    creditor.value = availableCreditors.includes(creditor.value) ? creditor.value : availableCreditors[0] || "";
    creditor.disabled = false;
    creditor.removeAttribute("aria-disabled");
    expenseType.disabled = true;
    expenseType.setAttribute("aria-disabled", "true");
    return;
  }
  const availableExpenseTypes = activeCatalog("expense_types", expenseTypes).filter((item) => item !== "Empréstimo");
  expenseType.innerHTML = availableExpenseTypes.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  expenseType.disabled = false;
  expenseType.removeAttribute("aria-disabled");
  if (location === "Casa") {
    const availableTakers = takers.filter((item) => item !== "Zanzibar");
    creditor.innerHTML = "<option>Caixa</option>";
    creditor.value = "Caixa";
    creditor.disabled = true;
    creditor.setAttribute("aria-disabled", "true");
    taker.innerHTML = availableTakers.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
    taker.value = availableTakers.includes(taker.value) ? taker.value : availableTakers[0] || "";
    taker.disabled = false;
    taker.removeAttribute("aria-disabled");
    return;
  }
  if (location === "Zanzibar") {
    taker.innerHTML = "<option>Zanzibar</option>";
    taker.value = "Zanzibar";
    taker.disabled = true;
    taker.setAttribute("aria-disabled", "true");
    creditor.innerHTML = "<option>Caixa</option>";
    creditor.value = "Caixa";
    creditor.disabled = true;
    creditor.setAttribute("aria-disabled", "true");
    return;
  }
  taker.innerHTML = takers.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  creditor.innerHTML = creditors.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  taker.disabled = false;
  creditor.disabled = false;
  taker.removeAttribute("aria-disabled");
  creditor.removeAttribute("aria-disabled");
}
$("#location-options").addEventListener("click", (event) => {
  const option = event.target.closest("[data-location]");
  if (!option) return;
  setLocation(option.dataset.location);
});
$("#new-transaction").addEventListener("click", () => openDialog());
let pendingCsvEntries = [];
let pendingCsvErrors = 0;
function resetImportDialog() {
  pendingCsvEntries = [];
  pendingCsvErrors = 0;
  $("#transactions-csv").value = "";
  $("#import-summary").textContent = "";
  $("#import-summary").hidden = true;
  $("#import-errors").hidden = true;
  $("#import-errors").textContent = "";
  $("#confirm-import").disabled = true;
}
$("#import-transactions").addEventListener("click", () => { resetImportDialog(); $("#import-dialog").showModal(); });
$("#close-import-dialog").addEventListener("click", () => $("#import-dialog").close());
$("#cancel-import-dialog").addEventListener("click", () => $("#import-dialog").close());
$("#close-import-confirm-dialog").addEventListener("click", () => $("#import-confirm-dialog").close());
$("#cancel-import-confirm-dialog").addEventListener("click", () => $("#import-confirm-dialog").close());
$("#transactions-csv").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  pendingCsvEntries = [];
  pendingCsvErrors = 0;
  $("#import-summary").textContent = "";
  $("#import-summary").hidden = true;
  $("#import-errors").hidden = true;
  $("#import-errors").textContent = "";
  $("#confirm-import").disabled = true;
  if (!file) return;
  try {
    const result = importTransactionsCsv(await file.text());
    pendingCsvEntries = result.entries;
    pendingCsvErrors = result.errors.length;
    $("#import-summary").textContent = `${result.entries.length} linha(s) pronta(s) para importar${result.errors.length ? `; ${result.errors.length} inválida(s)` : ""}.`;
    $("#import-summary").hidden = false;
    if (result.errors.length) {
      $("#import-errors").innerHTML = result.errors.map((error) => `<div>Linha ${error.line}: ${escapeHtml(error.message)}</div>`).join("");
      $("#import-errors").hidden = false;
    }
    $("#confirm-import").disabled = !pendingCsvEntries.length;
  } catch (error) {
    $("#import-summary").textContent = error.message;
    $("#import-summary").hidden = false;
  }
});
$("#import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingCsvEntries.length) return;
  const expenses = pendingCsvEntries.filter((entry) => entry.type === "expense").length;
  const incomes = pendingCsvEntries.length - expenses;
  const dates = pendingCsvEntries.map((entry) => entry.date).sort();
  $("#import-confirm-count").textContent = String(pendingCsvEntries.length);
  $("#import-confirm-expenses").textContent = String(expenses);
  $("#import-confirm-incomes").textContent = String(incomes);
  $("#import-confirm-errors").textContent = String(pendingCsvErrors);
  $("#import-confirm-period").textContent = dates.length
    ? `Período: ${formatTransactionDate(dates[0])} a ${formatTransactionDate(dates.at(-1))}.`
    : "";
  $("#import-confirm-dialog").showModal();
});
$("#import-confirm-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingCsvEntries.length) return;
  const previous = captureState();
  const catalogValues = {
    expenseType: [expenseTypes, "expense_types"],
    taker: [takers, "takers"],
    location: [locations, "locations"],
    creditor: [creditors, "creditors"],
    source: [incomeSources, "income_sources"],
  };
  const catalogOperations = [];
  pendingCsvEntries.forEach((entry) => {
    const fields = entry.type === "income" ? ["source"] : ["expenseType", "taker", "location", "creditor"];
    fields.forEach((field) => {
      const [list, table] = catalogValues[field];
      if (!entry[field] || list.some((value) => normalizeCatalogValue(value) === normalizeCatalogValue(entry[field]))) return;
      list.push(entry[field]);
      catalogMetadata[table] ||= [];
      catalogMetadata[table].push({ name: entry[field], slug: toSlug(entry[field]), displayOrder: catalogMetadata[table].length, isActive: true });
      catalogOperations.push({ action: "add", kind: { expenseType: "type", taker: "taker", location: "location", creditor: "creditor", source: "incomeSource" }[field], name: entry[field], displayOrder: catalogMetadata[table].length - 1 });
    });
  });
  pendingCsvEntries.forEach((entry) => {
    if (entry.type === "income") incomes = upsertEntry(incomes, entry);
    else transactions = upsertEntry(transactions, entry);
  });
  const imported = pendingCsvEntries.length;
  Promise.all([...catalogOperations.map((operation) => saveCatalog(API_URL, operation)), ...pendingCsvEntries.map((entry) => saveTransaction(API_URL, entry))]).then(() => {
    markTransactionsUpdated();
    setupFormOptions();
    render();
    renderReports();
    renderRegistries();
    $("#import-confirm-dialog").close();
    $("#import-dialog").close();
    $("#import-result-count").textContent = String(imported);
    const skipped = $("#import-result-skipped");
    skipped.textContent = pendingCsvErrors
      ? `${pendingCsvErrors} linha(s) inválida(s) foram ignoradas e não foram gravadas.`
      : "Todas as linhas do arquivo foram importadas.";
    skipped.hidden = false;
    $("#import-result-dialog").showModal();
    pendingCsvEntries = [];
    pendingCsvErrors = 0;
  }).catch((error) => {
    console.error("Falha ao importar transações.", error);
    restoreState(previous);
    setupFormOptions();
    render();
    renderReports();
    showFeedback("Não foi possível salvar a importação.");
  });
});
let pendingCashClosingEntries = [];
let pendingCashClosingErrors = 0;
function resetCashImportDialog() {
  pendingCashClosingEntries = [];
  pendingCashClosingErrors = 0;
  $("#cash-closings-csv").value = "";
  $("#cash-import-summary").textContent = "";
  $("#cash-import-summary").hidden = true;
  $("#cash-import-errors").hidden = true;
  $("#cash-import-errors").textContent = "";
  $("#confirm-cash-import").disabled = true;
}
$("#import-cash-closings").addEventListener("click", () => { resetCashImportDialog(); $("#cash-import-dialog").showModal(); });
$("#refresh-billings").addEventListener("click", async () => {
  try {
    billings = await refreshBillings(API_URL);
    renderBillings();
    showFeedback("Faturamento atualizado.");
  } catch (error) {
    console.error("Falha ao atualizar faturamento.", error);
    showFeedback(error instanceof Error ? error.message : "Não foi possível atualizar o faturamento.");
  }
});
$("#close-cash-import-dialog").addEventListener("click", () => $("#cash-import-dialog").close());
$("#cancel-cash-import-dialog").addEventListener("click", () => $("#cash-import-dialog").close());
$("#close-cash-import-confirm-dialog").addEventListener("click", () => $("#cash-import-confirm-dialog").close());
$("#cancel-cash-import-confirm-dialog").addEventListener("click", () => $("#cash-import-confirm-dialog").close());
$("#cash-closings-csv").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  pendingCashClosingEntries = [];
  pendingCashClosingErrors = 0;
  $("#cash-import-summary").textContent = "";
  $("#cash-import-summary").hidden = true;
  $("#cash-import-errors").hidden = true;
  $("#cash-import-errors").textContent = "";
  $("#confirm-cash-import").disabled = true;
  if (!file) return;
  try {
    const result = importCashClosingsCsv(await file.text());
    pendingCashClosingEntries = result.entries;
    pendingCashClosingErrors = result.errors.length;
    $("#cash-import-summary").textContent = `${result.entries.length} linha(s) pronta(s) para importar${result.errors.length ? `; ${result.errors.length} inválida(s)` : ""}.`;
    $("#cash-import-summary").hidden = false;
    if (result.errors.length) {
      $("#cash-import-errors").innerHTML = result.errors.map((error) => `<div>Linha ${error.line}: ${escapeHtml(error.message)}</div>`).join("");
      $("#cash-import-errors").hidden = false;
    }
    $("#confirm-cash-import").disabled = !pendingCashClosingEntries.length;
  } catch (error) {
    $("#cash-import-summary").textContent = error.message;
    $("#cash-import-summary").hidden = false;
  }
});
$("#cash-import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingCashClosingEntries.length) return;
  const dates = [...new Set(pendingCashClosingEntries.map((entry) => entry.date))].sort();
  $("#cash-import-confirm-count").textContent = String(pendingCashClosingEntries.length);
  $("#cash-import-confirm-dates").textContent = String(dates.length);
  $("#cash-import-confirm-sales").textContent = String(pendingCashClosingEntries.reduce((sum, entry) => sum + entry.saleCount, 0));
  $("#cash-import-confirm-errors").textContent = String(pendingCashClosingErrors);
  $("#cash-import-confirm-period").textContent = `Período: ${formatTransactionDate(dates[0])} a ${formatTransactionDate(dates.at(-1))}.`;
  $("#cash-import-confirm-dialog").showModal();
});
$("#cash-import-confirm-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!pendingCashClosingEntries.length) return;
  const previous = captureState();
  const dates = [...new Set(pendingCashClosingEntries.map((entry) => entry.date))];
  const catalogOperations = [];
  pendingCashClosingEntries.forEach((entry) => {
    if (paymentMethods.some((method) => normalizeCatalogValue(method) === normalizeCatalogValue(entry.paymentMethod))) return;
    paymentMethods.push(entry.paymentMethod);
    catalogMetadata.payment_methods ||= [];
    catalogMetadata.payment_methods.push({ name: entry.paymentMethod, slug: toSlug(entry.paymentMethod), displayOrder: catalogMetadata.payment_methods.length, isActive: true });
    catalogOperations.push({ action: "add", kind: "paymentMethod", name: entry.paymentMethod, displayOrder: catalogMetadata.payment_methods.length - 1 });
  });
  const importedByDate = new Map(dates.map((date) => [date, pendingCashClosingEntries.filter((entry) => entry.date === date)]));
  dates.forEach((date) => {
    const importedMethods = importedByDate.get(date).map((entry) => normalizeCatalogValue(entry.paymentMethod));
    cashClosings = cashClosings.filter((entry) => entry.date !== date || !importedMethods.includes(normalizeCatalogValue(entry.paymentMethod)));
    cashClosings.push(...importedByDate.get(date));
    const amount = cashClosings.filter((entry) => entry.date === date).reduce((sum, entry) => sum + Number(entry.totalAmount || 0), 0);
    const saleCount = cashClosings.filter((entry) => entry.date === date).reduce((sum, entry) => sum + Number(entry.saleCount || 0), 0);
    const incomeId = `cash-closing-income-${date}`;
    incomes = incomes.filter((entry) => entry.id !== incomeId).concat({ id: incomeId, description: `Vendas dia ${formatTransactionDate(date)} (${saleCount})`, amount, type: "income", source: "Vendas", date });
  });
  const imported = pendingCashClosingEntries.length;
  Promise.all([...catalogOperations.map((operation) => saveCatalog(API_URL, operation)), ...dates.map((date) => saveCashClosing(API_URL, date, importedByDate.get(date)))]).then(() => {
    markTransactionsUpdated();
    setupFormOptions();
    renderCashClosings();
    render();
    renderReports();
    renderRegistries();
    $("#cash-import-confirm-dialog").close();
    $("#cash-import-dialog").close();
    $("#cash-import-result-count").textContent = String(imported);
    $("#cash-import-result-skipped").textContent = pendingCashClosingErrors ? `${pendingCashClosingErrors} linha(s) inválida(s) foram ignoradas e não foram gravadas.` : "Todas as linhas do arquivo foram importadas.";
    $("#cash-import-result-skipped").hidden = false;
    $("#cash-import-result-dialog").showModal();
    pendingCashClosingEntries = [];
    pendingCashClosingErrors = 0;
  }).catch((error) => {
    console.error("Falha ao importar fechamentos de caixa.", error);
    restoreState(previous);
    setupFormOptions();
    renderCashClosings();
    render();
    renderReports();
    showFeedback("Não foi possível salvar a importação dos fechamentos.");
  });
});
$("#new-income").addEventListener("click", () => openIncomeDialog());
$("#home-new-transaction").addEventListener("click", () => openDialog());
$("#home-new-income").addEventListener("click", () => openIncomeDialog());
function openBuffetIncomeDialog(item) {
  $("#buffet-income-dialog-title").textContent = item ? "Editar receita" : "Nova receita";
  $("#buffet-income-id").value = item?.id || "";
  $("#buffet-income-description").value = item?.description || "";
  $("#buffet-income-amount").value = item ? formatInputAmount(item.amount) : "";
  $("#buffet-income-date").value = item?.date || localDate();
  $("#buffet-income-dialog").showModal();
}
function openBuffetExpenseDialog(item) {
  $("#buffet-expense-dialog-title").textContent = item ? "Editar despesa" : "Nova despesa";
  $("#buffet-expense-id").value = item?.id || "";
  $("#buffet-expense-description").value = item?.description || "";
  $("#buffet-expense-amount").value = item ? formatInputAmount(item.amount) : "";
  $("#buffet-expense-date").value = item?.date || localDate();
  $("#buffet-expense-dialog").showModal();
}
function persistBuffetEntry(item, id, dialog, successMessage) {
  const previous = captureState();
  if (item.type === "income") incomes = upsertEntry(incomes, item);
  else transactions = upsertEntry(transactions, item);
  saveTransaction(API_URL, item).then(() => {
    markTransactionsUpdated();
    setupFormOptions();
    render();
    renderReports();
    dialog.close();
    showFeedback(id ? `${successMessage} atualizada.` : `${successMessage} adicionada.`);
  }).catch((error) => {
    console.error("Falha ao salvar movimentação do Buffet.", error);
    restoreState(previous);
    render();
    showFeedback(error instanceof Error ? error.message : "Não foi possível salvar a movimentação do Buffet.");
  });
}
$("#buffet-new-income").addEventListener("click", () => openBuffetIncomeDialog());
$("#buffet-new-expense").addEventListener("click", () => openBuffetExpenseDialog());
$("#close-buffet-income-dialog").addEventListener("click", () => $("#buffet-income-dialog").close());
$("#cancel-buffet-income-dialog").addEventListener("click", () => $("#buffet-income-dialog").close());
$("#close-buffet-expense-dialog").addEventListener("click", () => $("#buffet-expense-dialog").close());
$("#cancel-buffet-expense-dialog").addEventListener("click", () => $("#buffet-expense-dialog").close());
$("#buffet-income-amount").addEventListener("input", (event) => {
  const amount = parseInputAmount(event.target.value);
  event.target.value = amount ? formatInputAmount(amount) : "";
});
$("#buffet-expense-amount").addEventListener("input", (event) => {
  const amount = parseInputAmount(event.target.value);
  event.target.value = amount ? formatInputAmount(amount) : "";
});
$("#buffet-income-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#buffet-income-id").value;
  const item = { id: id || `buffet-income-${crypto.randomUUID()}`, description: $("#buffet-income-description").value.trim(), amount: parseInputAmount($("#buffet-income-amount").value), type: "income", source: "Buffet", product: "buffet", date: $("#buffet-income-date").value };
  if (!item.description || !item.amount || !item.date) return showFeedback("Preencha descrição, valor e data.");
  persistBuffetEntry(item, id, $("#buffet-income-dialog"), "Receita do Buffet");
});
$("#buffet-expense-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#buffet-expense-id").value;
  const item = { id: id || `buffet-expense-${crypto.randomUUID()}`, description: $("#buffet-expense-description").value.trim(), amount: parseInputAmount($("#buffet-expense-amount").value), type: "expense", location: "Buffet", expenseType: "Buffet", taker: "Buffet", creditor: "Caixa", product: "buffet", date: $("#buffet-expense-date").value };
  if (!item.description || !item.amount || !item.date) return showFeedback("Preencha descrição, valor e data.");
  persistBuffetEntry(item, id, $("#buffet-expense-dialog"), "Despesa do Buffet");
});
$("#buffet-period-select").addEventListener("change", renderBuffet);
$("#buffet-entries-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-buffet]");
  if (!button) return;
  const item = buffetEntries(transactions, incomes).find((entry) => String(entry.id) === button.dataset.editBuffet);
  if (!item) return;
  if (item.type === "income") openBuffetIncomeDialog(item);
  else openBuffetExpenseDialog(item);
});
$("#close-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#cancel-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#close-income-dialog").addEventListener("click", () => $("#income-dialog").close());
$("#cancel-income-dialog").addEventListener("click", () => $("#income-dialog").close());
function openCashClosingDialog(item) {
  $("#cash-closing-id").value = item?.id || "";
  $("#cash-closing-date").value = item?.date || localDate();
  $("#cash-closing-error").hidden = true;
  $("#cash-closing-error").textContent = "";
  const rows = item?.items || cashClosings.filter((entry) => entry.date === item?.date);
  $("#cash-closing-methods").innerHTML = activeCatalog("payment_methods", paymentMethods).map((method) => {
    const entry = rows.find((row) => normalizeCatalogValue(row.paymentMethod) === normalizeCatalogValue(method));
    return `<label class="cash-closing-method"><span>${escapeHtml(method)}</span><input data-closing-sales type="number" min="0" step="1" value="${entry?.saleCount || 0}" aria-label="Vendas com ${escapeHtml(method)}" /><input data-closing-amount type="text" inputmode="decimal" dir="rtl" value="${entry ? formatInputAmount(entry.totalAmount) : ""}" placeholder="R$ 0,00" aria-label="Valor recebido em ${escapeHtml(method)}" /></label>`;
  }).join("");
  updateCashClosingTotal();
  $("#cash-closing-dialog").showModal();
  requestAnimationFrame(() => $("#cash-closing-date").focus());
}
$("#new-cash-closing").addEventListener("click", () => openCashClosingDialog());
$("#close-cash-closing-dialog").addEventListener("click", () => $("#cash-closing-dialog").close());
$("#cancel-cash-closing-dialog").addEventListener("click", () => $("#cash-closing-dialog").close());
function updateCashClosingTotal() {
  const salesTotal = [...document.querySelectorAll("[data-closing-sales]")].reduce((sum, input) => sum + Number(input.value || 0), 0);
  const total = [...document.querySelectorAll("[data-closing-amount]")].reduce((sum, input) => sum + parseInputAmount(input.value), 0);
  $("#cash-closing-sales-preview").textContent = String(salesTotal);
  $("#cash-closing-total-preview").textContent = formatMoney(total);
}
$("#cash-closing-methods").addEventListener("input", (event) => {
  if (event.target.matches("[data-closing-amount]")) {
    const amount = parseInputAmount(event.target.value);
    event.target.value = amount ? formatInputAmount(amount) : "";
  }
  updateCashClosingTotal();
});
/* Keep the total derived from every receiving method. */
$("#cash-closing-amount")?.addEventListener("input", (event) => {
  const amount = parseInputAmount(event.target.value);
  event.target.value = amount ? formatInputAmount(amount) : "";
  $("#cash-closing-total-preview").textContent = formatMoney(amount);
});
$("#cash-closing-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const displayError = (message) => {
    $("#cash-closing-error").textContent = message;
    $("#cash-closing-error").hidden = false;
  };
  const date = $("#cash-closing-date").value;
  const id = $("#cash-closing-id").value;
  const previousCashClosings = cashClosings;
  const previousIncomes = incomes;
  const availablePaymentMethods = activeCatalog("payment_methods", paymentMethods);
  const existingRows = cashClosings.filter((entry) => entry.date === date);
  const rows = [...document.querySelectorAll(".cash-closing-method")].map((row, index) => ({
    id: existingRows.find((entry) => normalizeCatalogValue(entry.paymentMethod) === normalizeCatalogValue(availablePaymentMethods[index]))?.id || (id && index === 0 ? id : crypto.randomUUID()),
    date,
    paymentMethod: availablePaymentMethods[index],
    saleCount: Number(row.querySelector("[data-closing-sales]").value || 0),
    totalAmount: parseInputAmount(row.querySelector("[data-closing-amount]").value),
  })).filter((entry) => entry.saleCount || entry.totalAmount);
  const amount = rows.reduce((sum, entry) => sum + entry.totalAmount, 0);
  const saleCount = rows.reduce((sum, entry) => sum + entry.saleCount, 0);
  if (!amount) return displayError("Informe o valor recebido em pelo menos uma forma de pagamento.");
  cashClosings = cashClosings.filter((entry) => entry.date !== date).concat(rows);
  const income = { id: `cash-closing-income-${date}`, description: `Vendas dia ${formatTransactionDate(date)} (${saleCount})`, amount, type: "income", source: "Vendas", date };
  incomes = incomes.filter((entry) => entry.id !== income.id).concat(income);
  saveCashClosing(API_URL, date, rows).then(async () => { billings = await refreshBillings(API_URL); markTransactionsUpdated(); renderCashClosings(); renderBillings(); render(); renderReports(); $("#cash-closing-dialog").close(); showFeedback(id ? "Fechamento atualizado." : "Fechamento adicionado."); }).catch((error) => {
    console.error("Falha ao concluir fechamento após persistência.", error);
    cashClosings = previousCashClosings;
    incomes = previousIncomes;
    renderCashClosings();
    render();
    renderReports();
    displayError(error instanceof Error ? error.message : "Não foi possível salvar o fechamento.");
  });
});
$("#cash-closings-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-cash-closing-date]");
  if (!button) return;
  const date = button.dataset.editCashClosingDate;
  const rows = cashClosings.filter((item) => item.date === date);
  if (rows.length) openCashClosingDialog({ ...rows[0], items: rows });
});
$("#cash-closing-pagination-prev").addEventListener("click", () => {
  if (paginationState.Fechamentos.page > 1) {
    paginationState.Fechamentos.page -= 1;
    renderCashClosings();
  }
});
$("#cash-closing-pagination-next").addEventListener("click", () => {
  paginationState.Fechamentos.page += 1;
  renderCashClosings();
});
$("#cash-closing-page-size").addEventListener("change", (event) => {
  paginationState.Fechamentos.pageSize = Number(event.target.value);
  paginationState.Fechamentos.page = 1;
  renderCashClosings();
});
$("#monthly-cash-closing-pagination-prev").addEventListener("click", () => {
  if (paginationState.FechamentosMensais.page > 1) {
    paginationState.FechamentosMensais.page -= 1;
    renderMonthlyCashClosings((rows) => [...rows].sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod, "pt-BR")));
  }
});
$("#monthly-cash-closing-pagination-next").addEventListener("click", () => {
  paginationState.FechamentosMensais.page += 1;
  renderMonthlyCashClosings((rows) => [...rows].sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod, "pt-BR")));
});
$("#monthly-cash-closing-page-size").addEventListener("change", (event) => {
  paginationState.FechamentosMensais.pageSize = Number(event.target.value);
  paginationState.FechamentosMensais.page = 1;
  renderMonthlyCashClosings((rows) => [...rows].sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod, "pt-BR")));
});
$("#monthly-cash-closings-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-monthly-cash-closing]");
  if (!button) return;
  const [year, month] = button.dataset.editMonthlyCashClosing.split("-").map(Number);
  const rows = monthlyCashClosings.filter((item) => item.year === year && item.month === month);
  if (rows.length) openMonthlyCashClosingDialog({ ...rows[0], items: rows });
});
function openMonthlyCashClosingDialog(item) {
  $("#monthly-cash-closing-id").value = item?.id || "";
  $("#monthly-cash-closing-month").innerHTML = Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2020, index, 15))}</option>`).join("");
  $("#monthly-cash-closing-month").value = String(item?.month || new Date().getMonth() + 1);
  $("#monthly-cash-closing-year").value = item?.year || new Date().getFullYear();
  const rows = item?.items || monthlyCashClosings.filter((entry) => entry.month === Number($("#monthly-cash-closing-month").value) && entry.year === Number($("#monthly-cash-closing-year").value));
  $("#monthly-cash-closing-methods").innerHTML = activeCatalog("payment_methods", paymentMethods).map((method) => {
    const entry = rows.find((row) => normalizeCatalogValue(row.paymentMethod) === normalizeCatalogValue(method));
    return `<label class="cash-closing-method"><span>${escapeHtml(method)}</span><input data-monthly-closing-sales type="number" min="0" step="1" value="${entry?.saleCount || 0}" aria-label="Vendas com ${escapeHtml(method)}" /><input data-monthly-closing-amount type="text" inputmode="decimal" dir="rtl" value="${entry ? formatInputAmount(entry.totalAmount) : ""}" placeholder="R$ 0,00" aria-label="Valor recebido em ${escapeHtml(method)}" /></label>`;
  }).join("");
  updateMonthlyCashClosingTotal();
  $("#monthly-cash-closing-dialog").showModal();
}
function updateMonthlyCashClosingTotal() {
  const sales = [...document.querySelectorAll("[data-monthly-closing-sales]")].reduce((sum, input) => sum + Number(input.value || 0), 0);
  const amount = [...document.querySelectorAll("[data-monthly-closing-amount]")].reduce((sum, input) => sum + parseInputAmount(input.value), 0);
  $("#monthly-cash-closing-sales-preview").textContent = String(sales);
  $("#monthly-cash-closing-total-preview").textContent = formatMoney(amount);
}
$("#new-monthly-cash-closing").addEventListener("click", () => openMonthlyCashClosingDialog());
$("#close-monthly-cash-closing-dialog").addEventListener("click", () => $("#monthly-cash-closing-dialog").close());
$("#cancel-monthly-cash-closing-dialog").addEventListener("click", () => $("#monthly-cash-closing-dialog").close());
$("#monthly-cash-closing-methods").addEventListener("input", (event) => {
  if (event.target.matches("[data-monthly-closing-amount]")) {
    const amount = parseInputAmount(event.target.value);
    event.target.value = amount ? formatInputAmount(amount) : "";
  }
  updateMonthlyCashClosingTotal();
});
$("#monthly-cash-closing-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const month = Number($("#monthly-cash-closing-month").value);
  const year = Number($("#monthly-cash-closing-year").value);
  const previous = captureState();
  const methods = activeCatalog("payment_methods", paymentMethods);
  const existing = monthlyCashClosings.filter((item) => item.month === month && item.year === year);
  const values = [...document.querySelectorAll("#monthly-cash-closing-methods .cash-closing-method")].map((row, index) => ({
    id: existing.find((item) => normalizeCatalogValue(item.paymentMethod) === normalizeCatalogValue(methods[index]))?.id || crypto.randomUUID(),
    month,
    year,
    paymentMethod: methods[index],
    saleCount: Number(row.querySelector("[data-monthly-closing-sales]").value || 0),
    totalAmount: parseInputAmount(row.querySelector("[data-monthly-closing-amount]").value),
  })).filter((item) => item.saleCount || item.totalAmount);
  if (!values.length) return showFeedback("Informe pelo menos um valor maior que zero.");
  monthlyCashClosings = monthlyCashClosings.filter((item) => item.month !== month || item.year !== year).concat(values);
  saveMonthlyCashClosings(API_URL, values).then(() => {
    renderMonthlyCashClosings((rows) => [...rows].sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod, "pt-BR")));
    $("#monthly-cash-closing-dialog").close();
    showFeedback("Fechamento mensal salvo.");
  }).catch((error) => {
    console.error("Falha ao salvar fechamento mensal.", error);
    restoreState(previous);
    renderMonthlyCashClosings((rows) => [...rows].sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod, "pt-BR")));
    showFeedback("Não foi possível salvar o fechamento mensal.");
  });
});
function openLimitDialog(item) {
  $("#limit-dialog-title").textContent = item ? "Editar limite" : "Novo limite";
  $("#limit-id").value = item?.id || "";
  $("#limit-month").innerHTML = Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2020, index, 15))}</option>`).join("");
  $("#limit-month").value = String(item?.month || new Date().getMonth() + 1);
  $("#limit-year").value = item?.year || new Date().getFullYear();
  ["target", "budget", "forecast", "patamar", "result"].forEach((field) => { $(`#limit-${field}`).value = item ? formatInputAmount(item[field]) : ""; });
  updateLimitResult();
  $("#limit-dialog").showModal();
  requestAnimationFrame(() => $("#limit-target").focus());
}
$("#new-limit").addEventListener("click", () => openLimitDialog());
$("#close-limit-dialog").addEventListener("click", () => $("#limit-dialog").close());
$("#cancel-limit-dialog").addEventListener("click", () => $("#limit-dialog").close());
["target", "budget", "forecast", "patamar", "result"].forEach((field) => {
  if (field === "result") return;
  $(`#limit-${field}`).addEventListener("input", (event) => {
    const amount = parseInputAmount(event.target.value);
    event.target.value = amount ? formatInputAmount(amount) : "";
    updateLimitResult();
  });
});
function updateLimitResult() {
  const result = parseInputAmount($("#limit-target").value)
    - parseInputAmount($("#limit-budget").value)
    - parseInputAmount($("#limit-forecast").value)
    - parseInputAmount($("#limit-patamar").value);
  $("#limit-result").value = formatInputAmount(result);
}
$("#limit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#limit-id").value;
  const month = Number($("#limit-month").value);
  const year = Number($("#limit-year").value);
  if (limits.some((item) => item.month === month && item.year === year && String(item.id) !== String(id))) return showFeedback("Já existe limite para este mês.");
  const existingLimit = limits.find((entry) => String(entry.id) === String(id));
  const item = {
    id: id || crypto.randomUUID(), ...(existingLimit?.clientId ? { clientId: existingLimit.clientId } : {}), month, year,
    target: parseInputAmount($("#limit-target").value),
    budget: parseInputAmount($("#limit-budget").value),
    forecast: parseInputAmount($("#limit-forecast").value),
    patamar: parseInputAmount($("#limit-patamar").value),
    result: parseInputAmount($("#limit-target").value)
      - parseInputAmount($("#limit-budget").value)
      - parseInputAmount($("#limit-forecast").value)
      - parseInputAmount($("#limit-patamar").value),
    closed: Boolean(existingLimit?.closed),
  };
  const previous = captureState();
  limits = upsertEntry(limits, item);
  saveLimit(API_URL, item).then(() => { renderLimits(); $("#limit-dialog").close(); showFeedback(id ? "Limite atualizado." : "Limite adicionado."); }).catch((error) => {
    console.error("Falha ao salvar limite.", error);
    restoreState(previous);
    renderLimits();
    showFeedback("Não foi possível salvar o limite.");
  });
});
$("#limits-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-limit]");
  if (button) openLimitDialog(limits.find((item) => String(item.id) === button.dataset.editLimit));
});
$("#limit-pagination-prev").addEventListener("click", () => { if (paginationState.Limites.page > 1) { paginationState.Limites.page -= 1; renderLimits(); } });
$("#limit-pagination-next").addEventListener("click", () => { paginationState.Limites.page += 1; renderLimits(); });
$("#limit-page-size").addEventListener("change", (event) => { paginationState.Limites.pageSize = Number(event.target.value); paginationState.Limites.page = 1; renderLimits(); });
$("#amount").addEventListener("input", (event) => {
  const amount = parseInputAmount(event.target.value);
  event.target.value = amount ? formatInputAmount(amount) : "";
});
$("#income-amount").addEventListener("input", (event) => {
  const amount = parseInputAmount(event.target.value);
  event.target.value = amount ? formatInputAmount(amount) : "";
});
document.querySelectorAll("[data-location-panel]").forEach((panel) => {
  panel.querySelectorAll("[data-search], [data-type-filter], [data-taker-filter]").forEach((control) => control.addEventListener("input", () => {
    paginationState[panel.dataset.locationPanel].page = 1;
    renderLocationTransactions(panel.dataset.locationPanel);
  }));
  panel.querySelector("[data-page-size]").addEventListener("change", (event) => {
    const state = paginationState[panel.dataset.locationPanel];
    state.pageSize = Number(event.target.value);
    state.page = 1;
    renderLocationTransactions(panel.dataset.locationPanel);
  });
  const incomePanel = $("[data-income-panel]");
  incomePanel.querySelectorAll("[data-income-search], [data-income-source-filter]").forEach((control) => control.addEventListener("input", () => { paginationState.Receitas.page = 1; renderIncomeTransactions(); }));
  incomePanel.querySelector("[data-income-page-size]").addEventListener("change", (event) => { paginationState.Receitas.pageSize = Number(event.target.value); paginationState.Receitas.page = 1; renderIncomeTransactions(); });
  incomePanel.querySelector("[data-income-pagination-prev]").addEventListener("click", () => { if (paginationState.Receitas.page > 1) { paginationState.Receitas.page--; renderIncomeTransactions(); } });
  incomePanel.querySelector("[data-income-pagination-next]").addEventListener("click", () => { paginationState.Receitas.page++; renderIncomeTransactions(); });
  incomePanel.addEventListener("click", (event) => { const button = event.target.closest("[data-edit-income]");   if (button) openIncomeDialog(incomes.find((item) => String(item.id) === button.dataset.editIncome)); });
  panel.querySelector("[data-pagination-prev]").addEventListener("click", () => {
    const state = paginationState[panel.dataset.locationPanel];
    if (state.page > 1) { state.page -= 1; renderLocationTransactions(panel.dataset.locationPanel); }
  });
  panel.querySelector("[data-pagination-next]").addEventListener("click", () => {
    const state = paginationState[panel.dataset.locationPanel];
    state.page += 1;
    renderLocationTransactions(panel.dataset.locationPanel);
  });
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit]");
    if (button) openDialog(transactions.find((item) => String(item.id) === button.dataset.edit));
  });
});
document.querySelectorAll("[data-month-select]").forEach((select) => select.addEventListener("change", (event) => {
  const [year, month] = event.target.value.split("-");
  $("#month-filter-month").value = month;
  $("#month-filter-year").value = year;
  $("#report-period-select").value = event.target.value;
  render();
  renderReports();
}));
document.querySelectorAll("#month-filter-month, #month-filter-year").forEach((select) => select.addEventListener("change", () => {
  const month = `${$("#month-filter-year").value}-${$("#month-filter-month").value}`;
  document.querySelectorAll("[data-month-select]").forEach((other) => { other.value = month; });
  $("#report-period-select").value = month;
  render();
  renderReports();
}));
$("#report-period-select").addEventListener("change", (event) => {
  const [year, month] = event.target.value.split("-");
  $("#month-filter-month").value = month;
  $("#month-filter-year").value = year;
  document.querySelectorAll("[data-month-select]").forEach((other) => { other.value = event.target.value; });
  render();
  renderReports();
});
document.querySelectorAll("[data-report-sort], [data-report-direction]").forEach((control) => control.addEventListener("change", (event) => {
  const kind = event.target.dataset.reportSort || event.target.dataset.reportDirection;
  const field = event.target.dataset.reportSort ? "field" : "direction";
  reportSortState[kind][field] = event.target.value;
  renderReports();
}));
$("#add-type").addEventListener("click", () => addCatalogItem("type"));
$("#add-taker").addEventListener("click", () => addCatalogItem("taker"));
$("#add-creditor").addEventListener("click", () => addCatalogItem("creditor"));
$("#add-income-source").addEventListener("click", () => addCatalogItem("incomeSource"));
$("#add-payment-method").addEventListener("click", () => addCatalogItem("paymentMethod"));
function addCatalogItem(kind) {
  const definition = registryDefinition(kind);
  const label = definition.label;
  const value = prompt(`Nome do ${label}:`)?.trim();
  if (!value) return;
  const list = { type: expenseTypes, taker: takers, location: locations, creditor: creditors, paymentMethod: paymentMethods, incomeSource: incomeSources }[kind];
  if (hasRegistryName(list, value)) return showFeedback(`${label[0].toUpperCase() + label.slice(1)} já cadastrado.`);
  const previous = captureState();
  list.push(value);
  const table = { type: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" }[kind];
  catalogMetadata[table] ||= [];
  catalogMetadata[table].push({ name: value, slug: toSlug(value), displayOrder: catalogMetadata[table].length, isActive: true });
  saveCatalog(API_URL, { action: "add", kind, name: value, displayOrder: catalogMetadata[table].length - 1 }).then(() => { setupFormOptions(); renderRegistries(); showFeedback(`${label[0].toUpperCase() + label.slice(1)} cadastrado.`); }).catch(() => { restoreState(previous); setupFormOptions(); renderRegistries(); showFeedback("Não foi possível salvar o cadastro."); });
}
function openRegistryEditDialog(kind, index) {
  const list = { type: expenseTypes, taker: takers, location: locations, creditor: creditors, paymentMethod: paymentMethods, incomeSource: incomeSources }[kind];
  const table = { type: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" }[kind];
  const item = list[index];
  const metadata = catalogMetadata[table]?.find((entry) => entry.name === item) || { displayOrder: 0, isActive: true };
  $("#registry-kind").value = kind;
  $("#registry-index").value = index;
  $("#registry-name").value = item;
  $("#registry-order").value = metadata.displayOrder;
  $("#registry-order-field").hidden = !["taker", "creditor", "paymentMethod", "incomeSource"].includes(kind);
  $("#registry-status").checked = metadata.isActive;
  $("#registry-dialog-title").textContent = `Editar ${registryDefinition(kind).label}`;
  $("#registry-dialog").showModal();
  requestAnimationFrame(() => $("#registry-name").focus());
}
$("#registry-lists").addEventListener("click", (event) => {
  event.preventDefault();
  const saveOrderButton = event.target.closest("[data-save-registry-order]");
  if (saveOrderButton) {
    const kind = saveOrderButton.dataset.saveRegistryOrder;
    saveOrderButton.disabled = true;
    saveCatalog(API_URL, { action: "order", kind, items: (catalogMetadata[{ type: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" }[kind]] || []).map((item) => ({ name: item.name, displayOrder: item.displayOrder })) }).then(() => {
      pendingRegistryOrderSaves.delete(kind);
      registryOrderSnapshots.delete(kind);
      renderRegistries();
      showFeedback("Ordem dos cadastros salva.");
    }).catch(() => {
      saveOrderButton.disabled = false;
      const previous = registryOrderSnapshots.get(kind);
      if (previous) restoreState(previous);
      registryOrderSnapshots.delete(kind);
      pendingRegistryOrderSaves.delete(kind);
      setupFormOptions();
      renderRegistries();
      showFeedback("Não foi possível salvar a ordem.");
    });
    return;
  }
  const button = event.target.closest("[data-edit-registry], [data-delete-registry]");
  if (!button) return;
  const kind = button.dataset.editRegistry || button.dataset.deleteRegistry;
  const list = { type: expenseTypes, taker: takers, location: locations, creditor: creditors, paymentMethod: paymentMethods, incomeSource: incomeSources }[kind];
  const definition = registryDefinition(kind);
  const index = Number(button.dataset.registryIndex);
  const current = list[index];
  if (button.dataset.editRegistry) {
    openRegistryEditDialog(kind, index);
    return;
  }
  const hasTransactionReference = !canDeleteRegistry(kind, current, { transactions, incomes });
  const hasCashClosingReference = kind === "paymentMethod" && cashClosings.some((item) => item.paymentMethod === current);
  if (hasTransactionReference || hasCashClosingReference) {
    showRegistryDeleteError();
    return;
  }
  if (list.length === 1) return showFeedback("Mantenha pelo menos um cadastro disponível.");
  if (!confirm(`Excluir "${current}"?`)) return;
  const previous = captureState();
  list.splice(index, 1);
  const table = { type: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" }[kind];
  catalogMetadata[table] = catalogMetadata[table].filter((entry) => entry.name !== current);
  pendingRegistryOrderSaves.delete(kind);
  saveCatalog(API_URL, { action: "delete", kind, name: current }).then(() => { setupFormOptions(); renderRegistries(); showFeedback("Cadastro excluído."); }).catch(() => { restoreState(previous); setupFormOptions(); renderRegistries(); showFeedback("Não foi possível excluir o cadastro."); });
});
$("#registry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const kind = $("#registry-kind").value;
  const index = Number($("#registry-index").value);
  const list = { type: expenseTypes, taker: takers, location: locations, creditor: creditors, paymentMethod: paymentMethods, incomeSource: incomeSources }[kind];
  const current = list[index];
  const value = $("#registry-name").value.trim();
  if (!value) return;
  if (hasRegistryName(list, value, index)) return showFeedback("Já existe um cadastro com esse nome.");
  const previous = captureState();
  const updated = renameRegistry(kind, current, value, { transactions, incomes, expenseTypes, takers, locations, creditors, paymentMethods, incomeSources, catalogMetadata });
  ({ transactions, incomes, expenseTypes, takers, locations, creditors, paymentMethods, incomeSources, catalogMetadata } = updated);
  const table = { type: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" }[kind];
  const metadata = catalogMetadata[table].find((entry) => entry.name === current);
  if (metadata) {
    metadata.name = value;
    metadata.slug = toSlug(value);
    metadata.displayOrder = Math.max(0, Number($("#registry-order").value) || 0);
    metadata.isActive = $("#registry-status").checked;
  }
  saveCatalog(API_URL, { action: "rename", kind, current, name: value, displayOrder: metadata?.displayOrder || 0, isActive: metadata?.isActive !== false }).then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); $("#registry-dialog").close(); showFeedback("Cadastro atualizado."); }).catch(() => { restoreState(previous); setupFormOptions(); render(); renderReports(); renderRegistries(); showFeedback("Não foi possível atualizar o cadastro."); });
});
document.querySelectorAll("#close-registry-dialog, #cancel-registry-dialog").forEach((button) => button.addEventListener("click", () => $("#registry-dialog").close()));
let draggedRegistryRow = null;
let draggedRegistryKind = "";
let draggedRegistryIndex = -1;
const registryOrderSnapshots = new Map();
$("#registry-lists").addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-registry-drag-kind]");
  if (!row || event.target.closest("input, button, label")) return;
  draggedRegistryRow = row;
  draggedRegistryKind = row.dataset.registryDragKind;
  draggedRegistryIndex = Number(row.dataset.registryDragIndex);
  row.classList.add("registry-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `${draggedRegistryKind}:${draggedRegistryIndex}`);
});
$("#registry-lists").addEventListener("dragover", (event) => {
  const row = event.target.closest("[data-registry-drag-kind]");
  if (!row) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".registry-drag-over").forEach((item) => item.classList.remove("registry-drag-over"));
  row.classList.add("registry-drag-over");
});
$("#registry-lists").addEventListener("drop", (event) => {
  const target = event.target.closest("[data-registry-drag-kind]");
  if (!target) return;
  event.preventDefault();
  const [kind, sourceIndexText] = (event.dataTransfer.getData("text/plain") || `${draggedRegistryKind}:${draggedRegistryIndex}`).split(":");
  if (kind !== target.dataset.registryDragKind) return;
  const sourceIndex = Number(sourceIndexText);
  const list = { taker: takers, creditor: creditors, paymentMethod: paymentMethods, incomeSource: incomeSources }[kind];
  const targetIndex = Number(target.dataset.registryDragIndex);
  if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) || sourceIndex === targetIndex) return;
  if (!registryOrderSnapshots.has(kind)) registryOrderSnapshots.set(kind, captureState());
  const [moved] = list.splice(sourceIndex, 1);
  const insertionIndex = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 ? targetIndex + 1 : targetIndex;
  list.splice(sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex, 0, moved);
  const table = { taker: "takers", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" }[kind];
  const entries = catalogMetadata[table] || [];
  list.forEach((name, index) => {
    const entry = entries.find((item) => item.name === name);
    if (entry) entry.displayOrder = index;
  });
  pendingRegistryOrderSaves.add(kind);
  renderRegistries();
});
$("#registry-lists").addEventListener("dragend", () => {
  draggedRegistryRow = null;
  draggedRegistryKind = "";
  draggedRegistryIndex = -1;
  document.querySelectorAll(".registry-dragging, .registry-drag-over").forEach((item) => item.classList.remove("registry-dragging", "registry-drag-over"));
});
$("#registry-lists").addEventListener("change", (event) => {
  const orderInput = event.target.closest("[data-catalog-order]");
  const statusInput = event.target.closest("[data-catalog-status]");
  if (!orderInput && !statusInput) return;
  const kind = (orderInput || statusInput).dataset.catalogOrder || (orderInput || statusInput).dataset.catalogStatus;
  const list = { type: expenseTypes, taker: takers, location: locations, creditor: creditors, paymentMethod: paymentMethods, incomeSource: incomeSources }[kind];
  const table = { type: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" }[kind];
  const name = list[Number((orderInput || statusInput).dataset.registryIndex)];
  const entry = catalogMetadata[table].find((item) => item.name === name);
  const previous = captureState();
  if (orderInput) entry.displayOrder = Math.max(0, Number(orderInput.value) || 0);
  if (statusInput) entry.isActive = statusInput.checked;
  saveCatalog(API_URL, { action: "rename", kind, current: name, name, displayOrder: entry.displayOrder, isActive: entry.isActive }).then(() => { setupFormOptions(); renderRegistries(); showFeedback("Cadastro atualizado."); }).catch(() => { restoreState(previous); setupFormOptions(); renderRegistries(); showFeedback("Não foi possível atualizar o cadastro."); });
});
const pages = ["resumo", "lancamentos", "vendas", "faturamento", "relatorios", "cadastros", "ferramentas", "buffet"];
function renderPage() {
  const page = pages.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "resumo";
  document.querySelectorAll("[data-page]").forEach((section) => { section.hidden = section.dataset.page !== page; });
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${page}`));
  if (window.location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);
}
window.addEventListener("hashchange", renderPage);

renderPage();
loadData().then(() => { transactions = transactions.map((item) => ({ ...item, expenseType: item.expenseType || item.category || "Outros", taker: item.taker || "Pessoal", location: item.location || "Casa", creditor: item.creditor || "Caixa" })); $("#today-label").textContent = todayLabel(); $("#last-update").textContent = formatLastTransactionUpdate(lastTransactionUpdate); setupFormOptions(); render(); renderReports(); renderRegistries(); renderCashClosings(); renderBillings(); renderLimits(); renderPage(); }).catch((error) => { console.error("Falha ao inicializar a aplicação.", error); showFeedback(`Não foi possível carregar os dados iniciais: ${error.message}`); });
