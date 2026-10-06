import { inMonth, groupTotals, summarize } from "./src/shared/finance.js";
import { currentMonth, localDate, todayLabel } from "./src/shared/dates.js";
import { formatDate, formatInputAmount, formatMoney, formatTransactionDate, parseInputAmount } from "./src/shared/formatters.js";
import { canDeleteRegistry, hasRegistryName, registryDefinition, renameRegistry } from "./src/shared/registries.js";
import { defaultAppState } from "./src/client/state-persistence.js";
import { createExpenseEntry, createIncomeEntry, upsertEntry } from "./src/shared/entry-factories.js";
import { filterEntries, paginate, sortByDateDescending } from "./src/shared/collections.js";
import { loadAppState, persistAppState } from "./src/client/state-service.js";
import { catalogDefaults } from "./src/shared/catalog-defaults.js";

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
const pendingRegistryOrderSaves = new Set();
let cashClosings = [];
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
  Receitas: { page: 1, pageSize: 5 },
};

const $ = (selector) => document.querySelector(selector);
const selectedMonth = () => $("#month-filter").value || currentMonth();

async function loadData() {
  ({ transactions, incomes, cashClosings, expenseTypes, takers, locations, creditors, paymentMethods, incomeSources, catalogMetadata } = await loadAppState(API_URL, "./data.json", initialState));
  const catalogs = { type: ["expense_types", expenseTypes], taker: ["takers", takers], location: ["locations", locations], creditor: ["creditors", creditors], paymentMethod: ["payment_methods", paymentMethods], incomeSource: ["income_sources", incomeSources] };
  Object.values(catalogs).forEach(([key, values]) => { catalogMetadata[key] ||= values.map((name, displayOrder) => ({ name, displayOrder, isActive: true })); });
}

async function save() {
  const state = { transactions, incomes, cashClosings, expenseTypes, takers, locations, creditors, paymentMethods, incomeSources, catalogMetadata };
  await persistAppState(API_URL, state);
}
function captureState() {
  return { transactions: [...transactions], incomes: [...incomes], cashClosings: [...cashClosings], expenseTypes: [...expenseTypes], takers: [...takers], locations: [...locations], creditors: [...creditors], paymentMethods: [...paymentMethods], incomeSources: [...incomeSources], catalogMetadata: structuredClone(catalogMetadata) };
}
function restoreState(previous) {
  ({ transactions, incomes, cashClosings, expenseTypes, takers, locations, creditors, paymentMethods, incomeSources, catalogMetadata } = previous);
}

