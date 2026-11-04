# Local workspace acceptance — 2026-11-04

BeatGEO now uses one automatically initialized local workspace. Hosted plans, billing, demo restrictions, white-label deployment flows and account/team management screens are removed. Brand prompt and competitor limits remain. Existing organization membership still controls access to stored brands; credentials encrypted with the legacy key configuration remain readable.

## Verified locally

- `pnpm test:mvp`: configuration (36), deployment (3), CLI (3), shared library (644) and web (586) tests passed, together with 22 browser-collector tests, 25 script tests and 58 PostgreSQL integration tests.
- `pnpm test:local:browser --workers=2`: a fresh workspace test, 51 local browser/setup tests, 202 Bruno requests with 473 passing assertions, a worker test and scheduling checks passed. The API responses were checked against OpenAPI. Optional-field coverage warnings remain informational.
- The fresh workspace test covers automatic owner creation, creating another brand through the API without creating another organization, reopening after cookies are cleared and report access for the local owner. MCP coverage completes browser consent, authorization-code exchange and authenticated tool discovery.
- Concurrent prompt imports/API writes obey the per-brand limit. Batch rejection is atomic, editing at the limit remains possible, and failed brand creation rolls back.
- Migration 0029 was exercised against temporary storage containing pre-migration users, membership, brands, prompts, encrypted credentials and a subscription. Application data and ciphertext survived; removed tables/columns disappeared. Reapplying migrations succeeded. Storage restart, rollback and competing-start checks passed.
- Workspace type checks, production builds, Biome, Knip, OpenAPI lint and Drizzle migration consistency checks passed. The frozen lockfile installs without changing supply-chain controls. Nine selected Storybook suites passed 39 tests; standalone SEO browser tests passed 18 tests and language synchronization tests passed 2.

## Evidence boundaries

Database and browser acceptance used disposable local databases and synthetic accounts. Worker answers came from the explicitly labeled stub provider. These results do not establish real AI-platform visibility, paid-provider behavior, Google authorization, an overnight scheduling run or a clean installation on another computer.

The user's existing database was not migrated. Migration 0029 removes subscription/SSO/billing data and the obsolete report-access flag; back up an existing installation before intentionally upgrading it. No production deployment, upstream publishing workflow or paid model call was performed for this acceptance.

License and third-party attribution files, the approved Google Desktop public-client configuration and pnpm supply-chain protections are unchanged. Personal credentials and raw browser/account evidence remain excluded from Git.
