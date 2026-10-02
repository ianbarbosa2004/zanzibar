const defaultExpenseTypes = ["Moradia", "Alimentação", "Contas", "Transporte", "Lazer", "Saúde", "Educação", "Outros"];
const defaultTakers = ["Pessoal"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const API_URL = new URL("api/data", document.baseURI).pathname;
let transactions = [];
let balanceVisible = true;
let expenseTypes = [...defaultExpenseTypes];
let takers = [...defaultTakers];

const $ = (selector) => document.querySelector(selector);
const formatMoney = (value) => money.format(value).replace(/\u00a0/g, " ");
const currentMonth = () => new Date().toISOString().slice(0, 7);
const selectedMonth = () => $("#month-filter").value || currentMonth();
const todayLabel = () => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());

async function loadData() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("API indisponível.");
    const data = await response.json();
    transactions = data.transactions.map((item) => ({ ...item, type: "expense" }));
    expenseTypes = data.settings.expenseTypes?.length ? data.settings.expenseTypes : [...defaultExpenseTypes];
    takers = data.settings.takers?.length ? data.settings.takers : [...defaultTakers];
    return;
  } catch {
    const savedTransactions = localStorage.getItem("clareza-transactions");
    if (savedTransactions) {
      transactions = JSON.parse(savedTransactions).map((item) => ({ ...item, type: "expense" }));
      expenseTypes = JSON.parse(localStorage.getItem("clareza-expense-types") || "null") || [...defaultExpenseTypes];
      takers = JSON.parse(localStorage.getItem("clareza-takers") || "null") || [...defaultTakers];
      return;
    }
    const response = await fetch("./data.json");
    transactions = (await response.json()).map((item) => ({ ...item, type: "expense" }));
  }
}

async function save() {
  const payload = JSON.stringify({ transactions, settings: { expenseTypes, takers } });
  localStorage.setItem("clareza-transactions", JSON.stringify(transactions));
  localStorage.setItem("clareza-expense-types", JSON.stringify(expenseTypes));
  localStorage.setItem("clareza-takers", JSON.stringify(takers));
  try {
    const response = await fetch(API_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload });
    if (!response.ok) throw new Error("API indisponível.");
  } catch {
    // GitHub Pages não possui uma API de escrita; neste caso, os dados ficam no navegador.
  }
}

