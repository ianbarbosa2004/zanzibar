---
applyTo: '**/*.js, **/*.mjs, **/*.cjs, **/*.json, **/*.yml, **/*.yaml, **/*.ps1'
description: 'Security and data-protection rules for Clareza'
---

# Security

- Never commit or upload credentials, OAuth secrets, production data, database
  dumps, private keys, runtime JSON, `node_modules`, `dist`, or `.htaccess`.
- Keep Google OAuth authorization and administrative checks enforced on the
  server for every protected API operation.
- Use parameterized SQL through the existing repository layer and preserve
  transaction boundaries for compound writes.
- Do not turn local JSON fallback or snapshot mode into a writable production
  path.
- Return explicit HTTP errors for failed persistence; never report a failed
  database operation as successful.
- Do not log passwords, OAuth tokens, private keys, session secrets, or
  sensitive payloads.
- Deploy only through `.github/scripts/deploy.ps1` after explicit user
  authorization and the documented `ssh-agent` checks.
