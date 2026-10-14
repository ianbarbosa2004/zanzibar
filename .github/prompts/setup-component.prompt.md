---
agent: 'agent'
description: 'Plan and implement a Clareza feature or module within the existing architecture'
---

Implement the requested Clareza feature without changing the established
architecture.

Before editing:
- Identify whether the behavior belongs in `src/client`, `src/server`, or
  `src/shared`.
- Trace the existing UI/state/API/repository flow for the nearest feature.
- Read the related unit and integration tests.
- Identify whether the change affects MySQL schema, migrations, catalog
  references, authentication, or deployment documentation.

During implementation:
- Preserve the existing HTTP contract and MySQL source-of-truth rules.
- Use the existing helpers and patterns instead of duplicating domain logic.
- Preserve visual rollback after failed writes.
- Add focused tests at the appropriate layer.
- Do not include runtime data, credentials, generated assets, or deployment
  changes unless explicitly requested.

Finish by running the repository validation commands and reporting changed
files, tests, and any unresolved operational requirement.
