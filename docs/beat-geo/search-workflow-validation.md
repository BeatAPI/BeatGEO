# Search workflow refinement validation — 2026-11-06

The product review fixes separate free saved-data reads from explicit paid GEO recommendation generation, add direct SEO diagnosis/action navigation, explain source readiness and comparison states, localize system-authored evidence and drafts, and keep mobile controls usable. Existing analysis snapshots and actions remain compatible; no database migration is added.

## Verified behavior

- Reading old or absent recommendation reports never invokes the model. Public API/MCP reads use the same path. Missing reports return `not-generated`, not a claim about evidence sufficiency.
- Explicit generation uses a durable command, brand-level transaction lock and expected report timestamp. Duplicate keys, concurrent tabs and stale tabs cannot silently purchase another generation; failures preserve the saved report.
- Source readiness distinguishes disconnected, unselected, first-refresh, legacy-summary and stale states. Matching SEO workbench results use the same `www` normalization as import. Private credentials and raw errors are not returned.
- SEO/GEO action destinations and filters survive URL navigation and reload. SEO actions hide AI-question collection, show the proper implementation feedback, and expose comparison periods/reasons.
- Chinese system titles, rule explanations and free outlines are localized while preserving query text, URLs and user edits. Old snapshots remain readable. GA page metrics and their differing scope are separated from search-query metrics.
- Evidence defaults to readable tables, with original JSON and IDs under technical details. Provider coverage stays available. Diagnosis actions fit a 320px viewport.

## Local validation

- Lint and lib/web/e2e type checks passed.
- MVP regression passed: 1,301 workspace unit tests and 61 database/MCP/queue integration tests, plus browser collector and installer checks. A subsequent 22-test focused run also passed, including the added `www` normalization regression.
- Isolated browser workflow passed: search diagnosis, 320px button bounds, create/view action, SEO/GEO filter navigation, Chinese free outline, review gate, implementation feedback and persisted state after reload. Two real-app language persistence scenarios passed in the same disposable environment.
- The browser runner also passed 202 API requests, 101 API tests, 473 assertions, OpenAPI validation, worker execution and duplicate scheduling checks.
- Focused Storybook coverage checks GSC/GA controls, sidebar/traffic rendering and both saved/missing recommendation states without automatic generation. Server functions are replaced only at the Storybook boundary; offline write mocks refuse execution.
- Production web build and server-bundle validation passed.
- Read-only checks against the existing local workspace verified legacy Google source guidance, Chinese/hash reload persistence, traffic navigation and no document overflow at 390px; no page errors were observed.

All writable scenarios use disposable databases and synthetic evidence. No real Google refresh, paid generation, publication or existing-database migration was performed for this refinement. Screenshots under ignored `e2e/test-results-local/` distinguish these synthetic acceptance scenarios from existing-account read-only checks.
