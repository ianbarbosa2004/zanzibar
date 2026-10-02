const categories = ["Salário", "Extra", "Moradia", "Alimentação", "Contas", "Transporte", "Lazer", "Saúde", "Educação", "Outros"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const API_URL = new URL("api/data", document.baseURI).pathname;
let transactions = [];
let balanceVisible = true;
let goal = 1000;

const $ = (selector) => document.querySelector(selector);
const formatMoney = (value) => money.format(value).replace(/\u00a0/g, " ");
const currentMonth = () => new Date().toISOString().slice(0, 7);
const selectedMonth = () => $("#month-filter").value || currentMonth();

async function loadData() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("API indisponível.");
    const data = await response.json();
    transactions = data.transactions;
    goal = data.settings.goal;
    return;
  } catch {
    const savedTransactions = localStorage.getItem("clareza-transactions");
    const savedGoal = localStorage.getItem("clareza-goal");
    if (savedTransactions) {
      transactions = JSON.parse(savedTransactions);
      goal = Number(savedGoal) || 1000;
      return;
    }
    const response = await fetch("./data.json");
    transactions = await response.json();
  }
}

async function save() {
  const payload = JSON.stringify({ transactions, settings: { goal } });
  localStorage.setItem("clareza-transactions", JSON.stringify(transactions));
  localStorage.setItem("clareza-goal", String(goal));
  try {
    const response = await fetch(API_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload });
    if (!response.ok) throw new Error("API indisponível.");
  } catch {
    // GitHub Pages não possui uma API de escrita; neste caso, os dados ficam no navegador.
  }
}

