import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { messagingFilesDir } from "./config.js";

const maxFileBytes = 10 * 1024 * 1024;

export function assertMessageFileSize(size) {
  if (!Number.isInteger(size) || size < 1 || size > maxFileBytes) throw new Error("Arquivo inválido ou maior que 10 MB.");
}

export async function writeMessageFile(data, originalName) {
  assertMessageFileSize(data.length);
  await fs.mkdir(messagingFilesDir, { recursive: true });
  const storedName = `${randomUUID()}-${basename(String(originalName || "arquivo"))}`;
  const filePath = join(messagingFilesDir, storedName);
  await fs.writeFile(filePath, data, { flag: "wx" });
  return { storedName, filePath };
}

export async function readMessageFile(storedName) {
  const safeName = basename(String(storedName || ""));
  if (!safeName || safeName !== storedName) throw new Error("Arquivo inválido.");
  return fs.readFile(join(messagingFilesDir, safeName));
}
