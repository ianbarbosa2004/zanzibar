import { accumulatedBalance, inMonth, groupTotals, summarize } from "./src/shared/finance.js";
import { currentMonth, localDate, todayLabel } from "./src/shared/dates.js";
import { formatDate, formatInputAmount, formatLastTransactionUpdate, formatMoney, formatPeriod, formatTransactionDate, parseInputAmount } from "./src/shared/formatters.js";
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
const FINANCIAL_INSIGHTS_URL = API_URL.replace(/data$/, "financial-insights");
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
let expenseStatus = "all";
let authUser = null;
let financialAdvisorBusy = false;
let latestFinancialInsightResult = null;
let messagingConversationId = null;
let messagingPendingFileIds = [];
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
function syncDayFilters() {
  const month = selectedMonth();
  const [year, monthNumber] = month.split("-");
  const lastDay = new Date(Number(year), Number(monthNumber), 0).getDate();
  document.querySelectorAll("[data-day-filter]").forEach((filter) => {
    filter.min = `${month}-01`;
    filter.max = `${month}-${String(lastDay).padStart(2, "0")}`;
    if (filter.value && (filter.value < filter.min || filter.value > filter.max)) filter.value = "";
  });
}
const reportSortState = {
  daily: { field: "date", direction: "desc" },
  type: { field: "value", direction: "desc" },
  taker: { field: "value", direction: "desc" },
  "income-daily": { field: "date", direction: "desc" },
  "income-source": { field: "value", direction: "desc" },
};

async function loadAuth() {
  const response = await fetch(new URL("api/auth/me", document.baseURI).pathname);
  if (!response.ok) throw new Error("Não foi possível verificar a autenticação.");
  const result = await response.json();
  authUser = result.user;
  if (!result.authenticated) {
    $("#auth-gate").hidden = false;
    if (new URLSearchParams(window.location.search).get("auth") === "unauthorized") $("#auth-message").textContent = "Acesso pendente de aprovação do administrador. Aguarde a liberação da sua conta e tente novamente.";
    return false;
  }
  $("#auth-gate").hidden = true;
  return true;
}

function startAuthHeartbeat() {
  let activityPending = true;
  let lastHeartbeat = 0;
  const reportHeartbeatError = (error) => console.warn("Não foi possível atualizar a atividade da sessão.", error);
  const heartbeat = async () => {
    if (!activityPending || document.visibilityState !== "visible") return;
    activityPending = false;
    lastHeartbeat = Date.now();
    const response = await fetch(new URL("api/auth/heartbeat", document.baseURI).pathname, { method: "POST" });
    if (response.status === 401) window.location.reload();
  };
  const markActivity = () => {
    activityPending = true;
    if (Date.now() - lastHeartbeat >= 60_000) heartbeat().catch(reportHeartbeatError);
  };
  ["click", "keydown", "input", "pointerdown", "scroll"].forEach((eventName) => document.addEventListener(eventName, markActivity, { passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      activityPending = true;
      heartbeat().catch(reportHeartbeatError);
    }
  });
  heartbeat().catch(reportHeartbeatError);
  window.setInterval(() => heartbeat().catch(reportHeartbeatError), 60_000);
}

async function renderAuthorizedUsers() {
  const panel = $("#authorized-users-panel");
  if (!panel || authUser?.role !== "admin") return;
  panel.hidden = false;
  const response = await fetch(new URL("api/auth/users", document.baseURI).pathname);
  if (!response.ok) throw new Error("Não foi possível carregar os usuários autorizados.");
  const { users } = await response.json();
  const manageableUsers = users.filter((user) => user.role !== "admin");
  $("#authorized-users-empty").hidden = manageableUsers.length > 0;
  const formatLastLogin = (value) => value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value).replace(" ", "T")))
    : "Nunca acessou";
  $("#authorized-users-list").innerHTML = manageableUsers.map((user) => {
    const status = user.online
      ? `<span class="authorized-user-status online"><i aria-hidden="true"></i>Online</span>`
      : `<span class="authorized-user-status"><i aria-hidden="true"></i>Último login: ${escapeHtml(formatLastLogin(user.lastLoginAt))}</span>`;
    return `<div class="authorized-user-row"><div class="authorized-user-identity"><strong>${escapeHtml(user.name || user.email)}</strong><span>${escapeHtml(user.email)}</span></div><div class="authorized-user-session">${status}</div><button class="secondary-button" type="button" data-authorize-email="${escapeHtml(user.email)}" data-authorized="${user.authorized}">${user.authorized ? "Bloquear" : "Autorizar"}</button></div>`;
  }).join("");
}

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

