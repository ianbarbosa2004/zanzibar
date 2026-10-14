import { aiApiKey, aiEnabled, aiMaxOutputTokens, aiMaxPayloadBytes, aiModel, aiTimeoutMs } from "../config.js";
import { financialAdvisorPromptVersion, financialAdvisorSystemPrompt } from "./prompts.js";

const allowedLevels = new Set(["low", "medium", "high"]);
const cleanText = (value, limit) => String(value).replace(/<[^>]*>/g, "").trim().slice(0, limit);

function safeInsights(insights) {
  return {
    period: insights.period,
    previousPeriod: insights.previousPeriod,
    scope: insights.scope,
    totals: insights.totals,
    previousTotals: insights.previousTotals,
    variations: insights.variations,
    concentration: insights.concentration,
    recurrence: insights.recurrence.map(({ label, type, count, total }) => ({ label, type, count, total })),
    anomalies: insights.anomalies.map(({ date, type, amount }) => ({ date, type, amount })),
    busiestDays: insights.busiestDays,
  };
}

function parseProviderResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("O provedor não retornou conteúdo textual.");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("O provedor retornou JSON inválido.");
  }
}

function validateResponse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A resposta da IA tem formato inválido.");
  if (typeof value.summary !== "string" || typeof value.disclaimer !== "string" || !Array.isArray(value.insights) || !Array.isArray(value.recommendations)) {
    throw new Error("A resposta da IA não atende ao schema esperado.");
  }
  const insights = value.insights.slice(0, 8).map((item) => {
    if (!item || typeof item.title !== "string" || typeof item.description !== "string" || !allowedLevels.has(item.severity) || !Array.isArray(item.evidence)) {
      throw new Error("Um insight da IA tem formato inválido.");
    }
    return { title: cleanText(item.title, 160), description: cleanText(item.description, 600), severity: item.severity, evidence: item.evidence.slice(0, 8).map((evidence) => cleanText(evidence, 120)) };
  });
  const recommendations = value.recommendations.slice(0, 8).map((item) => {
    if (!item || typeof item.title !== "string" || typeof item.description !== "string" || !allowedLevels.has(item.priority) || typeof item.action !== "string") {
      throw new Error("Uma recomendação da IA tem formato inválido.");
    }
    return { title: cleanText(item.title, 160), description: cleanText(item.description, 600), priority: item.priority, action: cleanText(item.action, 100) };
  });
  return { summary: cleanText(value.summary, 1200), insights, recommendations, disclaimer: cleanText(value.disclaimer, 800) };
}

export function createFinancialAdvisor({ fetchImpl = fetch, enabled = aiEnabled, apiKey = aiApiKey, model = aiModel, timeoutMs = aiTimeoutMs, maxOutputTokens = aiMaxOutputTokens, maxPayloadBytes = aiMaxPayloadBytes, logger = console } = {}) {
  return {
    enabled: Boolean(enabled && apiKey),
    promptVersion: financialAdvisorPromptVersion,
    async analyze(insights) {
      if (!enabled || !apiKey) return { enabled: false, promptVersion: financialAdvisorPromptVersion, message: "A análise por IA está desabilitada. Os indicadores determinísticos continuam disponíveis." };
      const analysis = JSON.stringify({ promptVersion: financialAdvisorPromptVersion, indicators: safeInsights(insights) });
      if (Buffer.byteLength(analysis, "utf8") > maxPayloadBytes) throw new Error("O payload da análise excede o limite configurado.");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: maxOutputTokens,
            messages: [{ role: "system", content: financialAdvisorSystemPrompt }, { role: "user", content: analysis }],
          }),
          signal: controller.signal,
        });
        if (response.status === 429) {
          const error = new Error("O provedor de IA atingiu o limite de requisições.");
          error.statusCode = 429;
          throw error;
        }
        if (!response.ok) {
          const error = new Error(`O provedor de IA retornou HTTP ${response.status}.`);
          error.statusCode = 502;
          throw error;
        }
        return { enabled: true, promptVersion: financialAdvisorPromptVersion, ...validateResponse(parseProviderResponse(await response.json())) };
      } catch (error) {
        if (error.name === "AbortError") {
          const timeoutError = new Error("A análise por IA excedeu o tempo limite.");
          timeoutError.statusCode = 504;
          throw timeoutError;
        }
        if (!error.statusCode) error.statusCode = 502;
        logger.error("Falha na análise financeira por IA.", { message: error.message });
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
