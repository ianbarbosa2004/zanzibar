import { inMonth, groupTotals, summarize } from "./src/shared/finance.js";
import { currentMonth, localDate, todayLabel } from "./src/shared/dates.js";
import { formatDate, formatInputAmount, formatMoney, formatTransactionDate, parseInputAmount } from "./src/shared/formatters.js";
import { canDeleteRegistry, hasRegistryName, registryDefinition, renameRegistry } from "./src/shared/registries.js";
import { defaultAppState } from "./src/client/state-persistence.js";
import { createExpenseEntry, createIncomeEntry, upsertEntry } from "./src/shared/entry-factories.js";
import { filterEntries, paginate, sortByDateDescending } from "./src/shared/collections.js";
import { loadAppState, persistAppState } from "./src/client/state-service.js";

const defaultExpenseTypes = ["Moradia", "Alimentação", "Contas", "Transporte", "Lazer", "Saúde", "Educação", "Outros"];
const defaultTakers = ["Pessoal", "Zanzibar"];
const defaultLocations = ["Casa", "Zanzibar"];
const defaultCreditors = ["Caixa"];
const defaultIncomeSources = ["Salário"];
const API_URL = new URL("api/data", document.baseURI).pathname;
let transactions = [];
let expenseTypes = [...defaultExpenseTypes];
let takers = [...defaultTakers];
let locations = [...defaultLocations];
let creditors = [...defaultCreditors];
let incomes = [];
let incomeSources = [...defaultIncomeSources];
const initialState = defaultAppState({
  expenseTypes: defaultExpenseTypes,
  takers: defaultTakers,
  locations: defaultLocations,
  creditors: defaultCreditors,
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
  ({ transactions, incomes, expenseTypes, takers, locations, creditors, incomeSources } = await loadAppState(API_URL, "./data.json", initialState));
}

async function save() {
  const state = { transactions, incomes, expenseTypes, takers, locations, creditors, incomeSources };
  await persistAppState(API_URL, state);
}

function setupFormOptions() {
  if (!takers.some((taker) => taker.toLowerCase() === "zanzibar")) takers.push("Zanzibar");
  expenseTypes.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  takers.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  locations.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  creditors.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  incomeSources.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  $("#expense-type").innerHTML = expenseTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("");
  $("#taker").innerHTML = takers.map((taker) => `<option>${escapeHtml(taker)}</option>`).join("");
  $("#creditor").innerHTML = creditors.map((creditor) => `<option>${escapeHtml(creditor)}</option>`).join("");
  $("#income-source").innerHTML = incomeSources.map((source) => `<option>${escapeHtml(source)}</option>`).join("");
  renderLocationOptions();
  const availableMonths = [...new Set([currentMonth(), ...transactions.map((item) => item.date), ...incomes.map((item) => item.date)].map((date) => date.slice(0, 7)))].sort().reverse();
  const monthOptions = availableMonths.map((month) => `<option value="${month}">${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-15`))}</option>`).join("");
  document.querySelectorAll("[data-month-select], #month-filter").forEach((select) => { select.innerHTML = monthOptions; select.value = currentMonth(); });
  document.querySelectorAll("[data-type-filter]").forEach((filter) => {
    filter.innerHTML = `<option value="all">Todos os tipos</option>${expenseTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("")}`;
  });
  document.querySelectorAll("[data-taker-filter]").forEach((filter) => {
    filter.innerHTML = `<option value="all">Todos os tomadores</option>${takers.map((taker) => `<option>${escapeHtml(taker)}</option>`).join("")}`;
  });
  $("[data-income-source-filter]").innerHTML = `<option value="all">Todas as fontes</option>${incomeSources.map((source) => `<option>${escapeHtml(source)}</option>`).join("")}`;
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
    const property = { type: "expenseType", taker: "taker", location: "location", creditor: "creditor" }[kind];
    const count = kind === "incomeSource" ? incomes.filter((income) => income.source === item).length : transactions.filter((transaction) => transaction[property] === item).length;
    const label = kind === "incomeSource" ? "entrada" : "despesa";
    return `<li><span>${escapeHtml(item)} <small>${count} ${count === 1 ? label : `${label}s`}</small></span><span class="registry-actions"><button type="button" class="registry-action" data-edit-registry="${kind}" data-registry-index="${index}" aria-label="Editar ${escapeHtml(item)}">✎</button><button type="button" class="registry-action danger" data-delete-registry="${kind}" data-registry-index="${index}" aria-label="Excluir ${escapeHtml(item)}">×</button></span></li>`;
  }).join("") : `<li class="registry-empty">Nenhum cadastro criado.</li>`;
  $("#type-registry-list").innerHTML = renderList(expenseTypes, "type");
  $("#taker-registry-list").innerHTML = renderList(takers, "taker");
  $("#location-registry-list").innerHTML = renderList(locations, "location");
  $("#creditor-registry-list").innerHTML = renderList(creditors, "creditor");
  $("#income-source-registry-list").innerHTML = renderList(incomeSources, "incomeSource");
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

function showFeedback(message) {
  $("#feedback").textContent = message;
  $("#feedback").classList.add("visible");
  setTimeout(() => $("#feedback").classList.remove("visible"), 2400);
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
  transactions = upsertEntry(transactions, item);
  save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); $("#transaction-dialog").close(); showFeedback(id ? "Despesa atualizada." : "Despesa adicionada."); }).catch(() => showFeedback("Não foi possível salvar a despesa."));
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
  incomes = upsertEntry(incomes, item);
  save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); $("#income-dialog").close(); showFeedback(id ? "Receita atualizada." : "Receita adicionada."); }).catch((error) => { console.error(error); showFeedback("Não foi possível salvar a receita."); });
});
function renderLocationOptions() {
  const selected = $("#location-options").dataset.value || "Casa";
  $("#location-options").innerHTML = locations.map((location) => `<button type="button" class="location-option${location === selected ? " selected" : ""}" role="radio" aria-checked="${location === selected}" data-location="${escapeHtml(location)}"><span class="location-radio" aria-hidden="true"></span>${escapeHtml(location)}</button>`).join("");
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
$("#add-location").addEventListener("click", () => addCatalogItem("location"));
$("#add-creditor").addEventListener("click", () => addCatalogItem("creditor"));
$("#add-income-source").addEventListener("click", () => addCatalogItem("incomeSource"));
function addCatalogItem(kind) {
  const definition = registryDefinition(kind);
  const label = definition.label;
  const value = prompt(`Nome do ${label}:`)?.trim();
  if (!value) return;
  const list = { type: expenseTypes, taker: takers, location: locations, creditor: creditors, incomeSource: incomeSources }[kind];
  if (hasRegistryName(list, value)) return showFeedback(`${label[0].toUpperCase() + label.slice(1)} já cadastrado.`);
  list.push(value);
  save().then(() => { setupFormOptions(); renderRegistries(); showFeedback(`${label[0].toUpperCase() + label.slice(1)} cadastrado.`); }).catch(() => showFeedback("Não foi possível salvar o cadastro."));
}
$("#registry-lists").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-registry], [data-delete-registry]");
  if (!button) return;
  const kind = button.dataset.editRegistry || button.dataset.deleteRegistry;
  const list = { type: expenseTypes, taker: takers, location: locations, creditor: creditors, incomeSource: incomeSources }[kind];
  const definition = registryDefinition(kind);
  const index = Number(button.dataset.registryIndex);
  const current = list[index];
  if (button.dataset.editRegistry) {
    const value = prompt(`Editar ${definition.label}:`, current)?.trim();
    if (!value || value === current) return;
    if (hasRegistryName(list, value, index)) return showFeedback("Já existe um cadastro com esse nome.");
    const updated = renameRegistry(kind, current, value, { transactions, incomes, expenseTypes, takers, locations, creditors, incomeSources });
    ({ transactions, incomes, expenseTypes, takers, locations, creditors, incomeSources } = updated);
    save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); showFeedback("Cadastro atualizado."); }).catch(() => showFeedback("Não foi possível atualizar o cadastro."));
    return;
  }
  if (!canDeleteRegistry(kind, current, { transactions, incomes })) return showFeedback("Este cadastro está vinculado a lançamentos e não pode ser excluído.");
  if (list.length === 1) return showFeedback("Mantenha pelo menos um cadastro disponível.");
  if (!confirm(`Excluir "${current}"?`)) return;
  list.splice(index, 1);
  save().then(() => { setupFormOptions(); renderRegistries(); showFeedback("Cadastro excluído."); }).catch(() => showFeedback("Não foi possível excluir o cadastro."));
});
$("#export-button").addEventListener("click", () => { const blob = new Blob([JSON.stringify([...transactions, ...incomes], null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "clareza-transacoes.json"; link.click(); URL.revokeObjectURL(link.href); showFeedback("Dados exportados."); });

const pages = ["resumo", "lancamentos", "relatorios", "cadastros"];
function renderPage() {
  const page = pages.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : "resumo";
  document.querySelectorAll("[data-page]").forEach((section) => { section.hidden = section.dataset.page !== page; });
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${page}`));
  if (window.location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);
}
window.addEventListener("hashchange", renderPage);

renderPage();
loadData().then(() => { transactions = transactions.map((item) => ({ ...item, expenseType: item.expenseType || item.category || "Outros", taker: item.taker || "Pessoal", location: item.location || "Casa", creditor: item.creditor || "Caixa" })); $("#today-label").textContent = todayLabel(); setupFormOptions(); render(); renderReports(); renderRegistries(); renderPage(); }).catch(() => { showFeedback("Não foi possível carregar os dados iniciais."); });
