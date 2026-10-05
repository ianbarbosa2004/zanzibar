const defaultExpenseTypes = ["Moradia", "Alimentação", "Contas", "Transporte", "Lazer", "Saúde", "Educação", "Outros"];
const defaultTakers = ["Pessoal", "Zanzibar"];
const defaultLocations = ["Casa", "Zanzibar"];
const defaultCreditors = ["Caixa"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatTransactionDate = (value) => {
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};
const API_URL = new URL("api/data", document.baseURI).pathname;
let transactions = [];
let balanceVisible = true;
let expenseTypes = [...defaultExpenseTypes];
let takers = [...defaultTakers];
let locations = [...defaultLocations];
let creditors = [...defaultCreditors];
const paginationState = {
  Casa: { page: 1, pageSize: 5 },
  Zanzibar: { page: 1, pageSize: 5 },
};

const $ = (selector) => document.querySelector(selector);
const formatMoney = (value) => money.format(value).replace(/\u00a0/g, " ");
const currentMonth = () => localDate().slice(0, 7);
const selectedMonth = () => $("#month-filter").value || currentMonth();
const todayLabel = () => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
const localDate = () => {
  const now = new Date();
  const utcMinusThree = -180;
  const offset = utcMinusThree - now.getTimezoneOffset();
  return new Date(now.getTime() + offset * 60000).toISOString().slice(0, 10);
};
const formatInputAmount = (value) => formatMoney(Number(value) || 0);
const parseInputAmount = (value) => {
  const digits = String(value).replace(/\D/g, "");
  return Number(digits) / 100;
};

async function loadData() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("API indisponível.");
    const data = await response.json();
    transactions = data.transactions.map((item) => ({ ...item, type: "expense" }));
    expenseTypes = data.settings.expenseTypes?.length ? data.settings.expenseTypes : [...defaultExpenseTypes];
    takers = data.settings.takers?.length ? data.settings.takers : [...defaultTakers];
    locations = data.settings.locations?.length ? data.settings.locations : [...defaultLocations];
    creditors = data.settings.creditors?.length ? data.settings.creditors : [...defaultCreditors];
    return;
  } catch {
    const savedTransactions = localStorage.getItem("clareza-transactions");
    if (savedTransactions) {
      transactions = JSON.parse(savedTransactions).map((item) => ({ ...item, type: "expense" }));
      expenseTypes = JSON.parse(localStorage.getItem("clareza-expense-types") || "null") || [...defaultExpenseTypes];
      takers = JSON.parse(localStorage.getItem("clareza-takers") || "null") || [...defaultTakers];
      locations = JSON.parse(localStorage.getItem("clareza-locations") || "null") || [...defaultLocations];
      creditors = JSON.parse(localStorage.getItem("clareza-creditors") || "null") || [...defaultCreditors];
      return;
    }
    const response = await fetch("./data.json");
    transactions = (await response.json()).map((item) => ({ ...item, type: "expense" }));
  }
}

async function save() {
  const payload = JSON.stringify({ transactions, settings: { expenseTypes, takers, locations, creditors } });
  localStorage.setItem("clareza-transactions", JSON.stringify(transactions));
  localStorage.setItem("clareza-expense-types", JSON.stringify(expenseTypes));
  localStorage.setItem("clareza-takers", JSON.stringify(takers));
  localStorage.setItem("clareza-locations", JSON.stringify(locations));
  localStorage.setItem("clareza-creditors", JSON.stringify(creditors));
  try {
    const response = await fetch(API_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload });
    if (!response.ok) throw new Error("API indisponível.");
  } catch {
    // GitHub Pages não possui uma API de escrita; neste caso, os dados ficam no navegador.
  }
}