function setupFormOptions() {
  $("#expense-type").innerHTML = expenseTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("");
  $("#taker").innerHTML = takers.map((taker) => `<option>${escapeHtml(taker)}</option>`).join("");
  const availableMonths = [...new Set([currentMonth(), ...transactions.map((item) => item.date.slice(0, 7))])].sort().reverse();
  $("#month-filter").innerHTML = availableMonths.map((month) => `<option value="${month}">${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-15`))}</option>`).join("");
  $("#month-filter").value = currentMonth();
  $("#type-filter").innerHTML = `<option value="all">Todos os tipos</option>${expenseTypes.map((type) => `<option>${escapeHtml(type)}</option>`).join("")}`;
  $("#taker-filter").innerHTML = `<option value="all">Todos os tomadores</option>${takers.map((taker) => `<option>${escapeHtml(taker)}</option>`).join("")}`;
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

function renderTransactions() {
  const query = $("#search-input").value.toLowerCase().trim();
  const type = $("#type-filter").value;
  const taker = $("#taker-filter").value;
  const filtered = monthTransactions().filter((item) => {
    const matchesSearch = `${item.description} ${item.expenseType} ${item.taker}`.toLowerCase().includes(query);
    return matchesSearch && (type === "all" || item.expenseType === type) && (taker === "all" || item.taker === taker);
  }).sort((a, b) => b.date.localeCompare(a.date));
  $("#transactions-list").innerHTML = filtered.map((item) => `<tr>
    <td><div class="transaction-description"><span class="transaction-icon expense">↘</span>${escapeHtml(item.description)}</div></td>
    <td><span class="tag">${escapeHtml(item.expenseType)}</span></td><td>${escapeHtml(item.taker)}</td><td>${dateFormat.format(new Date(`${item.date}T12:00:00`))}</td>
    <td class="align-right expense-text">- ${formatMoney(item.amount)}</td>
    <td class="align-right"><button class="action-button" data-edit="${item.id}" aria-label="Editar ${escapeHtml(item.description)}">•••</button></td></tr>`).join("");
  $("#empty-state").hidden = filtered.length > 0;
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
    const count = transactions.filter((transaction) => transaction[kind === "type" ? "expenseType" : "taker"] === item).length;
    return `<li><span>${escapeHtml(item)} <small>${count} ${count === 1 ? "despesa" : "despesas"}</small></span><span class="registry-actions"><button type="button" class="registry-action" data-edit-registry="${kind}" data-registry-index="${index}" aria-label="Editar ${escapeHtml(item)}">✎</button><button type="button" class="registry-action danger" data-delete-registry="${kind}" data-registry-index="${index}" aria-label="Excluir ${escapeHtml(item)}">×</button></span></li>`;
  }).join("") : `<li class="registry-empty">Nenhum cadastro criado.</li>`;
  $("#type-registry-list").innerHTML = renderList(expenseTypes, "type");
  $("#taker-registry-list").innerHTML = renderList(takers, "taker");
}

function openDialog(item) {
  $("#dialog-title").textContent = item ? "Editar despesa" : "Nova despesa";
  $("#transaction-id").value = item?.id || "";
  $("#description").value = item?.description || "";
  $("#amount").value = item?.amount || "";
  $("#expense-type").value = item?.expenseType || expenseTypes[0];
  $("#taker").value = item?.taker || takers[0];
  $("#date").value = item?.date || new Date().toISOString().slice(0, 10);
  $("#transaction-dialog").showModal();
}

function showFeedback(message) {
  $("#feedback").textContent = message;
  $("#feedback").classList.add("visible");
  setTimeout(() => $("#feedback").classList.remove("visible"), 2400);
}

$("#transaction-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#transaction-id").value;
  const item = { id: id || crypto.randomUUID(), description: $("#description").value.trim(), amount: Number($("#amount").value), type: "expense", expenseType: $("#expense-type").value, taker: $("#taker").value, date: $("#date").value };
  transactions = id ? transactions.map((entry) => entry.id === id ? item : entry) : [item, ...transactions];
  save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); $("#transaction-dialog").close(); showFeedback(id ? "Despesa atualizada." : "Despesa adicionada."); }).catch(() => showFeedback("Não foi possível salvar a despesa."));
});
$("#transactions-list").addEventListener("click", (event) => { const button = event.target.closest("[data-edit]"); if (button) openDialog(transactions.find((item) => item.id === button.dataset.edit)); });
$("#new-transaction").addEventListener("click", () => openDialog());
$("#quick-new-transaction").addEventListener("click", () => openDialog());
$("#close-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#cancel-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#toggle-balance").addEventListener("click", () => { balanceVisible = !balanceVisible; $("#toggle-balance").textContent = balanceVisible ? "◉" : "◎"; renderSummary(); });
$("#month-filter").addEventListener("change", render);
["search-input", "type-filter", "taker-filter"].forEach((id) => $(`#${id}`).addEventListener("input", renderTransactions));
$("#month-filter").addEventListener("change", () => { render(); renderReports(); });
$("#add-type").addEventListener("click", () => addCatalogItem("type"));
$("#add-taker").addEventListener("click", () => addCatalogItem("taker"));
function addCatalogItem(kind) {
  const label = kind === "type" ? "tipo de despesa" : "tomador";
  const value = prompt(`Nome do ${label}:`)?.trim();
  if (!value) return;
  const list = kind === "type" ? expenseTypes : takers;
  if (list.some((item) => item.toLowerCase() === value.toLowerCase())) return showFeedback(`${label[0].toUpperCase() + label.slice(1)} já cadastrado.`);
  list.push(value);
  save().then(() => { setupFormOptions(); renderRegistries(); showFeedback(`${label[0].toUpperCase() + label.slice(1)} cadastrado.`); }).catch(() => showFeedback("Não foi possível salvar o cadastro."));
}
$("#registry-lists").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-registry], [data-delete-registry]");
  if (!button) return;
  const kind = button.dataset.editRegistry || button.dataset.deleteRegistry;
  const list = kind === "type" ? expenseTypes : takers;
  const index = Number(button.dataset.registryIndex);
  const current = list[index];
  if (button.dataset.editRegistry) {
    const value = prompt(`Editar ${kind === "type" ? "tipo de despesa" : "tomador"}:`, current)?.trim();
    if (!value || value === current) return;
    if (list.some((item, itemIndex) => itemIndex !== index && item.toLowerCase() === value.toLowerCase())) return showFeedback("Já existe um cadastro com esse nome.");
    const property = kind === "type" ? "expenseType" : "taker";
    transactions = transactions.map((item) => item[property] === current ? { ...item, [property]: value } : item);
    list[index] = value;
    save().then(() => { setupFormOptions(); render(); renderReports(); renderRegistries(); showFeedback("Cadastro atualizado."); }).catch(() => showFeedback("Não foi possível atualizar o cadastro."));
    return;
  }
  if (transactions.some((item) => item[kind === "type" ? "expenseType" : "taker"] === current)) return showFeedback("Este cadastro está vinculado a despesas e não pode ser excluído.");
  if (list.length === 1) return showFeedback("Mantenha pelo menos um cadastro disponível.");
  if (!confirm(`Excluir "${current}"?`)) return;
  list.splice(index, 1);
  save().then(() => { setupFormOptions(); renderRegistries(); showFeedback("Cadastro excluído."); }).catch(() => showFeedback("Não foi possível excluir o cadastro."));
});
$("#export-button").addEventListener("click", () => { const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "clareza-transacoes.json"; link.click(); URL.revokeObjectURL(link.href); showFeedback("Dados exportados."); });

loadData().then(() => { transactions = transactions.map((item) => ({ ...item, expenseType: item.expenseType || item.category || "Outros", taker: item.taker || "Pessoal" })); $("#today-label").textContent = todayLabel(); setupFormOptions(); render(); renderReports(); renderRegistries(); }).catch(() => { showFeedback("Não foi possível carregar os dados iniciais."); });