const MESSAGING_URL = API_URL.replace(/data$/, "messaging");
const TELEGRAM_URL = API_URL.replace(/data$/, "telegram");
const DOCUMENTATION_URL = API_URL.replace(/data$/, "documentation");
async function messagingRequest(path = "", options = {}) {
  const response = await fetch(`${MESSAGING_URL}${path}`, options);
  const result = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(result?.error || "Não foi possível concluir a operação de mensagens.");
  return result;
}
function renderMessagingMessages(messages = []) {
  const target = $("#messaging-messages");
  if (!target) return;
  target.innerHTML = messages.length ? messages.map((message) => `<article class="messaging-message ${Number(message.senderId) === Number(authUser?.id) ? "own" : ""}"><div class="messaging-message-meta">${escapeHtml(message.senderName || (Number(message.senderId) === Number(authUser?.id) ? "Você" : "Usuário"))} · ${escapeHtml(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(message.createdAt).replace(" ", "T"))))}</div><p>${escapeHtml(message.body || "")}</p>${(message.files || []).map((file) => `<a class="messaging-file" href="${MESSAGING_URL}/files/${encodeURIComponent(file.id)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHtml(file.name)}</a>`).join("")}</article>`).join("") : '<p class="empty-state">Nenhuma mensagem nesta conversa.</p>';
  target.scrollTop = target.scrollHeight;
}
async function loadMessagingMessages() {
  if (!messagingConversationId) return;
  const { messages } = await messagingRequest(`/conversations/${messagingConversationId}/messages`);
  renderMessagingMessages(messages);
}
function renderMessagingConversations(conversations = []) {
  const target = $("#messaging-conversations");
  if (!target) return;
  target.innerHTML = conversations.length ? conversations.map((conversation) => `<button class="messaging-conversation ${Number(conversation.id) === Number(messagingConversationId) ? "selected" : ""}" type="button" data-messaging-conversation="${conversation.id}"><strong>${escapeHtml(conversation.participant?.name || conversation.participant?.email || "Usuário")}</strong><span>${escapeHtml(conversation.lastMessage?.body || "Sem mensagens")}</span></button>`).join("") : '<p class="empty-state">Nenhuma conversa iniciada.</p>';
}
async function loadMessagingConversations() {
  const { conversations } = await messagingRequest("/conversations");
  renderMessagingConversations(conversations);
  if (messagingConversationId && conversations.some((conversation) => Number(conversation.id) === Number(messagingConversationId))) await loadMessagingMessages();
}
async function openMessagingUsers() {
  const { users } = await messagingRequest("/users");
  const target = $("#messaging-users");
  target.hidden = false;
  target.innerHTML = users.length ? users.map((user) => `<button class="messaging-user" type="button" data-messaging-user="${user.id}"><strong>${escapeHtml(user.name || user.email)}</strong><span>${escapeHtml(user.email)}</span></button>`).join("") : '<p class="empty-state">Nenhum outro usuário autorizado.</p>';
}
async function selectMessagingConversation(id, title = "Conversa") {
  messagingConversationId = Number(id);
  $("#messaging-thread-title").textContent = title;
  $("#messaging-body").disabled = false;
  $("#messaging-file").disabled = false;
  $("#messaging-composer button[type=submit]").disabled = false;
  $("#messaging-status").textContent = "";
  await loadMessagingConversations();
  await loadMessagingMessages();
}
async function initializeMessaging() {
  if (!$("#messaging-section") && !$("#messaging-conversations")) return;
  try {
    await loadMessagingConversations();
  } catch (error) {
    $("#messaging-status").textContent = error.message;
  }
  $("#messaging-telegram-link")?.addEventListener("click", async () => {
    try {
      const response = await fetch(`${TELEGRAM_URL}/link-code`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível gerar o código Telegram.");
      const { code, expiresAt } = result;
      $("#messaging-status").textContent = `Envie /vincular ${code} ao bot Telegram antes de ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(expiresAt))}.`;
    } catch (error) {
      $("#messaging-status").textContent = error.message;
    }
  });
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
  syncDayFilters();
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
  const entryRows = (items, kind) => items.map((item) => `<tr><td>${escapeHtml(formatTransactionDate(item.date))}</td><td><div>${escapeHtml(item.description)}</div>${item.observation ? `<small>${escapeHtml(item.observation)}</small>` : ""}</td><td class="align-right ${kind === "income" ? "income-text" : "expense-text"}">${kind === "income" ? "+ " : "- "}${formatMoney(item.amount)}</td><td class="align-right"><button class="action-button" data-edit-buffet="${escapeHtml(String(item.id))}" aria-label="Editar ${escapeHtml(item.description)}">•••</button></td></tr>`).join("");
  const incomesForPeriod = entries.filter(isBuffetIncome);
  const expensesForPeriod = entries.filter(isBuffetExpense);
  $("#buffet-income-list").innerHTML = entryRows(incomesForPeriod, "income");
  $("#buffet-income-empty").hidden = incomesForPeriod.length > 0;
  $("#buffet-expense-list").innerHTML = entryRows(expensesForPeriod, "expense");
  $("#buffet-expense-empty").hidden = expensesForPeriod.length > 0;
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
  let previousAccumulated = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${period}-${String(day).padStart(2, "0")}`;
    const item = daily.get(date) || { income: 0, expense: 0, balance: 0 };
    const accumulated = accumulatedBalance(previousAccumulated, item.balance);
    const accumulatedClass = accumulated > 0 ? "calendar-balance-positive" : accumulated < 0 ? "calendar-balance-negative" : "calendar-balance-zero";
    cells.push(`<article class="calendar-day"><strong class="calendar-date">${day}</strong><div class="calendar-values"><span class="calendar-income">Entradas <b>${formatMoney(item.income)}</b></span><span class="calendar-expense">Saídas <b>${formatMoney(-item.expense)}</b></span></div><div class="calendar-balance ${item.balance >= 0 ? "calendar-balance-positive" : "calendar-balance-negative"}"><span>Saldo</span><strong>${formatMoney(item.balance)}</strong></div><div class="calendar-accumulated ${accumulatedClass}"><span>Acumulado</span><strong>${formatMoney(accumulated)}</strong></div></article>`);
    previousAccumulated = accumulated;
  }
  $("#buffet-calendar").innerHTML = cells.join("");
}

function renderSummary() {
  const summary = summarize([...monthTransactions(), ...monthIncomes()], selectedMonth());
  const [limitYear, limitMonth] = selectedMonth().split("-").map(Number);
  const periodLimits = limits.filter((item) => item.year === limitYear && item.month === limitMonth);
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
  const ownerLimitText = (field, label) => `${label} R: ${formatMoney(periodLimits.find((item) => item.owner === "R")?.[field] || 0)}\n${label} P: ${formatMoney(periodLimits.find((item) => item.owner !== "R")?.[field] || 0)}`;
  $("#summary-limit-target").textContent = ownerLimitText("target", "Meta");
  $("#summary-limit-budget").textContent = ownerLimitText("budget", "Orçamento");
  $("#summary-limit-forecast").textContent = ownerLimitText("forecast", "Previsão");
  $("#summary-limit-patamar").textContent = ownerLimitText("patamar", "Patamar");
  $("#summary-limit-result").textContent = ownerLimitText("result", "Resultado");
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
  let previousAccumulated = 0;
  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = `${month}-${String(dayNumber).padStart(2, "0")}`;
    const values = entries.get(date) || { home: 0, zanzibar: 0, loans: 0, income: 0 };
    const balance = values.income - values.home - values.zanzibar - values.loans;
    const balanceClass = balance > 0 ? "calendar-balance-positive" : balance < 0 ? "calendar-balance-negative" : "calendar-balance-zero";
    const balanceSign = balance > 0 ? "+ " : balance < 0 ? "− " : "";
    const balanceLabel = `${balanceSign}${formatMoney(Math.abs(balance))}`;
    const accumulated = accumulatedBalance(previousAccumulated, balance);
    const accumulatedClass = accumulated > 0 ? "calendar-balance-positive" : accumulated < 0 ? "calendar-balance-negative" : "calendar-balance-zero";
    const accumulatedSign = accumulated > 0 ? "+ " : accumulated < 0 ? "− " : "";
    const accumulatedLabel = `${accumulatedSign}${formatMoney(Math.abs(accumulated))}`;
    const weekday = new Date(Date.UTC(year, monthNumber - 1, dayNumber)).getUTCDay();
    cells.push(`<article class="calendar-day ${weekday === 0 ? "calendar-day-sunday" : ""} ${weekday === 6 ? "calendar-day-saturday" : ""}" data-calendar-date="${date}" role="button" tabindex="0" aria-label="Ver movimentações de ${formatTransactionDate(date)}">
      <strong class="calendar-date">${dayNumber}</strong>
      <div class="calendar-values">
        <span class="calendar-expense">Casa <b>${formatMoney(-values.home)}</b></span>
        <span class="calendar-expense">Zanzibar <b>${formatMoney(-values.zanzibar)}</b></span>
        <span class="calendar-expense">Empréstimos <b>${formatMoney(-values.loans)}</b></span>
        <span class="calendar-income">Receitas <b>${formatMoney(values.income)}</b></span>
      </div>
      <div class="calendar-balance ${balanceClass}"><span>Saldo</span><strong>${balanceLabel}</strong></div>
      <div class="calendar-accumulated ${accumulatedClass}"><span>Acumulado</span><strong>${accumulatedLabel}</strong></div>
    </article>`);
    previousAccumulated = accumulated;
  }
  $("#financial-calendar").innerHTML = cells.join("");
}

function openCalendarDayDialog(date) {
  const entries = [
    ["Receitas", monthIncomes().filter((item) => item.date === date), "income"],
    ["Despesas Casa", monthTransactions().filter((item) => item.date === date && item.location === "Casa"), "expense"],
    ["Despesas Zanzibar", monthTransactions().filter((item) => item.date === date && item.location === "Zanzibar"), "expense"],
    ["Empréstimos", monthTransactions().filter((item) => item.date === date && item.location === "Empréstimos"), "expense"],
  ];
  const renderItems = (items, type) => items.length
    ? `<ul class="calendar-detail-list">${items.map((item) => {
      const itemType = type === "income" ? item.source : item.expenseType;
      return `<li><span>${escapeHtml(itemType || "Sem tipo")} - ${escapeHtml(item.description)}</span><strong class="${type === "income" ? "income-text" : "expense-text"}">${type === "income" ? "+ " : "- "}${formatMoney(item.amount)}</strong></li>`;
    }).join("")}</ul>`
    : '<p class="calendar-detail-empty">Nenhum registro.</p>';
  $("#calendar-day-dialog-title").textContent = `Movimentações de ${formatTransactionDate(date)}`;
  $("#calendar-day-dialog-content").innerHTML = entries.map(([title, items, type]) => {
    const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalLabel = `(${formatMoney(total)})`;
    return `<section class="calendar-detail-section"><h3><span>${title}</span><strong class="${type === "income" ? "income-text" : "expense-text"}">${totalLabel}</strong></h3>${renderItems(items, type)}</section>`;
  }).join("");
  $("#calendar-day-dialog").showModal();
}

function renderLocationTransactions(location) {
  const panel = document.querySelector(`[data-location-panel="${location}"]`);
  const state = paginationState[location];
  const query = panel.querySelector("[data-search]").value.toLowerCase().trim();
  const type = panel.querySelector("[data-type-filter]").value;
  const taker = panel.querySelector("[data-taker-filter]").value;
  const month = selectedMonth();
  const day = panel.querySelector("[data-day-filter]").value;
  const today = localDate();
  const statusFiltered = transactions.filter((item) => {
    if (isBuffetExpense(item)) return false;
    if (expenseStatus === "realized") return item.date <= today;
    if (expenseStatus === "planned") return item.date > today;
    return true;
  });
  const source = inMonth(statusFiltered, month);
  const filtered = sortByDateDescending(filterEntries(day ? source.filter((item) => item.date === day) : source, {
    query,
    fields: ["description", "expenseType", "taker", "location", "creditor"],
    filters: { location, expenseType: type, taker },
  }));
  const filteredTotal = filtered.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paged = paginate(filtered, state.page, state.pageSize);
  state.page = paged.page;
  const { items: pageItems, totalPages } = paged;
  panel.querySelector("[data-transactions-list]").innerHTML = pageItems.map((item) => `<tr>
    <td>${escapeHtml(formatTransactionDate(item.date))}</td><td><div class="transaction-description"><span class="transaction-icon expense">↘</span>${escapeHtml(item.description)}</div></td>
    <td><span class="tag">${escapeHtml(item.expenseType)}</span></td><td>${escapeHtml(item.taker)}</td><td>${escapeHtml(item.creditor)}</td>
    <td class="align-right expense-text">- ${formatMoney(item.amount)}</td>
    <td class="align-right"><button class="action-button" data-edit="${item.id}" aria-label="Editar ${escapeHtml(item.description)}">•••</button></td></tr>`).join("");
  panel.querySelector("[data-location-total]").textContent = `(${formatMoney(filteredTotal)})`;
  panel.querySelector("[data-location-total]").dataset.total = String(filteredTotal);
  panel.querySelector("[data-empty-state]").hidden = filtered.length > 0;
  panel.querySelector("[data-pagination-status]").textContent = `Página ${state.page} de ${totalPages}`;
  panel.querySelector("[data-pagination-prev]").disabled = state.page === 1;
  panel.querySelector("[data-pagination-next]").disabled = state.page === totalPages;
}

function renderTransactions() {
  ["Casa", "Zanzibar", "Empréstimos"].forEach(renderLocationTransactions);
  renderIncomeTransactions();
  const expenseTotal = [...document.querySelectorAll("[data-location-total]")].reduce((sum, element) => sum + Number(element.dataset.total || 0), 0);
  $("#expense-section-total").textContent = `(${formatMoney(expenseTotal)})`;
}

function renderIncomeTransactions() {
  const panel = $("[data-income-panel]");
  const state = paginationState.Receitas;
  const query = panel.querySelector("[data-income-search]").value.toLowerCase().trim();
  const source = panel.querySelector("[data-income-source-filter]").value;
  const month = selectedMonth();
  const day = panel.querySelector("[data-day-filter]").value;
  const sourceEntries = inMonth(incomes.filter((item) => !isBuffetIncome(item)), month);
  const filtered = sortByDateDescending(filterEntries(day ? sourceEntries.filter((item) => item.date === day) : sourceEntries, {
    query,
    fields: ["description", "source"],
    filters: { source },
  }));
  const paged = paginate(filtered, state.page, state.pageSize);
  state.page = paged.page;
  const { items: pageItems, totalPages } = paged;
  panel.querySelector("[data-income-list]").innerHTML = pageItems.map((item) => `<tr><td>${escapeHtml(formatTransactionDate(item.date))}</td><td><div class="transaction-description"><span class="transaction-icon income">↗</span>${escapeHtml(item.description)}</div></td><td>${escapeHtml(item.source)}</td><td class="align-right income-text">+ ${formatMoney(item.amount)}</td><td class="align-right"><button class="action-button" data-edit-income="${item.id}" aria-label="Editar ${escapeHtml(item.description)}">•••</button></td></tr>`).join("");
  panel.querySelector("[data-income-empty]").hidden = filtered.length > 0;
  panel.closest(".income-section").querySelector("#income-section-total").textContent = `(${formatMoney(filtered.reduce((sum, item) => sum + Number(item.amount || 0), 0))})`;
  panel.querySelector("[data-income-pagination-status]").textContent = `Página ${state.page} de ${totalPages}`;
  panel.querySelector("[data-income-pagination-prev]").disabled = state.page === 1;
  panel.querySelector("[data-income-pagination-next]").disabled = state.page === totalPages;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const output = [];
  let inCode = false;
  let code = [];
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    const escaped = escapeHtml(line);
    if (!escaped.trim()) continue;
    if (/^### /.test(escaped)) output.push(`<h3>${escaped.slice(4)}</h3>`);
    else if (/^## /.test(escaped)) output.push(`<h2>${escaped.slice(3)}</h2>`);
    else if (/^# /.test(escaped)) output.push(`<h1>${escaped.slice(2)}</h1>`);
    else if (/^- /.test(escaped)) output.push(`<li>${escaped.slice(2)}</li>`);
    else output.push(`<p>${escaped}</p>`);
  }
  return output.join("");
}

async function loadMarkdownDocuments() {
  const select = $("#markdown-document-select");
  const viewer = $("#markdown-document-viewer");
  if (!select || !viewer) return;
  try {
    const response = await fetch(DOCUMENTATION_URL);
    if (!response.ok) throw new Error("Não foi possível listar a documentação.");
    const { files } = await response.json();
    select.innerHTML = `<option value="">Selecione...</option>${files.map((file) => `<option value="${encodeURIComponent(file)}">${escapeHtml(file)}</option>`).join("")}`;
    select.addEventListener("change", async () => {
      if (!select.value) {
        viewer.innerHTML = '<p class="empty-state">Selecione um documento para visualizar.</p>';
        return;
      }
      viewer.innerHTML = '<p class="muted">Carregando documento...</p>';
      try {
        const response = await fetch(`${DOCUMENTATION_URL}/${select.value}`);
        if (!response.ok) throw new Error("Não foi possível carregar o documento.");
        const document = await response.json();
        viewer.innerHTML = `<p class="markdown-document-path">${escapeHtml(document.path)}</p>${renderMarkdown(document.content)}`;
      } catch (error) {
        viewer.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
      }
    });
  } catch (error) {
    viewer.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  }
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

function downloadCsv(filename, headers, rows) {
  const csvValue = (value) => {
    const text = String(value ?? "");
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(csvValue).join(";")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}\r\n`], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportMovementRows(location) {
  return sortByDateDescending(inMonth(transactions.filter((item) => !isBuffetExpense(item) && item.location === location), selectedMonth()))
    .map((item) => [formatTransactionDate(item.date), item.description, item.expenseType, item.taker, item.creditor, formatMoney(item.amount)]);
}

function exportIncomeRows() {
  return sortByDateDescending(monthIncomes()).map((item) => [formatTransactionDate(item.date), item.description, item.source, formatMoney(item.amount)]);
}

function exportDailySalesRows() {
  return [...cashClosings].sort((a, b) => `${b.date}${b.paymentMethod}`.localeCompare(`${a.date}${a.paymentMethod}`, "pt-BR"))
    .map((item) => [formatTransactionDate(item.date), item.paymentMethod, item.saleCount, formatMoney(item.totalAmount)]);
}

function exportMonthlySalesRows() {
  const currentPeriod = currentMonth();
  const currentRows = cashClosings
    .filter((item) => String(item.date || "").slice(0, 7) === currentPeriod)
    .reduce((rows, item) => {
      const key = normalizeCatalogValue(item.paymentMethod);
      const current = rows.get(key) || { year: Number(currentPeriod.slice(0, 4)), month: Number(currentPeriod.slice(5, 7)), paymentMethod: item.paymentMethod, saleCount: 0, totalAmount: 0 };
      current.saleCount += Number(item.saleCount || 0);
      current.totalAmount += Number(item.totalAmount || 0);
      rows.set(key, current);
      return rows;
    }, new Map());
  const billing = billings.find((item) => `${item.year}-${String(item.month).padStart(2, "0")}` === currentPeriod);
  const currentExportRows = currentRows.size
    ? [...currentRows.values()]
    : billing
      ? [{ year: billing.year, month: billing.month, paymentMethod: "Total do mês", saleCount: billing.saleCount, totalAmount: billing.amount }]
      : monthlyCashClosings.filter((item) => `${item.year}-${String(item.month).padStart(2, "0")}` === currentPeriod);
  const historicalRows = monthlyCashClosings.filter((item) => `${item.year}-${String(item.month).padStart(2, "0")}` !== currentPeriod);
  return [...currentExportRows, ...historicalRows]
    .sort((a, b) => `${b.year}-${String(b.month).padStart(2, "0")}${b.paymentMethod}`.localeCompare(`${a.year}-${String(a.month).padStart(2, "0")}${a.paymentMethod}`, "pt-BR"))
    .map((item) => [
      new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${item.year}-${String(item.month).padStart(2, "0")}-15T12:00:00`)),
      item.paymentMethod,
      item.saleCount,
      formatMoney(item.totalAmount),
    ]);
}

const exportDefinitions = {
  income: ["receitas.csv", ["Data", "Descrição", "Fonte", "Valor"], exportIncomeRows],
  Casa: ["despesas-casa.csv", ["Data", "Descrição", "Tipo", "Tomador", "Credor", "Valor"], () => exportMovementRows("Casa")],
  Zanzibar: ["despesas-zanzibar.csv", ["Data", "Descrição", "Tipo", "Tomador", "Credor", "Valor"], () => exportMovementRows("Zanzibar")],
  Empréstimos: ["emprestimos.csv", ["Data", "Descrição", "Tipo", "Tomador", "Credor", "Valor"], () => exportMovementRows("Empréstimos")],
  "daily-sales": ["fechamentos-diarios.csv", ["Data", "Forma de recebimento", "Vendas", "Valor"], exportDailySalesRows],
  "monthly-sales": ["fechamentos-mensais.csv", ["Mês", "Forma de recebimento", "Vendas", "Valor"], exportMonthlySalesRows],
};

document.querySelectorAll("[data-export]").forEach((button) => {
  button.addEventListener("click", () => {
    const definition = exportDefinitions[button.dataset.export];
    if (definition) downloadCsv(definition[0], definition[1], definition[2]());
  });
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
    return `<tr><td>${period}</td><td>${item.owner === "R" ? "R" : "P"}</td><td class="align-right">${formatMoney(item.target)}</td><td class="align-right">${formatMoney(item.budget)}</td><td class="align-right">${formatMoney(item.forecast)}</td><td class="align-right">${formatMoney(item.patamar)}</td><td class="align-right">${formatMoney(item.result)}</td><td>${status}</td><td class="align-right"><button class="action-button" data-edit-limit="${item.id}" aria-label="Editar limite">•••</button></td></tr>`;
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
  const withoutBuffet = (values) => values.filter((value) => String(value).trim().toLocaleLowerCase("pt-BR") !== "buffet");
  const locationOrder = ["Casa", "Zanzibar", "Empréstimos"];
  const activeLocations = locationOrder
    .filter((name) => locations.includes(name) && catalogMetadata.locations?.find((item) => item.name === name)?.isActive !== false)
    .concat(locations.filter((name) => !locationOrder.includes(name) && catalogMetadata.locations?.find((item) => item.name === name)?.isActive !== false))
    .filter((name) => withoutBuffet([name]).length);
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
  const availableExpenseTypes = activeCatalog("expense_types", expenseTypes).filter((item) => item !== "Empréstimo" && String(item).trim().toLocaleLowerCase("pt-BR") !== "buffet");
  expenseType.innerHTML = availableExpenseTypes.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
  expenseType.disabled = false;
  expenseType.removeAttribute("aria-disabled");
  if (location === "Casa") {
    const availableTakers = takers.filter((item) => item !== "Zanzibar" && String(item).trim().toLocaleLowerCase("pt-BR") !== "buffet");
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
  taker.innerHTML = takers.filter((item) => String(item).trim().toLocaleLowerCase("pt-BR") !== "buffet").map((item) => `<option>${escapeHtml(item)}</option>`).join("");
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
  $("#buffet-income-client-id").value = item?.clientId || "";
  $("#buffet-income-description").value = item?.description || "";
  $("#buffet-income-observation").value = item?.observation || "";
  $("#buffet-income-amount").value = item ? formatInputAmount(item.amount) : "";
  $("#buffet-income-date").value = item?.date || localDate();
  $("#buffet-income-dialog").showModal();
}
function openBuffetExpenseDialog(item) {
  $("#buffet-expense-dialog-title").textContent = item ? "Editar despesa" : "Nova despesa";
  $("#buffet-expense-id").value = item?.id || "";
  $("#buffet-expense-client-id").value = item?.clientId || "";
  $("#buffet-expense-description").value = item?.description || "";
  $("#buffet-expense-observation").value = item?.observation || "";
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
  const item = { id: id || `buffet-income-${crypto.randomUUID()}`, clientId: $("#buffet-income-client-id").value || undefined, description: $("#buffet-income-description").value.trim(), observation: $("#buffet-income-observation").value.trim(), amount: parseInputAmount($("#buffet-income-amount").value), type: "income", source: "Buffet", product: "buffet", date: $("#buffet-income-date").value };
  if (!item.description || !item.amount || !item.date) return showFeedback("Preencha descrição, valor e data.");
  persistBuffetEntry(item, id, $("#buffet-income-dialog"), "Receita do Buffet");
});
$("#buffet-expense-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#buffet-expense-id").value;
  const item = { id: id || `buffet-expense-${crypto.randomUUID()}`, clientId: $("#buffet-expense-client-id").value || undefined, description: $("#buffet-expense-description").value.trim(), observation: $("#buffet-expense-observation").value.trim(), amount: parseInputAmount($("#buffet-expense-amount").value), type: "expense", location: "Buffet", expenseType: "Buffet", taker: "Buffet", creditor: "Caixa", product: "buffet", date: $("#buffet-expense-date").value };
  if (!item.description || !item.amount || !item.date) return showFeedback("Preencha descrição, valor e data.");
  persistBuffetEntry(item, id, $("#buffet-expense-dialog"), "Despesa do Buffet");
});
$("#buffet-period-select").addEventListener("change", renderBuffet);
document.querySelector(".buffet-grid").addEventListener("click", (event) => {
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
  saveMonthlyCashClosings(API_URL, values).then(async () => {
    billings = await refreshBillings(API_URL);
    renderMonthlyCashClosings((rows) => [...rows].sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod, "pt-BR")));
    renderBillings();
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
  const owner = item?.owner === "R" ? "R" : "P";
  document.querySelectorAll("[data-limit-owner]").forEach((option) => {
    const selected = option.dataset.limitOwner === owner;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-checked", String(selected));
  });
  ["target", "budget", "forecast", "patamar", "result"].forEach((field) => { $(`#limit-${field}`).value = item ? formatInputAmount(item[field]) : ""; });
  updateLimitResult();
  $("#limit-dialog").showModal();
  requestAnimationFrame(() => $("#limit-target").focus());
}
$("#new-limit").addEventListener("click", () => openLimitDialog());
$("#close-limit-dialog").addEventListener("click", () => $("#limit-dialog").close());
$("#cancel-limit-dialog").addEventListener("click", () => $("#limit-dialog").close());
$("#limit-owner-options").addEventListener("click", (event) => {
  const option = event.target.closest("[data-limit-owner]");
  if (!option) return;
  document.querySelectorAll("[data-limit-owner]").forEach((item) => {
    const selected = item === option;
    item.classList.toggle("selected", selected);
    item.setAttribute("aria-checked", String(selected));
  });
});
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
  const owner = document.querySelector("[data-limit-owner].selected")?.dataset.limitOwner || "P";
  if (limits.some((item) => item.month === month && item.year === year && item.owner === owner && String(item.id) !== String(id))) return showFeedback("Já existe limite para este mês e owner.");
  const existingLimit = limits.find((entry) => String(entry.id) === String(id));
  const item = {
    id: id || crypto.randomUUID(), ...(existingLimit?.clientId ? { clientId: existingLimit.clientId } : {}), month, year, owner,
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
$("#close-calendar-day-dialog").addEventListener("click", () => $("#calendar-day-dialog").close());
$("#logout-button").addEventListener("click", async () => {
  $("#account-menu").open = false;
  await fetch(new URL("api/auth/logout", document.baseURI).pathname, { method: "POST" });
  window.location.reload();
});
document.addEventListener("click", (event) => {
  const accountMenu = $("#account-menu");
  if (accountMenu?.open && !accountMenu.contains(event.target)) accountMenu.open = false;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") $("#account-menu").open = false;
});
$("#authorized-users-list")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-authorize-email]");
  if (!button) return;
  const response = await fetch(new URL("api/auth/users", document.baseURI).pathname, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: button.dataset.authorizeEmail, authorized: button.dataset.authorized !== "true" }),
  });
  if (!response.ok) return showFeedback("Não foi possível alterar a autorização.");
  await renderAuthorizedUsers();
});
$("#calendar-day-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
$("#financial-calendar").addEventListener("click", (event) => {
  const day = event.target.closest("[data-calendar-date]");
  if (day) openCalendarDayDialog(day.dataset.calendarDate);
});
$("#financial-calendar").addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-calendar-date]")) {
    event.preventDefault();
    openCalendarDayDialog(event.target.dataset.calendarDate);
  }
});
document.querySelectorAll("[data-location-panel]").forEach((panel) => {
  panel.querySelectorAll("[data-search], [data-type-filter], [data-taker-filter], [data-day-filter]").forEach((control) => control.addEventListener("input", () => {
    paginationState[panel.dataset.locationPanel].page = 1;
    renderLocationTransactions(panel.dataset.locationPanel);
  }));
  panel.querySelector("[data-day-filter]").addEventListener("change", () => {
    paginationState[panel.dataset.locationPanel].page = 1;
    renderLocationTransactions(panel.dataset.locationPanel);
  });
  panel.querySelector("[data-clear-day-filter]").addEventListener("click", () => {
    panel.querySelector("[data-day-filter]").value = "";
    paginationState[panel.dataset.locationPanel].page = 1;
    renderLocationTransactions(panel.dataset.locationPanel);
  });
  panel.querySelector("[data-page-size]").addEventListener("change", (event) => {
    const state = paginationState[panel.dataset.locationPanel];
    state.pageSize = Number(event.target.value);
    state.page = 1;
    renderLocationTransactions(panel.dataset.locationPanel);
  });
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
const incomePanel = $("[data-income-panel]");
incomePanel.querySelectorAll("[data-income-search], [data-income-source-filter], [data-day-filter]").forEach((control) => control.addEventListener("input", () => { paginationState.Receitas.page = 1; renderIncomeTransactions(); }));
incomePanel.querySelector("[data-day-filter]").addEventListener("change", () => { paginationState.Receitas.page = 1; renderIncomeTransactions(); });
incomePanel.querySelector("[data-clear-day-filter]").addEventListener("click", () => { incomePanel.querySelector("[data-day-filter]").value = ""; paginationState.Receitas.page = 1; renderIncomeTransactions(); });
incomePanel.querySelector("[data-income-page-size]").addEventListener("change", (event) => { paginationState.Receitas.pageSize = Number(event.target.value); paginationState.Receitas.page = 1; renderIncomeTransactions(); });
incomePanel.querySelector("[data-income-pagination-prev]").addEventListener("click", () => { if (paginationState.Receitas.page > 1) { paginationState.Receitas.page--; renderIncomeTransactions(); } });
incomePanel.querySelector("[data-income-pagination-next]").addEventListener("click", () => { paginationState.Receitas.page++; renderIncomeTransactions(); });
incomePanel.addEventListener("click", (event) => { const button = event.target.closest("[data-edit-income]");   if (button) openIncomeDialog(incomes.find((item) => String(item.id) === button.dataset.editIncome)); });
document.querySelectorAll("[data-expense-status]").forEach((button) => button.addEventListener("click", () => {
  expenseStatus = button.dataset.expenseStatus;
  document.querySelectorAll("[data-expense-status]").forEach((option) => option.classList.toggle("selected", option.dataset.expenseStatus === expenseStatus));
  paginationState.Casa.page = 1;
  paginationState.Zanzibar.page = 1;
  paginationState.Empréstimos.page = 1;
  renderTransactions();
}));
document.querySelectorAll("[data-month-select]").forEach((select) => select.addEventListener("change", (event) => {
  const [year, month] = event.target.value.split("-");
  $("#month-filter-month").value = month;
  $("#month-filter-year").value = year;
  $("#report-period-select").value = event.target.value;
  syncDayFilters();
  render();
  renderReports();
  document.querySelectorAll("[data-day-filter]").forEach((dayFilter) => { dayFilter.value = ""; });
}));
document.querySelectorAll("#month-filter-month, #month-filter-year").forEach((select) => select.addEventListener("change", () => {
  const month = `${$("#month-filter-year").value}-${$("#month-filter-month").value}`;
  document.querySelectorAll("[data-month-select]").forEach((other) => { other.value = month; });
  $("#report-period-select").value = month;
  syncDayFilters();
  render();
  renderReports();
}));
$("#financial-advisor-run").addEventListener("click", async () => {
  if (financialAdvisorBusy) return;
  financialAdvisorBusy = true;
  const button = $("#financial-advisor-run");
  const status = $("#financial-advisor-status");
  const output = $("#financial-advisor-output");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  status.textContent = "Calculando indicadores...";
  output.replaceChildren();
  try {
    const month = selectedMonth();
    const scope = $("#financial-advisor-scope").value;
    const response = await fetch(`${FINANCIAL_INSIGHTS_URL}?month=${encodeURIComponent(month)}&scope=${encodeURIComponent(scope)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Falha na análise (${response.status})`);
    const deterministic = payload.deterministic;
    if (!deterministic || !deterministic.totals) throw new Error("A resposta da análise está vazia.");
    const heading = document.createElement("h3");
    heading.textContent = `${scope === "buffet" ? "Buffet" : "Geral"} — ${formatPeriod(month)}`;
    const metrics = document.createElement("p");
    metrics.textContent = `Receitas: R$ ${deterministic.totals.income.toFixed(2)} | Despesas: R$ ${deterministic.totals.expense.toFixed(2)} | Saldo: R$ ${deterministic.totals.balance.toFixed(2)} | ${deterministic.totals.count} lançamentos`;
    output.append(heading, metrics);
    latestFinancialInsightResult = { deterministic, ai: null };
    $("#financial-advisor-save").hidden = false;
    const variation = document.createElement("p");
    const formatVariation = (value) => value === null ? "sem base no período anterior" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
    variation.textContent = `Variação contra ${formatPeriod(deterministic.previousPeriod)}: receitas ${formatVariation(deterministic.variations.incomePercent)}, despesas ${formatVariation(deterministic.variations.expensePercent)}, saldo ${formatVariation(deterministic.variations.balancePercent)}.`;
    output.append(variation);
    const details = document.createElement("p");
    if (deterministic.totals.count === 0) {
      details.textContent = "Nenhum lançamento encontrado no período e escopo selecionados.";
      output.append(details);
      status.textContent = "Não há dados suficientes para calcular indicadores neste período.";
      return;
    }
    const category = deterministic.concentration.expensesByCategory[0];
    const recurrent = deterministic.recurrence[0];
    const anomaly = deterministic.anomalies[0];
    details.textContent = category
      ? `Maior concentração de despesas: ${category.label} (R$ ${category.amount.toFixed(2)}).`
      : "Não há despesas categorizadas no período.";
    output.append(details);
    const patterns = document.createElement("p");
    patterns.textContent = recurrent
      ? `Recorrência identificada em ${recurrent.label}: ${recurrent.count} lançamentos, total de R$ ${recurrent.total.toFixed(2)}.`
      : "Não foram identificados padrões recorrentes suficientes.";
    output.append(patterns);
    if (anomaly) {
      const warning = document.createElement("p");
      warning.textContent = `Possível anomalia: lançamento de R$ ${anomaly.amount.toFixed(2)} em ${formatTransactionDate(anomaly.date)}. O indicador usa o limiar simples de três vezes a média do período.`;
      output.append(warning);
    }
    if (deterministic.alerts?.length) {
      const alerts = document.createElement("p");
      alerts.textContent = `Alertas: ${deterministic.alerts.map((item) => `${item.message} (${item.severity})`).join(" ")}`;
      output.append(alerts);
    }
    status.textContent = "Indicadores determinísticos calculados no servidor.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    financialAdvisorBusy = false;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
});
$("#financial-advisor-compare").addEventListener("click", async () => {
  if (financialAdvisorBusy) return;
  financialAdvisorBusy = true;
  const button = $("#financial-advisor-compare");
  const status = $("#financial-advisor-status");
  const output = $("#financial-advisor-output");
  button.disabled = true;
  status.textContent = "Comparando períodos...";
  try {
    const month = selectedMonth();
    const scope = $("#financial-advisor-scope").value;
    const response = await fetch(`${FINANCIAL_INSIGHTS_URL}/compare?month=${encodeURIComponent(month)}&scope=${encodeURIComponent(scope)}&periods=3`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Falha na comparação (${response.status})`);
    const trend = document.createElement("p");
    const formatTrend = (value) => value === null ? "sem base" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
    trend.textContent = `Comparação de 3 meses — receitas ${formatTrend(payload.trend.income)}, despesas ${formatTrend(payload.trend.expense)}, saldo ${formatTrend(payload.trend.balance)}.`;
    const alerts = document.createElement("p");
    alerts.textContent = payload.alerts?.length
      ? `Alertas encontrados: ${payload.alerts.map((item) => `${formatPeriod(item.period)}: ${item.message}`).join(" ")}`
      : "Nenhum alerta comparativo encontrado nos últimos meses.";
    output.append(trend, alerts);
    status.textContent = "Comparação e alertas concluídos.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    financialAdvisorBusy = false;
    button.disabled = false;
  }
});
$("#financial-advisor-ask").addEventListener("click", async () => {
  if (financialAdvisorBusy) return;
  const question = $("#financial-advisor-question-input").value.trim();
  if (!question) {
    $("#financial-advisor-status").textContent = "Digite uma pergunta sobre os indicadores.";
    return;
  }
  if (!window.confirm("Enviar esta pergunta para a IA usando somente indicadores agregados do período?")) return;
  financialAdvisorBusy = true;
  const button = $("#financial-advisor-ask");
  const status = $("#financial-advisor-status");
  const output = $("#financial-advisor-answer-output");
  button.disabled = true;
  output.replaceChildren();
  status.textContent = "Consultando a IA...";
  try {
    const response = await fetch(`${FINANCIAL_INSIGHTS_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: selectedMonth(), scope: $("#financial-advisor-scope").value, question }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Falha na pergunta (${response.status})`);
    if (!payload.ai?.enabled) throw new Error(payload.ai?.message || "A análise por IA está desabilitada.");
    const answer = document.createElement("p");
    answer.textContent = `Resposta gerada por IA: ${payload.ai.answer}`;
    const evidence = document.createElement("small");
    evidence.textContent = `Evidências: ${payload.ai.evidence.join(", ") || "não informadas"}. ${payload.ai.disclaimer}`;
    output.append(answer, evidence);
    status.textContent = `Resposta concluída. Prompt ${payload.ai.promptVersion}.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    financialAdvisorBusy = false;
    button.disabled = false;
  }
});
$("#financial-advisor-ai").addEventListener("click", async () => {
  if (financialAdvisorBusy) return;
  if (!window.confirm("Solicitar uma interpretação por IA usando somente indicadores agregados deste período?")) return;
  financialAdvisorBusy = true;
  const button = $("#financial-advisor-ai");
  const status = $("#financial-advisor-status");
  const output = $("#financial-advisor-output");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  status.textContent = "Solicitando interpretação por IA...";
  try {
    const month = selectedMonth();
    const scope = $("#financial-advisor-scope").value;
    const response = await fetch(FINANCIAL_INSIGHTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, scope, withAi: true }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Falha na interpretação (${response.status})`);
    const ai = payload.ai;
    if (!ai?.enabled) {
      status.textContent = ai?.message || "A análise por IA está desabilitada.";
      return;
    }
    latestFinancialInsightResult = { deterministic: payload.deterministic, ai };
    $("#financial-advisor-save").hidden = false;
    const summary = document.createElement("p");
    summary.textContent = `Gerado por IA: ${ai.summary}`;
    output.append(summary);
    for (const item of ai.insights) {
      const row = document.createElement("p");
      row.textContent = `Insight (${item.severity}): ${item.title}: ${item.description} Evidências: ${item.evidence.join(", ") || "não informadas"}.`;
      output.append(row);
    }
    for (const item of ai.recommendations) {
      const row = document.createElement("p");
      row.textContent = `Recomendação (${item.priority}): ${item.title}: ${item.description} Ação sugerida: ${item.action}.`;
      output.append(row);
    }
    const disclaimer = document.createElement("small");
    disclaimer.textContent = ai.disclaimer;
    output.append(disclaimer);
    status.textContent = `Interpretação por IA concluída. Prompt ${ai.promptVersion}.`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    financialAdvisorBusy = false;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
});
$("#financial-advisor-save").addEventListener("click", async () => {
  if (!latestFinancialInsightResult || financialAdvisorBusy) return;
  financialAdvisorBusy = true;
  const button = $("#financial-advisor-save");
  const status = $("#financial-advisor-status");
  button.disabled = true;
  try {
    const response = await fetch(FINANCIAL_INSIGHTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: latestFinancialInsightResult.deterministic.period, scope: latestFinancialInsightResult.deterministic.scope, withAi: Boolean(latestFinancialInsightResult.ai), saveHistory: true }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Falha ao salvar histórico (${response.status})`);
    status.textContent = "Análise salva no histórico deste usuário.";
    button.hidden = true;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    financialAdvisorBusy = false;
    button.disabled = false;
  }
});
$("#financial-advisor-history").addEventListener("click", async () => {
  const status = $("#financial-advisor-status");
  const output = $("#financial-advisor-history-output");
  output.hidden = false;
  output.replaceChildren();
  status.textContent = "Carregando histórico...";
  try {
    const response = await fetch(`${FINANCIAL_INSIGHTS_URL}/history`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Falha ao carregar histórico (${response.status})`);
    if (!payload.history?.length) {
      output.textContent = "Nenhuma análise salva para este usuário.";
    } else {
      for (const entry of payload.history) {
        const row = document.createElement("p");
        row.textContent = `${entry.period} · ${entry.scope === "buffet" ? "Buffet" : "Geral"} · salvo em ${new Date(entry.createdAt).toLocaleString("pt-BR")}${entry.ai?.summary ? ` · ${entry.ai.summary}` : ""}`;
        output.append(row);
      }
    }
    status.textContent = "Histórico carregado.";
  } catch (error) {
    status.textContent = error.message;
  }
});
$("#report-period-select").addEventListener("change", (event) => {
  const [year, month] = event.target.value.split("-");
  $("#month-filter-month").value = month;
  $("#month-filter-year").value = year;
  document.querySelectorAll("[data-month-select]").forEach((other) => { other.value = event.target.value; });
  syncDayFilters();
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
$("#messaging-new")?.addEventListener("click", () => openMessagingUsers().catch((error) => { $("#messaging-status").textContent = error.message; }));
$("#messaging-conversations")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-messaging-conversation]");
  if (!button) return;
  const title = button.querySelector("strong")?.textContent || "Conversa";
  selectMessagingConversation(button.dataset.messagingConversation, title).catch((error) => { $("#messaging-status").textContent = error.message; });
});
$("#messaging-users")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-messaging-user]");
  if (!button) return;
  try {
    const { conversation } = await messagingRequest("/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: Number(button.dataset.messagingUser) }) });
    await selectMessagingConversation(conversation.id, button.querySelector("strong")?.textContent || "Conversa");
    $("#messaging-users").hidden = true;
  } catch (error) {
    $("#messaging-status").textContent = error.message;
  }
});
$("#messaging-composer")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!messagingConversationId) return;
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  const file = $("#messaging-file").files[0];
  try {
    submit.disabled = true;
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      const upload = await messagingRequest("/files", { method: "POST", body: formData });
      messagingPendingFileIds = [upload.file.id];
    }
    await messagingRequest(`/conversations/${messagingConversationId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: $("#messaging-body").value, fileIds: messagingPendingFileIds }) });
    $("#messaging-body").value = "";
    $("#messaging-file").value = "";
    messagingPendingFileIds = [];
    await loadMessagingConversations();
  } catch (error) {
    $("#messaging-status").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
const pages = ["resumo", "lancamentos", "vendas", "faturamento", "relatorios", "cadastros", "ferramentas", "analise-ia", "mensagens", "buffet"];
function renderPage() {
  const page = pages.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "resumo";
  document.querySelectorAll("[data-page]").forEach((section) => { section.hidden = section.dataset.page !== page; });
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${page}`));
  if (window.location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);
}
window.addEventListener("hashchange", renderPage);

renderPage();
loadAuth().then((authenticated) => {
  if (authenticated) startAuthHeartbeat();
  return authenticated ? loadData() : null;
}).then(() => {
  if (!authUser) return;
  loadMarkdownDocuments();
  transactions = transactions.map((item) => ({ ...item, expenseType: item.expenseType || item.category || "Outros", taker: item.taker || "Pessoal", location: item.location || "Casa", creditor: item.creditor || "Caixa" }));
  $("#today-label").textContent = todayLabel();
  const accountName = String(authUser.name || authUser.email).trim();
  $("#account-avatar-fallback").textContent = accountName.charAt(0).toUpperCase();
  const accountPicture = $("#account-avatar-image");
  if (accountPicture && /^https:\/\//i.test(String(authUser.picture || ""))) {
    accountPicture.src = authUser.picture;
    accountPicture.hidden = false;
    $("#account-avatar-fallback").hidden = true;
    const accountMenuPicture = $("#account-menu-avatar-image");
    accountMenuPicture.src = authUser.picture;
    accountMenuPicture.hidden = false;
    $("#account-menu-avatar-fallback").hidden = true;
    accountPicture.addEventListener("error", () => {
      accountPicture.hidden = true;
      $("#account-avatar-fallback").hidden = false;
      accountMenuPicture.hidden = true;
      $("#account-menu-avatar-fallback").hidden = false;
    }, { once: true });
  } else {
    $("#account-menu-avatar-fallback").textContent = accountName.charAt(0).toUpperCase();
  }
  $("#account-trigger-name").textContent = accountName;
  $("#account-name").textContent = accountName;
  $("#greeting").textContent = `Olá, ${accountName} ✳`;
  $("#account-email").textContent = authUser.email;
  $("#last-update").textContent = formatLastTransactionUpdate(lastTransactionUpdate);
  setupFormOptions(); render(); renderReports(); renderRegistries(); renderCashClosings(); renderBillings(); renderLimits(); renderAuthorizedUsers(); initializeMessaging(); renderPage();
}).catch((error) => { console.error("Falha ao inicializar a aplicação.", error); showFeedback(`Não foi possível carregar os dados iniciais: ${error.message}`); });
