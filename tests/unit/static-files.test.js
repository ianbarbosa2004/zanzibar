import assert from "node:assert/strict";
import test from "node:test";
import { publicFilePath } from "../../src/server/static-files.js";

test("resolve arquivo existente dentro da raiz pública", () => {
  const file = publicFilePath("index.html");
  assert.ok(file.endsWith("\\dist\\index.html") || file.endsWith("/dist/index.html"));
});

test("rejeita tentativa de escapar da raiz pública", () => {
  assert.equal(publicFilePath("..\\package.json"), null);
});
