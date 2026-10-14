import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createHttpServer } from "../../src/server/http-server.js";

function makeServer(overrides = {}) {
  return createHttpServer({
    basePath: "/clareza",
    auth: { current: async () => ({ id: "u1", role: "user" }) },
    readData: async () => ({
      transactions: [
        { id: "general-expense", date: "2026-05-02", type: "expense", amount: 25, expenseType: "Casa", location: "Casa" },
        { id: "buffet-expense", date: "2026-05-03", type: "expense", amount: 80, expenseType: "Evento", location: "Buffet" },
      ],
      incomes: [{ id: "buffet-income", date: "2026-05-04", type: "income", amount: 120, source: "Buffet", product: "Buffet" }],
      settings: {},
    }),
    analyzeFinancialInsights: async ({ month, scope, withAi }) => ({
      period: month,
      scope,
      totals: { income: 0, expense: 0, balance: 0, count: 0 },
      ...(withAi ? { ai: { enabled: true, summary: "Resumo", insights: [], recommendations: [], disclaimer: "Informativo." } } : {}),
    }),
    saveFinancialInsightHistory: async ({ userId, period, scope, indicators, aiResult }) => ({ id: 1, userId, period, scope, indicators, ai: aiResult }),
    readFinancialInsightHistory: async (userId) => [{ id: 1, userId, period: "2026-05", scope: "general", indicators: {}, ai: null }],
    writeCashClosing: async () => {},
    writeMonthlyCashClosings: async () => {},
    writeTransaction: async () => {},
    writeLimit: async () => {},
    writeCatalog: async () => {},
    writeBillings: async () => [],
    readStaticFile: async () => null,
    logger: { error: () => {} },
    ...overrides,
  });
}

test("rota protegida retorna indicadores com período explícito", async (t) => {
  const server = makeServer({
    analyzeFinancialInsights: async ({ data, month, scope }) => {
      const general = data.transactions.filter((item) => item.location !== "Buffet");
      return { period: month, scope, totals: { income: 0, expense: general.reduce((sum, item) => sum + item.amount, 0), balance: -25, count: general.length } };
    },
  });
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const response = await fetch(`http://localhost:${server.address().port}/clareza/api/financial-insights?month=2026-05&scope=general`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.period, "2026-05");
  assert.equal(payload.totals.expense, 25);
});

test("rota rejeita requisição sem autenticação", async (t) => {
  const server = makeServer({ auth: { current: async () => null } });
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const response = await fetch(`http://localhost:${server.address().port}/clareza/api/financial-insights?month=2026-05`);
  assert.equal(response.status, 401);
});

test("POST solicita IA somente quando withAi é explicitamente verdadeiro", async (t) => {
  const server = makeServer();
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const response = await fetch(`http://localhost:${server.address().port}/clareza/api/financial-insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month: "2026-05", scope: "general", withAi: true }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ai.enabled, true);
});

test("POST salva histórico explicitamente e GET lista somente o usuário autenticado", async (t) => {
  const server = makeServer();
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const port = server.address().port;
  const saved = await fetch(`http://localhost:${port}/clareza/api/financial-insights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month: "2026-05", scope: "general", saveHistory: true }),
  });
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).history.userId, "u1");
  const history = await fetch(`http://localhost:${port}/clareza/api/financial-insights/history`);
  assert.equal(history.status, 200);
  assert.equal((await history.json()).history[0].userId, "u1");
});

test("rota rejeita período ausente ou inválido", async (t) => {
  const server = makeServer({
    analyzeFinancialInsights: async () => {
      const error = new Error("Informe um período no formato YYYY-MM.");
      error.statusCode = 400;
      throw error;
    },
  });
  t.after(() => server.close());
  server.listen(0);
  await once(server, "listening");
  const response = await fetch(`http://localhost:${server.address().port}/clareza/api/financial-insights?month=maio`);
  assert.equal(response.status, 400);
});