function setupFormOptions() {
  const active = (kind, values) => values.filter((name) => catalogMetadata[kind]?.find((item) => item.name === name)?.isActive !== false).sort((a, b) => (catalogMetadata[kind]?.find((item) => item.name === a)?.displayOrder || 0) - (catalogMetadata[kind]?.find((item) => item.name === b)?.displayOrder || 0) || a.localeCompare(b, "pt-BR"));
  if (!takers.some((taker) => taker.toLowerCase() === "zanzibar")) takers.push("Zanzibar");
  const available = { expenseTypes: active("expense_types", expenseTypes), takers: active("takers", takers), locations: active("locations", locations), creditors: active("creditors", creditors), paymentMethods: active("payment_methods", paymentMethods), incomeSources: active("income_sources", incomeSources) };
  $("#expense-type").innerHTML = available.expenseTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("");
  $("#taker").innerHTML = available.takers.map((taker) => `<option>${escapeHtml(taker)}</option>`).join("");
  $("#creditor").innerHTML = available.creditors.map((creditor) => `<option>${escapeHtml(creditor)}</option>`).join("");
  $("#income-source").innerHTML = available.incomeSources.map((source) => `<option>${escapeHtml(source)}</option>`).join("");
  renderLocationOptions();
  const availableMonths = [...new Set([currentMonth(), ...transactions.map((item) => item.date), ...incomes.map((item) => item.date)].map((date) => date.slice(0, 7)))].sort().reverse();
  const monthOptions = availableMonths.map((month) => `<option value="${month}">${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-15`))}</option>`).join("");
  document.querySelectorAll("[data-month-select], #month-filter").forEach((select) => { select.innerHTML = monthOptions; select.value = currentMonth(); });
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
  return inMonth(transactions, selectedMonth());
}
function monthIncomes() {
  return inMonth(incomes, selectedMonth());
}

function renderSummary() {
  const summary = summarize([...transactions, ...incomes], selectedMonth());
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
  $("#income-value").textContent = formatMoney(summary.income);
  $("#income-caption").textContent = `${incomeCount} ${incomeCount === 1 ? "entrada registrada" : "entradas registradas"}`;
  $("#home-expense-value").textContent = formatMoney(-home.amount);
  $("#home-expense-caption").textContent = `${home.count} ${home.count === 1 ? "despesa registrada" : "despesas registradas"}`;
  $("#business-expense-value").textContent = formatMoney(-business.amount);
  $("#business-expense-caption").textContent = `${business.count} ${business.count === 1 ? "despesa registrada" : "despesas registradas"}`;
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

function renderChart() {
  const items = monthTransactions();
  const days = [...new Set(items.map((item) => item.date.slice(8, 10)))].sort();
  const chartDays = days.length ? days.slice(-7) : ["01", "05", "10", "15", "20", "25", "30"];
  const max = Math.max(...chartDays.map((day) => Math.max(...items.filter((item) => item.date.slice(8, 10) === day).map((item) => item.amount), 0)), 100);
  $("#chart").innerHTML = chartDays.map((day) => {
    const dayItems = items.filter((item) => item.date.slice(8, 10) === day);
    const expense = dayItems.reduce((sum, item) => sum + item.amount, 0);
    return `<div class="chart-column"><div class="bars"><i class="bar expense-bar" style="height:${Math.max(3, expense / max * 100)}%" title="${formatMoney(expense)}"></i></div><small>${day}</small></div>`;
  }).join("");
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
  Object.keys(paginationState).filter((location) => location !== "Receitas").forEach(renderLocationTransactions);
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
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function render() { renderSummary(); renderChart(); renderTransactions(); }

function renderReports() {
  const items = monthTransactions();
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const group = (key) => groupTotals(items, key);
  const rows = (entries) => entries.length ? entries.map(([label, value]) => `<div class="report-row"><span>${escapeHtml(label)}</span><strong>${formatMoney(value)}</strong><i><b style="width:${total ? value / total * 100 : 0}%"></b></i></div>`).join("") : `<p class="muted">Nenhuma despesa neste período.</p>`;
  $("#daily-report").innerHTML = rows(Object.entries(items.reduce((result, item) => { result[item.date] = (result[item.date] || 0) + item.amount; return result; }, {})).sort((a, b) => b[0].localeCompare(a[0])).map(([date, value]) => [formatDate(date), value]));
  $("#type-report").innerHTML = rows(group("expenseType"));
  $("#taker-report").innerHTML = rows(group("taker"));
  $("#report-total").textContent = formatMoney(total);
}

function renderRegistries() {
  const renderList = (items, kind) => items.length ? items.map((item, index) => {
    const table = { type: "expense_types", taker: "takers", location: "locations", creditor: "creditors", paymentMethod: "payment_methods", incomeSource: "income_sources" }[kind];
    const metadata = catalogMetadata[table]?.find((entry) => entry.name === item) || { displayOrder: 0, isActive: true };
    const sortable = ["taker", "creditor", "paymentMethod", "incomeSource"].includes(kind);
    const orderControl = sortable ? `<input class="registry-order" data-catalog-order="${kind}" data-registry-index="${index}" type="text" inputmode="numeric" pattern="[0-9]*" value="${metadata.displayOrder}" aria-label="Ordem de ${escapeHtml(item)}" />` : "";
    return `<li class="${sortable ? "registry-sortable" : ""}" ${sortable ? `draggable="true" data-registry-drag-kind="${kind}" data-registry-drag-index="${index}"` : ""}>${sortable ? `<span class="registry-drag-hint" aria-hidden="true">⠿</span>` : ""}<span class="registry-name">${orderControl}${escapeHtml(item)}</span><span class="registry-actions"><label class="switch" title="${metadata.isActive ? "Ativo" : "Inativo"}"><input data-catalog-status="${kind}" data-registry-index="${index}" type="checkbox" ${metadata.isActive ? "checked" : ""} aria-label="${metadata.isActive ? "Desativar" : "Ativar"} ${escapeHtml(item)}" /><span class="switch-track" aria-hidden="true"></span></label><button type="button" class="registry-action" data-edit-registry="${kind}" data-registry-index="${index}" aria-label="Editar ${escapeHtml(item)}">✎</button><button type="button" class="registry-action danger registry-delete" data-delete-registry="${kind}" data-registry-index="${index}" aria-label="Excluir ${escapeHtml(item)}">×</button></span></li>`;
  }).join("") + (pendingRegistryOrderSaves.has(kind) ? `<li class="registry-order-save-row"><button type="button" class="small-button registry-order-save" data-save-registry-order="${kind}">Salvar Ordem</button></li>` : "") : `<li class="registry-empty">Nenhum cadastro criado.</li>`;
  $("#type-registry-list").innerHTML = renderList(expenseTypes, "type");
  $("#taker-registry-list").innerHTML = renderList(takers, "taker");
  $("#creditor-registry-list").innerHTML = renderList(creditors, "creditor");
  $("#payment-method-registry-list").innerHTML = renderList(paymentMethods, "paymentMethod");
  $("#income-source-registry-list").innerHTML = renderList(incomeSources, "incomeSource");
}

function renderCashClosings() {
  const total = cashClosings.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  $("#cash-closing-total").textContent = `(${formatMoney(total)})`;
  $("#cash-closings-list").innerHTML = cashClosings.map((item) => `<tr><td>${escapeHtml(formatTransactionDate(item.date))}</td><td>${escapeHtml(item.paymentMethod)}</td><td>${item.saleCount}</td><td class="align-right income-text">+ ${formatMoney(item.totalAmount)}</td><td class="align-right"><button class="action-button" data-edit-cash-closing="${item.id}" aria-label="Editar fechamento">•••</button></td></tr>`).join("");
  $("#cash-closings-empty").hidden = cashClosings.length > 0;
}

function activeCatalog(table, values) {
  return values.filter((name) => catalogMetadata[table]?.find((item) => item.name === name)?.isActive !== false)
    .sort((a, b) => (catalogMetadata[table]?.find((item) => item.name === a)?.displayOrder || 0) - (catalogMetadata[table]?.find((item) => item.name === b)?.displayOrder || 0) || a.localeCompare(b, "pt-BR"));
}

function openDialog(item) {
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
  save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); $("#transaction-dialog").close(); showFeedback(id ? "Despesa atualizada." : "Despesa adicionada."); }).catch(() => { restoreState(previous); setupFormOptions(); render(); renderReports(); renderRegistries(); showFeedback("Não foi possível salvar a despesa."); });
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
  save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); $("#income-dialog").close(); showFeedback(id ? "Receita atualizada." : "Receita adicionada."); }).catch((error) => { console.error(error); restoreState(previous); setupFormOptions(); render(); renderReports(); renderRegistries(); showFeedback("Não foi possível salvar a receita."); });
});
function renderLocationOptions() {
  const selected = $("#location-options").dataset.value || "Casa";
  const activeLocations = locations.filter((name) => catalogMetadata.locations?.find((item) => item.name === name)?.isActive !== false);
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
  if (location === "Casa") {
    creditor.innerHTML = "<option>Caixa</option>";
    creditor.value = "Caixa";
    creditor.disabled = true;
    creditor.setAttribute("aria-disabled", "true");
    taker.innerHTML = takers.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
    taker.disabled = false;
    taker.removeAttribute("aria-disabled");
    return;
  }
  if (location === "Zanzibar") {
    const selectedCreditor = creditor.value || "Caixa";
    taker.innerHTML = "<option>Zanzibar</option>";
    taker.value = "Zanzibar";
    taker.disabled = true;
    taker.setAttribute("aria-disabled", "true");
    creditor.innerHTML = creditors.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
    creditor.value = creditors.includes(selectedCreditor) ? selectedCreditor : "Caixa";
    creditor.disabled = false;
    creditor.removeAttribute("aria-disabled");
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
$("#new-income").addEventListener("click", () => openIncomeDialog());
$("#home-new-transaction").addEventListener("click", () => openDialog());
$("#home-new-income").addEventListener("click", () => openIncomeDialog());
$("#close-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#cancel-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#close-income-dialog").addEventListener("click", () => $("#income-dialog").close());
$("#cancel-income-dialog").addEventListener("click", () => $("#income-dialog").close());
function openCashClosingDialog(item) {
  $("#cash-closing-id").value = item?.id || "";
  $("#cash-closing-date").value = item?.date || localDate();
  const rows = item?.items || cashClosings.filter((entry) => entry.date === item?.date);
  $("#cash-closing-methods").innerHTML = activeCatalog("payment_methods", paymentMethods).map((method) => {
    const entry = rows.find((row) => row.paymentMethod === method);
    return `<label class="cash-closing-method"><span>${escapeHtml(method)}</span><input data-closing-sales type="number" min="0" step="1" value="${entry?.saleCount || 0}" aria-label="Vendas com ${escapeHtml(method)}" /><input data-closing-amount type="text" inputmode="decimal" dir="rtl" value="${entry ? formatInputAmount(entry.totalAmount) : ""}" placeholder="R$ 0,00" aria-label="Valor recebido em ${escapeHtml(method)}" /></label>`;
  }).join("");
  updateCashClosingTotal();
  $("#cash-closing-dialog").showModal();
}
$("#new-cash-closing").addEventListener("click", () => openCashClosingDialog());
$("#close-cash-closing-dialog").addEventListener("click", () => $("#cash-closing-dialog").close());
$("#cancel-cash-closing-dialog").addEventListener("click", () => $("#cash-closing-dialog").close());
function updateCashClosingTotal() {
  const total = [...document.querySelectorAll("[data-closing-amount]")].reduce((sum, input) => sum + parseInputAmount(input.value), 0);
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
  const date = $("#cash-closing-date").value;
  const id = $("#cash-closing-id").value;
  if (!id && cashClosings.some((entry) => entry.date === date)) return showFeedback("Já existe fechamento para esta data.");
  const previousCashClosings = cashClosings;
  const previousIncomes = incomes;
  const rows = [...document.querySelectorAll(".cash-closing-method")].map((row, index) => ({
    id: id && index === 0 ? id : crypto.randomUUID(),
    date,
    paymentMethod: activeCatalog("payment_methods", paymentMethods)[index],
    saleCount: Number(row.querySelector("[data-closing-sales]").value || 0),
    totalAmount: parseInputAmount(row.querySelector("[data-closing-amount]").value),
  })).filter((entry) => entry.saleCount || entry.totalAmount);
  const amount = rows.reduce((sum, entry) => sum + entry.totalAmount, 0);
  if (!amount) return showFeedback("Informe um valor maior que zero.");
  cashClosings = cashClosings.filter((entry) => entry.date !== date).concat(rows);
  const income = { id: `cash-closing-income-${date}`, description: `Vendas dia ${formatTransactionDate(date)}`, amount, type: "income", source: "Vendas", date };
  incomes = incomes.filter((entry) => entry.id !== income.id).concat(income);
  save().then(() => { renderCashClosings(); render(); renderReports(); $("#cash-closing-dialog").close(); showFeedback(id ? "Fechamento atualizado." : "Fechamento adicionado."); }).catch(() => {
    cashClosings = previousCashClosings;
    incomes = previousIncomes;
    renderCashClosings();
    render();
    renderReports();
    showFeedback("Não foi possível salvar o fechamento.");
  });
});
$("#cash-closings-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-cash-closing]");
  if (button) openCashClosingDialog(cashClosings.find((item) => String(item.id) === button.dataset.editCashClosing));
});
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
  incomePanel.addEventListener("click", (event) => { const button = event.target.closest("[data-edit-income]"); if (button) openIncomeDialog(incomes.find((item) => item.id === button.dataset.editIncome)); });
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
    if (button) openDialog(transactions.find((item) => item.id === button.dataset.edit));
  });
});
document.querySelectorAll("[data-month-select], #month-filter").forEach((select) => select.addEventListener("change", (event) => {
  document.querySelectorAll("[data-month-select], #month-filter").forEach((other) => { other.value = event.target.value; });
  render();
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
  catalogMetadata[table].push({ name: value, displayOrder: catalogMetadata[table].length, isActive: true });
  save().then(() => { setupFormOptions(); renderRegistries(); showFeedback(`${label[0].toUpperCase() + label.slice(1)} cadastrado.`); }).catch(() => { restoreState(previous); setupFormOptions(); renderRegistries(); showFeedback("Não foi possível salvar o cadastro."); });
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
    save().then(() => {
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
  save().then(() => { setupFormOptions(); renderRegistries(); showFeedback("Cadastro excluído."); }).catch(() => { restoreState(previous); setupFormOptions(); renderRegistries(); showFeedback("Não foi possível excluir o cadastro."); });
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
    metadata.displayOrder = Math.max(0, Number($("#registry-order").value) || 0);
    metadata.isActive = $("#registry-status").checked;
  }
  save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); $("#registry-dialog").close(); showFeedback("Cadastro atualizado."); }).catch(() => { restoreState(previous); setupFormOptions(); render(); renderReports(); renderRegistries(); showFeedback("Não foi possível atualizar o cadastro."); });
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
  save().then(() => { setupFormOptions(); renderRegistries(); showFeedback("Cadastro atualizado."); }).catch(() => { restoreState(previous); setupFormOptions(); renderRegistries(); showFeedback("Não foi possível atualizar o cadastro."); });
});
$("#export-button").addEventListener("click", () => { const blob = new Blob([JSON.stringify([...transactions, ...incomes], null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "clareza-transacoes.json"; link.click(); URL.revokeObjectURL(link.href); showFeedback("Dados exportados."); });

const pages = ["resumo", "lancamentos", "vendas", "relatorios", "cadastros"];
function renderPage() {
  const page = pages.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "resumo";
  document.querySelectorAll("[data-page]").forEach((section) => { section.hidden = section.dataset.page !== page; });
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${page}`));
  if (window.location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);
}
window.addEventListener("hashchange", renderPage);

renderPage();
loadData().then(() => { transactions = transactions.map((item) => ({ ...item, expenseType: item.expenseType || item.category || "Outros", taker: item.taker || "Pessoal", location: item.location || "Casa", creditor: item.creditor || "Caixa" })); $("#today-label").textContent = todayLabel(); setupFormOptions(); render(); renderReports(); renderRegistries(); renderCashClosings(); renderPage(); }).catch(() => { showFeedback("Não foi possível carregar os dados iniciais."); });
