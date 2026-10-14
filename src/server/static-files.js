import { existsSync, promises as fs } from "node:fs";
import { extname, join, normalize, relative, sep } from "node:path";
import { contentTypes, root } from "./config.js";

export function publicFilePath(requestedPath) {
  const publicRoot = normalize(existsSync(join(root, "dist")) ? join(root, "dist") : root);
  const normalizedRequest = requestedPath.replace(/[\\/]+/g, sep);
  let file = normalize(join(publicRoot, normalizedRequest));
  const publicRootPrefix = publicRoot.endsWith(sep) ? publicRoot : `${publicRoot}${sep}`;
  if (file !== publicRoot && !file.startsWith(publicRootPrefix)) return null;
  if (!existsSync(file)) {
    file = join(publicRoot, "index.html");
    if (!existsSync(file)) return null;
  }
  return file;
}

export async function readStaticFile(requestedPath) {
  const file = publicFilePath(requestedPath);
  if (!file) return null;
  return {
    body: await fs.readFile(file),
    contentType: contentTypes[extname(file)] || "application/octet-stream",
    name: file,
  };
}

const markdownExcludedDirectories = new Set([".git", "dist", "node_modules", "backups"]);

async function collectMarkdownFiles(directory, current = directory) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    if (entry.isDirectory() && markdownExcludedDirectories.has(entry.name)) continue;
    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdownFiles(directory, fullPath));
    else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(relative(directory, fullPath).replaceAll(sep, "/"));
  }
  return files;
}

export async function listMarkdownFiles() {
  return (await collectMarkdownFiles(root)).sort((left, right) => left.localeCompare(right, "pt-BR"));
}

export async function readMarkdownFile(requestedPath) {
  const normalized = String(requestedPath || "").replace(/[\\/]+/g, sep);
  if (!/\.md$/i.test(normalized) || normalized.includes("..")) return null;
  const filePath = normalize(join(root, normalized));
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!filePath.startsWith(rootPrefix) || !existsSync(filePath)) return null;
  return { path: normalized.replaceAll(sep, "/"), content: await fs.readFile(filePath, "utf8") };
}
