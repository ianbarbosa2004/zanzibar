---
agent: 'agent'
description: 'Refactor Clareza code while preserving behavior and contracts'
---

Refactor the requested code surgically.

First identify the current behavior, callers, API payload shape, persistence
effects, and related tests. Keep shared domain rules in `src/shared`, browser
integration in `src/client`, and server integration in `src/server`. Preserve
MySQL transactions, authentication, cache policy, fallback read-only behavior,
and client rollback semantics.

Prefer extracting or reusing existing helpers over broad rewrites. Add or
adjust tests to prove behavior is unchanged, then run the full repository
validation commands.
