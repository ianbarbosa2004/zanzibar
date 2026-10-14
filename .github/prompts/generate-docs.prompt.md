---
agent: 'agent'
description: 'Update Clareza documentation from verified implementation changes'
---

Update only the documentation affected by the requested implementation
change. Compare the code, tests, package scripts, CI workflow, and existing
operational documents before writing.

Keep README and CONTRIBUTING onboarding accurate. Put deployment procedures in
`docs/DEPLOYMENT.md`, automation behavior in `docs/AUTOMATIONS.md` and
`docs/AUTOMATION-PROMPTS.md`, continuity guidance in
`docs/CONTINUITY-PROMPT.md`, and OAuth setup in `docs/GOOGLE-OAUTH.md`.
Avoid duplicating procedures or exposing secrets and runtime data.

Validate with `git diff --check` and confirm that no functional file changed
when the task is documentation-only.
