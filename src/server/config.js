import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogDefaults } from "../shared/catalog-defaults.js";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const dataFile = join(root, "data.json");
export const settingsFile = join(root, "settings.json");
export const incomesFile = join(root, "incomes.json");
export const cashClosingsFile = join(root, "cash-closings.json");
export const monthlyCashClosingsFile = join(root, "monthly-cash-closings.json");
export const limitsFile = join(root, "limits.json");
export const localSnapshotFile = join(root, "local-snapshot.json");
export const messagingFilesDir = process.env.CLAREZA_MESSAGING_FILES_DIR?.trim() || join(root, ".messaging-files");
export const port = Number(process.env.PORT) || 4173;
export const contentTypes = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
};
export const basePath = process.env.CLAREZA_BASE_PATH || "/clareza";
export const databaseHost = process.env.CLAREZA_DB_HOST?.trim() || "localhost";
export const databaseName = process.env.CLAREZA_DB_NAME?.trim();
export const databaseUser = process.env.CLAREZA_DB_USER?.trim();
export const localSnapshotMode = process.env.CLAREZA_LOCAL_SNAPSHOT === "1" || process.env.CLAREZA_LOCAL_SNAPSHOT === "true";
export const databaseConfigured = !localSnapshotMode && Boolean(process.env.CLAREZA_DB_PASSWORD);
const secret = (name) => String(process.env[name] ?? "").trim();
export const googleClientId = secret("GOOGLE_CLIENT_ID");
export const googleClientSecret = secret("GOOGLE_CLIENT_SECRET");
export const googleRedirectUri = secret("GOOGLE_REDIRECT_URI");
export const sessionSecret = secret("CLAREZA_SESSION_SECRET");
export const adminEmail = (secret("CLAREZA_ADMIN_EMAIL") || "pbsjr1@gmail.com").toLowerCase();
export const cookieSecure = secret("CLAREZA_COOKIE_SECURE") === "1" || secret("CLAREZA_COOKIE_SECURE").toLowerCase() === "true";
export const aiEnabled = secret("CLAREZA_AI_ENABLED") === "1" || secret("CLAREZA_AI_ENABLED").toLowerCase() === "true";
export const aiProvider = (secret("CLAREZA_AI_PROVIDER") || "openai").toLowerCase();
export const aiApiKey = aiProvider === "gemini" ? secret("CLAREZA_GEMINI_API_KEY") : secret("CLAREZA_AI_API_KEY");
export const aiModel = secret("CLAREZA_AI_MODEL") || (aiProvider === "gemini" ? "gemini-3.8-flash" : "gpt-4o-mini");
export const aiTimeoutMs = Math.min(Math.max(Number(secret("CLAREZA_AI_TIMEOUT_MS")) || 20000, 5000), 60000);
export const aiMaxOutputTokens = Math.min(Math.max(Number(secret("CLAREZA_AI_MAX_OUTPUT_TOKENS")) || 800, 200), 2000);
export const aiMaxPayloadBytes = Math.min(Math.max(Number(secret("CLAREZA_AI_MAX_PAYLOAD_BYTES")) || 24000, 4000), 100000);
export const telegramBotToken = secret("CLAREZA_TELEGRAM_BOT_TOKEN");
export const telegramWebhookSecret = secret("CLAREZA_TELEGRAM_WEBHOOK_SECRET");
export const telegramNotificationsEnabled = secret("CLAREZA_TELEGRAM_NOTIFICATIONS_ENABLED") === "1" || secret("CLAREZA_TELEGRAM_NOTIFICATIONS_ENABLED").toLowerCase() === "true";

export const defaultSettings = {
  ...catalogDefaults,
};
