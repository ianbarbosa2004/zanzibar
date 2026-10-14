---
applyTo: '**/*.md, **/*.mdx'
description: 'Documentation standards for Clareza project documentation'
---

# Documentation

- Keep README, CONTRIBUTING, continuity, automation, deployment, and OAuth
  documentation consistent with the implementation.
- Update documentation when commands, API contracts, persistence behavior,
  deployment safety, or operational automations change.
- Prefer concise Portuguese wording where existing project documentation is
  Portuguese; keep generated configuration metadata and code identifiers in
  English.
- Link to the canonical document instead of duplicating long operational
  procedures.
- Do not document credentials, secrets, production records, private keys, or
  runtime JSON contents.
- For documentation-only changes, validate with `git diff --check` and confirm
  that functional files were not modified.
