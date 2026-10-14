import { basePath, port, telegramBotToken, telegramWebhookSecret } from "./src/server/config.js";
import { consumeTelegramLink, createTelegramLinkCode, deleteAuthSession, dbPool, findAuthSession, findAuthUser, initializeDataStore, listAuthUsers, listMessagingUsers, readData, readFinancialInsightHistory, readMessagingConversations, readMessagingFile, readMessagingMessages, saveAuthSession, saveAuthUser, saveFinancialInsightHistory, saveMessage, saveMessageFile, saveMessagingConversation, sendTelegramTest, touchAuthSession, writeBillings, writeCashClosing, writeCatalog, writeLimit, writeMonthlyCashClosings, writeTransaction } from "./src/server/data-store.js";
import { createAuth } from "./src/server/auth.js";
import { createHttpServer } from "./src/server/http-server.js";
import { listMarkdownFiles, readMarkdownFile, readStaticFile } from "./src/server/static-files.js";
import { analyzeFinancialPeriod, compareFinancialPeriods } from "./src/shared/financial-insights.js";
import { createFinancialAdvisor } from "./src/server/ai/financial-advisor.js";

const auth = createAuth({ findUser: findAuthUser, saveUser: saveAuthUser, listUsers: listAuthUsers, saveSession: saveAuthSession, findSession: findAuthSession, touchSession: touchAuthSession, deleteSession: deleteAuthSession });
const financialAdvisor = createFinancialAdvisor();
const analyzeFinancialInsights = ({ data, month, scope = "general" }) => {
  try {
    return analyzeFinancialPeriod({ transactions: data.transactions || [], incomes: data.incomes || [], month, scope });
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }
};
const requestFinancialInsights = async ({ data, month, scope = "general", withAi = false }) => {
  const deterministic = analyzeFinancialInsights({ data, month, scope });
  return withAi ? { deterministic, ai: await financialAdvisor.analyze(deterministic) } : { deterministic };
};
const compareFinancialInsights = ({ data, month, scope = "general", periods = 3 }) => {
  try {
    return compareFinancialPeriods({ transactions: data.transactions || [], incomes: data.incomes || [], month, scope, periods });
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }
};
const askFinancialQuestion = async ({ data, month, scope = "general", question }) => {
  const deterministic = analyzeFinancialInsights({ data, month, scope });
  return { deterministic, ai: await financialAdvisor.ask(question, deterministic) };
};
const server = createHttpServer({ basePath, auth, analyzeFinancialInsights: requestFinancialInsights, compareFinancialInsights, askFinancialQuestion, consumeTelegramLink, createTelegramLinkCode, listMarkdownFiles, listMessagingUsers, readData, readFinancialInsightHistory, readMarkdownFile, readMessagingConversations, readMessagingFile, readMessagingMessages, saveFinancialInsightHistory, saveMessage, saveMessageFile, saveMessagingConversation, sendTelegramTest, telegramBotToken, telegramWebhookSecret, writeBillings, writeCashClosing, writeCatalog, writeLimit, writeMonthlyCashClosings, writeTransaction, readStaticFile });

initializeDataStore().then(() => {
  server.listen(port, () => console.log(`Clareza disponível em http://localhost:${port}${dbPool ? " (MySQL)" : ""}`));
}).catch((error) => {
  console.error("Não foi possível inicializar o banco de dados.", error);
  process.exitCode = 1;
});
