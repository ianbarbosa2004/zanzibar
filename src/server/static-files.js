import { existsSync, promises as fs } from "node:fs";
import { extname, join, normalize } from "node:path";
import { contentTypes, root } from "./config.js";

export function publicFilePath(requestedPath) {
  const publicRoot = existsSync(join(root, "dist")) ? join(root, "dist") : root;
  let file = normalize(join(publicRoot, requestedPath));
  if (!file.startsWith(publicRoot)) return null;
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
  };
}
