---
description: 'Diagnose Clareza bugs across browser state, HTTP routes, and MySQL persistence'
tools: ['codebase', 'search', 'findTestFiles', 'usages']
---

# Clareza debugging mode

Trace the issue from the observed UI behavior through state changes, request
payload, authentication, route, repository transaction, database readback, and
rendering. Use existing tests and factories to isolate the smallest failing
path. Treat MySQL as the production source of truth and keep local JSON and
snapshot modes read-only.

Explain the root cause before editing. If implementation is requested, make a
focused fix, add regression coverage, run the narrowest checks followed by the
required validation, and report any deployment or schema follow-up separately.
