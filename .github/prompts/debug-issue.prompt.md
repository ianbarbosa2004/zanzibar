---
agent: 'agent'
description: 'Trace and fix a Clareza bug across UI, API, persistence, and tests'
---

Investigate the reported issue as an end-to-end defect.

Reproduce or isolate the behavior without production credentials or data.
Trace interface state, payload construction, route matching, authentication,
repository SQL/transaction behavior, response handling, and the subsequent
render. Compare the affected path with nearby working features and inspect
existing tests before changing code.

Fix the root cause with the smallest compatible change, add regression
coverage, and verify failure paths explicitly. Do not mask database errors,
write through local fallback files, or deploy without explicit authorization.
