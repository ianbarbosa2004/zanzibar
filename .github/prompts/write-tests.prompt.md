---
agent: 'agent'
description: 'Generate focused node:test coverage for a Clareza behavior'
---

Add tests for the requested behavior using the repository's native `node:test`
suite.

Determine whether the behavior belongs in `tests/unit` or
`tests/integration`. Reuse existing fixtures and server factories. Cover the
normal path, invalid input, relevant boundary conditions, and explicit error
handling. For writes, verify that failures do not appear as successful
operations and that the client rollback contract is preserved where the
behavior is covered by the selected layer.

Do not change production code solely to make it easier to test. Run the
narrowest test file first, then the relevant test group and the full required
validation.
