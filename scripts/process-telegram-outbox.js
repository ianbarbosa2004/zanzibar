import { telegramBotToken, telegramNotificationsEnabled } from "../src/server/config.js";
import { dbPool, initializeDataStore, processTelegramOutbox } from "../src/server/data-store.js";

if (!telegramNotificationsEnabled) {
  console.log("Notificações Telegram desativadas.");
  process.exit(0);
}

try {
  await initializeDataStore();
  const result = await processTelegramOutbox({ token: telegramBotToken });
  console.log(`Notificações Telegram processadas: ${result.processed}.`);
} catch (error) {
  console.error("Falha ao processar notificações Telegram.", error.message);
  process.exitCode = 1;
} finally {
  await dbPool?.end();
}
