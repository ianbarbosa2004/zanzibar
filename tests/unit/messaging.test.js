import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMessageFiles } from "../../src/shared/messaging.js";

test("remove anexos nulos das mensagens", () => {
  assert.deepEqual(normalizeMessageFiles(null), []);
  assert.deepEqual(normalizeMessageFiles([]), []);
  assert.deepEqual(normalizeMessageFiles([{ id: null, name: null }, { id: 4, name: "arquivo.txt" }]), [{ id: 4, name: "arquivo.txt" }]);
});
