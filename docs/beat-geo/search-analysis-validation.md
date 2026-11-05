# Search analysis validation — 2026-11-05

Implementation branch: `codex/seo-analysis-workflow`.

| Check | Result |
| --- | --- |
| `pnpm lint` | Passed |
| lib, web and e2e TypeScript checks | Passed |
| `pnpm test:mvp` | Passed: 1,279 workspace unit tests and 61 database/MCP/queue integration tests, plus browser collector and installer regressions |
| `pnpm test:seo` | 183 passed |
| Focused `search-performance.stories.tsx` browser tests | 3 passed: joint rows/period switching, GA session rates, Chinese labels |
| `pnpm test:local:browser search-analysis.spec.ts` | Passed: first-run setup, authentication setup, search-action browser workflow, 202 API requests / 473 assertions, OpenAPI validation, worker and scheduling checks |
| `pnpm --filter @workspace/web build` | Passed, including server-bundle validation; dependency bundler directive warnings remain non-fatal |

The new browser scenario uses clearly synthetic query/page metrics in a disposable local PostgreSQL database. It observes a 0.80% CTR candidate, its actual data period, creation of an SEO action without AI questions, a free outline, the review gate before implementation, persistence after reload, and a waiting SEO comparison without an AI retest button.

The Google adapter/integration checks verify joint rows, equal comparison periods, missing-data semantics, metadata, bounded pagination, malformed metrics, ownership, archived snapshots, failure retention and idempotent refresh. The MCP workflow checks evidence isolation and a draft-to-implementation sequence. SEO workbench import rejects demos, interrupted runs and invalid run paths.

No existing user database was migrated and no real Google account or paid research provider was queried. There is no claim of improved live rankings, conversions or AI visibility from these tests. Source refresh with the owner's actual properties and applying migration 0030 to an existing installation are separate activation steps.

Screenshots from the successful browser run are written under `e2e/test-results-local/` (ignored test artifacts): `search-diagnosis.png` and `seo-action-reviewed.png`.