function setupFormOptions() {
  if (!takers.some((taker) => taker.toLowerCase() === "zanzibar")) takers.push("Zanzibar");
  expenseTypes.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  takers.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  locations.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  creditors.sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  $("#expense-type").innerHTML = expenseTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("");
  $("#taker").innerHTML = takers.map((taker) => `<option>${escapeHtml(taker)}</option>`).join("");
  $("#creditor").innerHTML = creditors.map((creditor) => `<option>${escapeHtml(creditor)}</option>`).join("");
  renderLocationOptions();
  const availableMonths = [...new Set([currentMonth(), ...transactions.map((item) => item.date.slice(0, 7))])].sort().reverse();
  $("#month-filter").innerHTML = availableMonths.map((month) => `<option value="${month}">${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-15`))}</option>`).join("");
  $("#month-filter").value = currentMonth();
  document.querySelectorAll("[data-type-filter]").forEach((filter) => {
    filter.innerHTML = `<option value="all">Todos os tipos</option>${expenseTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("")}`;
  });
  document.querySelectorAll("[data-taker-filter]").forEach((filter) => {
    filter.innerHTML = `<option value="all">Todos os tomadores</option>${takers.map((taker) => `<option>${escapeHtml(taker)}</option>`).join("")}`;
  });
  applyLocationRules($("#location-options").dataset.value || "Casa");
}

function monthTransactions() {
  return transactions.filter((item) => item.date.startsWith(selectedMonth()));
}

function renderSummary() {
  const monthItems = monthTransactions();
  const expense = monthItems.reduce((sum, item) => sum + item.amount, 0);
  $("#expense-value").textContent = balanceVisible ? formatMoney(expense) : "••••••";
  $("#expense-caption").textContent = `${monthItems.length} ${monthItems.length === 1 ? "despesa registrada" : "despesas registradas"}`;
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
  const filtered = monthTransactions().filter((item) => {
    const matchesSearch = `${item.description} ${item.expenseType} ${item.taker} ${item.location} ${item.creditor}`.toLowerCase().includes(query);
    return item.location === location && matchesSearch && (type === "all" || item.expenseType === type) && (taker === "all" || item.taker === taker);
  }).sort((a, b) => b.date.localeCompare(a.date));
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const pageItems = filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  panel.querySelector("[data-transactions-list]").innerHTML = pageItems.map((item) => `<tr>
    <td>${escapeHtml(formatTransactionDate(item.date))}</td><td><div class="transaction-description"><span class="transaction-icon expense">↘</span>${escapeHtml(item.description)}</div></td>
    <td><span class="tag">${escapeHtml(item.expenseType)}</span></td><td>${escapeHtml(item.taker)}</td><td>${escapeHtml(item.creditor)}</td>
    <td class="align-right expense-text">- ${formatMoney(item.amount)}</td>
    <td class="align-right"><button class="action-button" data-edit="${item.id}" aria-label="Editar ${escapeHtml(item.description)}">•••</button></td></tr>`).join("");
  panel.querySelector("[data-empty-state]").hidden = filtered.length > 0;
  panel.querySelector("[data-pagination]").hidden = filtered.length <= state.pageSize;
  panel.querySelector("[data-pagination-status]").textContent = `Página ${state.page} de ${totalPages}`;
  panel.querySelector("[data-pagination-prev]").disabled = state.page === 1;
  panel.querySelector("[data-pagination-next]").disabled = state.page === totalPages;
}

function renderTransactions() {
  Object.keys(paginationState).forEach(renderLocationTransactions);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function render() { renderSummary(); renderChart(); renderTransactions(); }

function renderReports() {
  const items = monthTransactions();
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const group = (key) => Object.entries(items.reduce((result, item) => {
    const label = item[key] || "Sem cadastro";
    result[label] = (result[label] || 0) + item.amount;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
  const rows = (entries) => entries.length ? entries.map(([label, value]) => `<div class="report-row"><span>${escapeHtml(label)}</span><strong>${formatMoney(value)}</strong><i><b style="width:${total ? value / total * 100 : 0}%"></b></i></div>`).join("") : `<p class="muted">Nenhuma despesa neste período.</p>`;
  $("#daily-report").innerHTML = rows(Object.entries(items.reduce((result, item) => { result[item.date] = (result[item.date] || 0) + item.amount; return result; }, {})).sort((a, b) => b[0].localeCompare(a[0])).map(([date, value]) => [dateFormat.format(new Date(`${date}T12:00:00`)), value]));
  $("#type-report").innerHTML = rows(group("expenseType"));
  $("#taker-report").innerHTML = rows(group("taker"));
  $("#report-total").textContent = formatMoney(total);
}

function renderRegistries() {
  const renderList = (items, kind) => items.length ? items.map((item, index) => {
    const property = { type: "expenseType", taker: "taker", location: "location", creditor: "creditor" }[kind];
    const count = transactions.filter((transaction) => transaction[property] === item).length;
    return `<li><span>${escapeHtml(item)} <small>${count} ${count === 1 ? "despesa" : "despesas"}</small></span><span class="registry-actions"><button type="button" class="registry-action" data-edit-registry="${kind}" data-registry-index="${index}" aria-label="Editar ${escapeHtml(item)}">✎</button><button type="button" class="registry-action danger" data-delete-registry="${kind}" data-registry-index="${index}" aria-label="Excluir ${escapeHtml(item)}">×</button></span></li>`;
  }).join("") : `<li class="registry-empty">Nenhum cadastro criado.</li>`;
  $("#type-registry-list").innerHTML = renderList(expenseTypes, "type");
  $("#taker-registry-list").innerHTML = renderList(takers, "taker");
  $("#location-registry-list").innerHTML = renderList(locations, "location");
  $("#creditor-registry-list").innerHTML = renderList(creditors, "creditor");
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
  const item = { id: id || crypto.randomUUID(), description: $("#description").value.trim(), amount, type: "expense", expenseType: $("#expense-type").value, taker: $("#taker").value, location: $("#location-options").dataset.value || "Casa", creditor: $("#creditor").value, date: $("#date").value };
  transactions = id ? transactions.map((entry) => entry.id === id ? item : entry) : [item, ...transactions];
  save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); $("#transaction-dialog").close(); showFeedback(id ? "Despesa atualizada." : "Despesa adicionada."); }).catch(() => showFeedback("Não foi possível salvar a despesa."));
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
$("#quick-new-transaction").addEventListener("click", () => openDialog());
$("#close-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#cancel-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#amount").addEventListener("input", (event) => {
  const amount = parseInputAmount(event.target.value);
  event.target.value = amount ? formatInputAmount(amount) : "";
});
$("#toggle-balance").addEventListener("click", () => { balanceVisible = !balanceVisible; $("#toggle-balance").textContent = balanceVisible ? "◉" : "◎"; renderSummary(); });
$("#month-filter").addEventListener("change", render);
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
$("#month-filter").addEventListener("change", () => { render(); renderReports(); });
$("#add-type").addEventListener("click", () => addCatalogItem("type"));
$("#add-taker").addEventListener("click", () => addCatalogItem("taker"));
$("#add-location").addEventListener("click", () => addCatalogItem("location"));
$("#add-creditor").addEventListener("click", () => addCatalogItem("creditor"));
function addCatalogItem(kind) {
  const label = { type: "tipo de despesa", taker: "tomador", location: "local", creditor: "credor" }[kind];
  const value = prompt(`Nome do ${label}:`)?.trim();
  if (!value) return;
  const list = { type: expenseTypes, taker: takers, location: locations, creditor: creditors }[kind];
  if (list.some((item) => item.toLowerCase() === value.toLowerCase())) return showFeedback(`${label[0].toUpperCase() + label.slice(1)} já cadastrado.`);
  list.push(value);
  save().then(() => { setupFormOptions(); renderRegistries(); showFeedback(`${label[0].toUpperCase() + label.slice(1)} cadastrado.`); }).catch(() => showFeedback("Não foi possível salvar o cadastro."));
}
$("#registry-lists").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-registry], [data-delete-registry]");
  if (!button) return;
  const kind = button.dataset.editRegistry || button.dataset.deleteRegistry;
  const list = { type: expenseTypes, taker: takers, location: locations, creditor: creditors }[kind];
  const index = Number(button.dataset.registryIndex);
  const current = list[index];
  if (button.dataset.editRegistry) {
    const registryLabel = { type: "tipo de despesa", taker: "tomador", location: "local", creditor: "credor" }[kind];
    const value = prompt(`Editar ${registryLabel}:`, current)?.trim();
    if (!value || value === current) return;
    if (list.some((item, itemIndex) => itemIndex !== index && item.toLowerCase() === value.toLowerCase())) return showFeedback("Já existe um cadastro com esse nome.");
    const property = { type: "expenseType", taker: "taker", location: "location", creditor: "creditor" }[kind];
    transactions = transactions.map((item) => item[property] === current ? { ...item, [property]: value } : item);
    list[index] = value;
    save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); showFeedback("Cadastro atualizado."); }).catch(() => showFeedback("Não foi possível atualizar o cadastro."));
    return;
  }
  const property = { type: "expenseType", taker: "taker", location: "location", creditor: "creditor" }[kind];
  if (transactions.some((item) => item[property] === current)) return showFeedback("Este cadastro está vinculado a despesas e não pode ser excluído.");
  if (list.length === 1) return showFeedback("Mantenha pelo menos um cadastro disponível.");
  if (!confirm(`Excluir "${current}"?`)) return;
  list.splice(index, 1);
  save().then(() => { setupFormOptions(); renderRegistries(); showFeedback("Cadastro excluído."); }).catch(() => showFeedback("Não foi possível excluir o cadastro."));
});
$("#export-button").addEventListener("click", () => { const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "clareza-transacoes.json"; link.click(); URL.revokeObjectURL(link.href); showFeedback("Dados exportados."); });

loadData().then(() => { transactions = transactions.map((item) => ({ ...item, expenseType: item.expenseType || item.category || "Outros", taker: item.taker || "Pessoal", location: item.location || "Casa", creditor: item.creditor || "Caixa" })); $("#today-label").textContent = todayLabel(); setupFormOptions(); render(); renderReports(); renderRegistries(); }).catch(() => { showFeedback("Não foi possível carregar os dados iniciais."); });
