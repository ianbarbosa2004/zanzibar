import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogDefaults } from "../shared/catalog-defaults.js";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const dataFile = join(root, "data.json");
export const settingsFile = join(root, "settings.json");
export const incomesFile = join(root, "incomes.json");
export const cashClosingsFile = join(root, "cash-closings.json");
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
export const databaseConfigured = Boolean(process.env.CLAREZA_DB_PASSWORD);

export const defaultSettings = {
  ...catalogDefaults,
};
