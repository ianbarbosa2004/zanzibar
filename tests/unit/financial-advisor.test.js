import assert from "node:assert/strict";
import test from "node:test";
import { createFinancialAdvisor } from "../../src/server/ai/financial-advisor.js";

const insights = {
  period: "2026-05",
  previousPeriod: "2026-04",
  scope: "general",
  totals: { income: 300, expense: 140, balance: 160, count: 3 },
  previousTotals: { income: 250, expense: 100, balance: 150, count: 2 },
  variations: { incomePercent: 20, expensePercent: 40, balancePercent: 6.67 },
  concentration: { expensesByCategory: [{ label: "Casa", amount: 100 }], expensesByLocation: [], incomeBySource: [] },
  recurrence: [{ label: "Mercado", type: "expense", count: 2, total: 40 }],
  anomalies: [{ date: "2026-05-02", type: "expense", amount: 100 }],
  busiestDays: [{ date: "2026-05-02", amount: 100 }],
};

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const valid = { summary: "Resumo", insights: [{ title: "Tendência", description: "Observe", severity: "medium", evidence: ["variations.expensePercent"] }], recommendations: [{ title: "Revisar", description: "Avalie", priority: "high", action: "review" }], disclaimer: "Informativo." };

test("não chama o provedor quando a IA está desabilitada", async () => {
  let called = false;
  const advisor = createFinancialAdvisor({ enabled: false, apiKey: "", fetchImpl: async () => { called = true; } });
  const result = await advisor.analyze(insights);
  assert.equal(result.enabled, false);
  assert.equal(called, false);
});

test("envia somente indicadores agregados e valida resposta estruturada", async () => {
  let request;
  const advisor = createFinancialAdvisor({
    enabled: true,
    apiKey: "secret",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ choices: [{ message: { content: JSON.stringify(valid) } }] });
    },
  });
  const result = await advisor.analyze(insights);
  const body = JSON.parse(request.options.body);
  assert.equal(result.summary, "Resumo");
  assert.equal(body.messages[1].content.includes("description"), false);
  assert.equal(body.messages[1].content.includes("secret"), false);
  assert.equal(request.options.headers.Authorization, "Bearer secret");
});

test("rejeita schema inválido, rate limit e timeout", async () => {
  const invalid = createFinancialAdvisor({ enabled: true, apiKey: "secret", fetchImpl: async () => response({ choices: [{ message: { content: "{}" } }] }), logger: { error: () => {} } });
  await assert.rejects(() => invalid.analyze(insights), /schema esperado/);
  const limited = createFinancialAdvisor({ enabled: true, apiKey: "secret", fetchImpl: async () => response({}, 429), logger: { error: () => {} } });
  await assert.rejects(() => limited.analyze(insights), /limite de requisições/);
  const timeout = createFinancialAdvisor({ enabled: true, apiKey: "secret", timeoutMs: 5, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); })), logger: { error: () => {} } });
  await assert.rejects(() => timeout.analyze(insights), /tempo limite/);
});

test("remove HTML de textos retornados pelo provedor", async () => {
  const advisor = createFinancialAdvisor({
    enabled: true,
    apiKey: "secret",
    fetchImpl: async () => response({ choices: [{ message: { content: JSON.stringify({
      summary: "<b>Resumo</b>",
      insights: [{ title: "<i>Tendência</i>", description: "<script>alert(1)</script>Observe", severity: "low", evidence: ["<b>total</b>"] }],
      recommendations: [{ title: "Revisar", description: "Avalie", priority: "low", action: "<run>review</run>" }],
      disclaimer: "<p>Informativo.</p>",
    }) } }] }),
  });
  const result = await advisor.analyze(insights);
  assert.equal(result.summary, "Resumo");
  assert.equal(result.insights[0].description, "alert(1)Observe");
  assert.equal(result.recommendations[0].action, "review");
});
