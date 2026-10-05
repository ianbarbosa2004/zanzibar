import { promises as fs } from "node:fs";

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.writeFile(file, JSON.stringify(fallback, null, 2) + "\n");
    return fallback;
  }
}

export async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
}
