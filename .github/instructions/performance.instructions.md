---
applyTo: '**/*.js, **/*.mjs, **/*.cjs, **/*.html, **/*.css'
description: 'Performance and caching conventions for the Clareza web app'
---

# Performance

- Preserve the existing Vite asset pipeline and hashed asset filenames.
- Keep `index.html` and HTML responses revalidated without stale application
  code; hashed JS and CSS assets should retain long-lived immutable caching.
- Avoid loading or recomputing unrelated sections when a focused state update
  is sufficient.
- Keep pagination state isolated to the list renderer that consumes it.
- Prefer server-side SQL filtering and aggregation for database-backed data
  rather than transferring or duplicating large datasets in the browser.
- Preserve the existing `billings` aggregation rules and avoid recomputing
  derived data on every unrelated render.
- Measure behavior with the existing application and tests before introducing
  caching or memoization that could weaken persistence correctness.
