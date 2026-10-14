import { aiApiKey, aiEnabled, aiMaxOutputTokens, aiMaxPayloadBytes, aiModel, aiProvider, aiTimeoutMs } from "../config.js";
import { financialAdvisorPromptVersion, financialAdvisorQuestionPrompt, financialAdvisorSystemPrompt } from "./prompts.js";

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

function parseProviderResponse(payload, provider) {
  const content = provider === "gemini"
    ? payload?.candidates?.[0]?.content?.parts?.[0]?.text
    : payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("O provedor não retornou conteúdo textual.");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("O provedor retornou JSON inválido.");
  }
}

function providerRequest({ provider, apiKey, model, systemPrompt, userContent, maxOutputTokens }) {
  if (provider === "gemini") {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens, responseMimeType: "application/json" },
        }),
      },
    };
  }
  return {
    url: "https://api.openai.com/v1/chat/completions",
    options: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxOutputTokens,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
      }),
    },
  };
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

function validateAnswer(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.answer !== "string" || typeof value.disclaimer !== "string" || !Array.isArray(value.evidence)) {
    throw new Error("A resposta da IA para a pergunta tem formato inválido.");
  }
  return {
    answer: cleanText(value.answer, 1600),
    evidence: value.evidence.slice(0, 8).map((item) => cleanText(item, 160)),
    disclaimer: cleanText(value.disclaimer, 800),
  };
}

async function callProvider({ fetchImpl, provider, apiKey, model, timeoutMs, maxOutputTokens, systemPrompt, userContent }) {
  const request = providerRequest({ provider, apiKey, model, systemPrompt, userContent, maxOutputTokens });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(request.url, { ...request.options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function providerJson({ response, provider }) {
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
  return parseProviderResponse(await response.json(), provider);
}

export function createFinancialAdvisor({ fetchImpl = fetch, enabled = aiEnabled, provider = aiProvider, apiKey = aiApiKey, model = aiModel, timeoutMs = aiTimeoutMs, maxOutputTokens = aiMaxOutputTokens, maxPayloadBytes = aiMaxPayloadBytes, logger = console } = {}) {
  const activeProvider = provider === "gemini" ? "gemini" : "openai";
  return {
    enabled: Boolean(enabled && apiKey),
    provider: activeProvider,
    promptVersion: financialAdvisorPromptVersion,
    async analyze(insights) {
      if (!enabled || !apiKey) return { enabled: false, promptVersion: financialAdvisorPromptVersion, message: "A análise por IA está desabilitada. Os indicadores determinísticos continuam disponíveis." };
      const analysis = JSON.stringify({ promptVersion: financialAdvisorPromptVersion, indicators: safeInsights(insights) });
      if (Buffer.byteLength(analysis, "utf8") > maxPayloadBytes) throw new Error("O payload da análise excede o limite configurado.");
      try {
        const response = await callProvider({ fetchImpl, provider: activeProvider, apiKey, model, timeoutMs, maxOutputTokens, systemPrompt: financialAdvisorSystemPrompt, userContent: analysis });
        return { enabled: true, provider: activeProvider, promptVersion: financialAdvisorPromptVersion, ...validateResponse(await providerJson({ response, provider: activeProvider })) };
      } catch (error) {
        if (error.name === "AbortError") {
          const timeoutError = new Error("A análise por IA excedeu o tempo limite.");
          timeoutError.statusCode = 504;
          throw timeoutError;
        }
        if (!error.statusCode) error.statusCode = 502;
        logger.error("Falha na análise financeira por IA.", { message: error.message });
        throw error;
      }
    },
    async ask(question, insights) {
      if (!enabled || !apiKey) return { enabled: false, promptVersion: financialAdvisorPromptVersion, message: "A análise por IA está desabilitada. Gere indicadores determinísticos para continuar." };
      const normalizedQuestion = String(question || "").trim().slice(0, 500);
      if (!normalizedQuestion) throw new Error("Informe uma pergunta para a análise.");
      const request = JSON.stringify({ promptVersion: financialAdvisorPromptVersion, question: normalizedQuestion, indicators: safeInsights(insights) });
      if (Buffer.byteLength(request, "utf8") > maxPayloadBytes) throw new Error("O payload da pergunta excede o limite configurado.");
      try {
        const response = await callProvider({ fetchImpl, provider: activeProvider, apiKey, model, timeoutMs, maxOutputTokens, systemPrompt: financialAdvisorQuestionPrompt, userContent: request });
        return { enabled: true, provider: activeProvider, promptVersion: financialAdvisorPromptVersion, ...validateAnswer(await providerJson({ response, provider: activeProvider })) };
      } catch (error) {
        if (error.name === "AbortError") {
          const timeoutError = new Error("A análise por IA excedeu o tempo limite.");
          timeoutError.statusCode = 504;
          throw timeoutError;
        }
        if (!error.statusCode) error.statusCode = 502;
        logger.error("Falha na pergunta financeira por IA.", { message: error.message });
        throw error;
      }
    },
  };
}
