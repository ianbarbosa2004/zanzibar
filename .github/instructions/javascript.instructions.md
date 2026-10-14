---
applyTo: '**/*.js, **/*.mjs, **/*.cjs'
description: 'JavaScript and Node.js conventions for Clareza'
---

<!-- Based on/Inspired by: https://github.com/github/awesome-copilot/blob/main/instructions/nodejs-javascript-vitest.instructions.md -->

# JavaScript and Node.js

- Use the repository's ES module configuration and Node.js 22-compatible
  language features.
- Prefer Node.js built-ins and existing helpers before adding dependencies.
- Keep browser, server, and shared-domain responsibilities in their existing
  directories.
- Prefer small functions, explicit data transformations, and async/await.
- Preserve the established error propagation and HTTP response behavior.
- Keep domain normalization and validation reusable from both client and
  server code when the rule is shared.
- Use the repository's existing `node:test` tests; do not migrate to Jest or
  Vitest without an explicit project decision.
- Keep generated assets and runtime JSON outside source changes and commits.
