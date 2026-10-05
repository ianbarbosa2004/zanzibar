import { cashClosingsFile, dataFile, defaultSettings, incomesFile, settingsFile } from "./config.js";
import { dbPool, initializeDatabase, readDatabase, writeDatabase } from "./database/repository.js";
import { readJson, writeJson } from "./json-store.js";

export { dbPool };

export async function initializeDataStore() {
  await initializeDatabase({ readJson, dataFile, settingsFile, incomesFile, cashClosingsFile, defaultSettings });
}

export async function readData() {
  if (dbPool) return readDatabase();
  return {
    transactions: await readJson(dataFile, []),
    incomes: await readJson(incomesFile, []),
    cashClosings: await readJson(cashClosingsFile, []),
    settings: await readJson(settingsFile, defaultSettings),
  };
}

export async function writeData(payload) {
  if (dbPool) return writeDatabase(payload);
  await writeJson(dataFile, payload.transactions);
  await writeJson(incomesFile, payload.incomes || payload.transactions.filter((item) => item.type === "income"));
  await writeJson(cashClosingsFile, payload.cashClosings || []);
  await writeJson(settingsFile, payload.settings);
}
