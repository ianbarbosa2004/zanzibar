import { existsSync, promises as fs } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
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
  };
}
