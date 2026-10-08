import { cashClosingsFile, dataFile, defaultSettings, incomesFile, limitsFile, localSnapshotFile, localSnapshotMode, monthlyCashClosingsFile, settingsFile } from "./config.js";
import { dbPool, initializeDatabase, readDatabase, refreshBillingsData, saveCashClosing, saveCatalog, saveLimit, saveMonthlyCashClosings, saveTransaction } from "./database/repository.js";
import { readJson } from "./json-store.js";

export { dbPool };

export async function initializeDataStore() {
  if (localSnapshotMode) return;
  await initializeDatabase({ readJson, dataFile, settingsFile, incomesFile, cashClosingsFile, monthlyCashClosingsFile, limitsFile, defaultSettings });
}

export async function readData() {
  if (localSnapshotMode) return readJson(localSnapshotFile, {
    transactions: [], incomes: [], cashClosings: [], monthlyCashClosings: [], billings: [], limits: [], settings: defaultSettings,
  });
  if (dbPool) return readDatabase();
  return {
    transactions: await readJson(dataFile, []),
    incomes: await readJson(incomesFile, []),
    cashClosings: await readJson(cashClosingsFile, []),
    monthlyCashClosings: await readJson(monthlyCashClosingsFile, []),
    billings: [],
    limits: await readJson(limitsFile, []),
    settings: await readJson(settingsFile, defaultSettings),
  };
}

export async function writeCashClosing(date, items) {
  if (localSnapshotMode) throw new Error("Modo snapshot local: gravações estão desabilitadas.");
  return saveCashClosing(date, items);
}

export async function writeMonthlyCashClosings(items) {
  if (localSnapshotMode) throw new Error("Modo snapshot local: gravações estão desabilitadas.");
  return saveMonthlyCashClosings(items);
}

export async function writeTransaction(item) {
  if (localSnapshotMode) throw new Error("Modo snapshot local: gravações estão desabilitadas.");
  return saveTransaction(item);
}

export async function writeLimit(item) {
  if (localSnapshotMode) throw new Error("Modo snapshot local: gravações estão desabilitadas.");
  return saveLimit(item);
}

export async function writeCatalog(operation) {
  if (localSnapshotMode) throw new Error("Modo snapshot local: gravações estão desabilitadas.");
  return saveCatalog(operation);
}

export async function writeBillings() {
  if (localSnapshotMode) throw new Error("Modo snapshot local: recomposição está desabilitada.");
  return refreshBillingsData();
}