function setupFormOptions() {
  $("#category").innerHTML = categories.map((category) => `<option>${category}</option>`).join("");
  const availableMonths = [...new Set([currentMonth(), ...transactions.map((item) => item.date.slice(0, 7))])].sort().reverse();
  $("#month-filter").innerHTML = availableMonths.map((month) => `<option value="${month}">${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-15`))}</option>`).join("");
  $("#month-filter").value = currentMonth();
  const categoryOptions = [...new Set(transactions.map((item) => item.category))].sort();
  $("#category-filter").innerHTML = `<option value="all">Todas as categorias</option>${categoryOptions.map((category) => `<option>${category}</option>`).join("")}`;
}

function monthTransactions() {
  return transactions.filter((item) => item.date.startsWith(selectedMonth()));
}

function renderSummary() {
  const monthItems = monthTransactions();
  const income = monthItems.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = monthItems.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  $("#balance-value").textContent = balanceVisible ? formatMoney(income - expense) : "••••••";
  $("#income-value").textContent = balanceVisible ? formatMoney(income) : "••••••";
  $("#expense-value").textContent = balanceVisible ? formatMoney(expense) : "••••••";
  $("#balance-caption").textContent = `Saldo de ${new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(`${selectedMonth()}-15`))}`;
  $("#goal-value").textContent = formatMoney(Math.min(income, goal));
  const progress = income ? Math.min(100, (income / goal) * 100) : 0;
  $("#goal-progress").style.width = `${progress}%`;
  $("#goal-caption").textContent = income ? `${Math.round(progress)}% da meta alcançada neste mês.` : "Adicione uma entrada para acompanhar sua meta.";
}

function renderChart() {
  const items = monthTransactions();
  const days = [...new Set(items.map((item) => item.date.slice(8, 10)))].sort();
  const chartDays = days.length ? days.slice(-7) : ["01", "05", "10", "15", "20", "25", "30"];
  const max = Math.max(...chartDays.map((day) => Math.max(...items.filter((item) => item.date.slice(8, 10) === day).map((item) => item.amount), 0)), 100);
  $("#chart").innerHTML = chartDays.map((day) => {
    const dayItems = items.filter((item) => item.date.slice(8, 10) === day);
    const income = dayItems.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
    const expense = dayItems.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
    return `<div class="chart-column"><div class="bars"><i class="bar income-bar" style="height:${Math.max(3, income / max * 100)}%" title="${formatMoney(income)}"></i><i class="bar expense-bar" style="height:${Math.max(3, expense / max * 100)}%" title="${formatMoney(expense)}"></i></div><small>${day}</small></div>`;
  }).join("");
}

function renderTransactions() {
  const query = $("#search-input").value.toLowerCase().trim();
  const type = $("#type-filter").value;
  const category = $("#category-filter").value;
  const filtered = transactions.filter((item) => {
    const matchesSearch = `${item.description} ${item.category}`.toLowerCase().includes(query);
    return matchesSearch && (type === "all" || item.type === type) && (category === "all" || item.category === category);
  }).sort((a, b) => b.date.localeCompare(a.date));
  $("#transactions-list").innerHTML = filtered.map((item) => `<tr>
    <td><div class="transaction-description"><span class="transaction-icon ${item.type}">${item.type === "income" ? "↗" : "↘"}</span>${escapeHtml(item.description)}</div></td>
    <td><span class="tag">${escapeHtml(item.category)}</span></td><td>${dateFormat.format(new Date(`${item.date}T12:00:00`))}</td>
    <td>${item.type === "income" ? "Entrada" : "Saída"}</td><td class="align-right ${item.type}-text">${item.type === "income" ? "+" : "-"} ${formatMoney(item.amount)}</td>
    <td class="align-right"><button class="action-button" data-edit="${item.id}" aria-label="Editar ${escapeHtml(item.description)}">•••</button></td></tr>`).join("");
  $("#empty-state").hidden = filtered.length > 0;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function render() { renderSummary(); renderChart(); renderTransactions(); }

function openDialog(item) {
  $("#dialog-title").textContent = item ? "Editar transação" : "Nova transação";
  $("#transaction-id").value = item?.id || "";
  $("#description").value = item?.description || "";
  $("#amount").value = item?.amount || "";
  $("#transaction-type").value = item?.type || "expense";
  $("#category").value = item?.category || "Outros";
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
  const item = { id: id || crypto.randomUUID(), description: $("#description").value.trim(), amount: Number($("#amount").value), type: $("#transaction-type").value, category: $("#category").value, date: $("#date").value };
  transactions = id ? transactions.map((entry) => entry.id === id ? item : entry) : [item, ...transactions];
  save().then(() => { setupFormOptions(); render(); $("#transaction-dialog").close(); showFeedback(id ? "Transação atualizada." : "Transação adicionada."); }).catch(() => showFeedback("Não foi possível salvar a transação."));
});
$("#transactions-list").addEventListener("click", (event) => { const button = event.target.closest("[data-edit]"); if (button) openDialog(transactions.find((item) => item.id === button.dataset.edit)); });
$("#new-transaction").addEventListener("click", () => openDialog());
$("#close-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#cancel-dialog").addEventListener("click", () => $("#transaction-dialog").close());
$("#toggle-balance").addEventListener("click", () => { balanceVisible = !balanceVisible; $("#toggle-balance").textContent = balanceVisible ? "◉" : "◎"; renderSummary(); });
$("#month-filter").addEventListener("change", render);
["search-input", "type-filter", "category-filter"].forEach((id) => $(`#${id}`).addEventListener("input", renderTransactions));
$("#goal-button").addEventListener("click", () => { const value = prompt("Qual é sua nova meta mensal?", goal); if (value && Number(value) > 0) { const previous = goal; goal = Number(value); save().then(() => { renderSummary(); showFeedback("Meta atualizada."); }).catch(() => { goal = previous; showFeedback("Não foi possível salvar a meta."); }); } });
$("#export-button").addEventListener("click", () => { const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "clareza-transacoes.json"; link.click(); URL.revokeObjectURL(link.href); showFeedback("Dados exportados."); });

loadData().then(() => { setupFormOptions(); render(); }).catch(() => { showFeedback("Não foi possível carregar os dados iniciais."); });
