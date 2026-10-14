---
applyTo: '**/*'
description: 'Code review standards for Clareza changes'
---

# Code Review

- Review the complete path of a change: UI state, request payload, route,
  authorization, repository transaction, response, and subsequent read.
- Prioritize correctness of financial totals, duplicate prevention, rollback
  behavior, catalog references, and authentication boundaries.
- Check that changes preserve MySQL as the production source of truth and do
  not accidentally write to local fallback files.
- Require focused tests for changed shared rules and HTTP behavior.
- Check documentation and automation files when operational behavior changes.
- Flag generated files, runtime data, secrets, destructive Git commands, and
  unauthorized deployment behavior.
- Report concrete findings with file paths, lines, impact, and a minimal fix;
  distinguish verified defects from suggestions.
