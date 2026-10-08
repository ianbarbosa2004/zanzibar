import { promises as fs } from "node:fs";

export async function readJson(file, fallback) {
  try {
    const content = await fs.readFile(file, "utf8");
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return fallback;
  }
}
