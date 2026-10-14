---
applyTo: '**/*.js, **/*.mjs, **/*.cjs, **/tests/**'
description: 'Testing standards for node:test unit and HTTP integration tests'
---

# Testing

- Place isolated domain, parser, formatter, registry, and state tests under
  `tests/unit`.
- Place server, route, authentication, static-file, and HTTP contract tests
  under `tests/integration`.
- Test the externally observable behavior and preserve the production
  implementation rather than adding test-only seams.
- For writes, cover success, invalid payloads, persistence failures, and the
  visual rollback contract where applicable.
- For persistence changes, validate the complete interface-to-API-to-repository
  flow without using production data or credentials.
- Run the narrowest relevant file with `node --test path/to/file.test.js`,
  then run `npm.cmd test` and the required build/syntax checks before
  completing a code change.
