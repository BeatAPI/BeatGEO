# Local workspace review — 2026-11-04

BeatGEO runs on the user's computer with `pnpm start`: the web interface, PostgreSQL, worker and browser collector run locally. No server deployment is required. External research providers and optional Google connections are data sources, not hosted BeatGEO editions.

## SEO and GEO

| Area | Purpose | Evidence |
| --- | --- | --- |
| SEO | Domain and keyword research, ranking keywords, top pages, backlinks, competitors, saved research and Search Console performance | Provider search estimates, saved SEO snapshots and connected GSC data |
| GEO | Monitor reviewed questions, inspect AI answers, brand mentions and citations, compare visibility and competitors, review opportunities and retest changes | Collected answers and their sources; GA referrals and crawl logs provide separate supporting observations |

SEO candidates become GEO questions only after review and confirmation. Keyword search volume, domain ratings and backlinks do not enter the AI visibility calculation. SEO research snapshots are local files under `~/.beat-geo/seo` by default (or `BEAT_GEO_SEO_DATA_DIR`); GEO monitoring records are in PostgreSQL. Preserve both stores when backing up the entire workspace.

The integrated SEO workspace links to the brand's GEO answers and does not independently import or score AI answers. The standalone research utility can inspect imported records using domain matching only; its interface and exported reports state that limitation. Candidate questions use the research language: English and Chinese have templates, while other languages retain their keyword text for editing.

## User interface verification

The running local application was inspected in headless Chromium against the upgraded real local database. Sixteen primary pages opened without uncaught page errors, and the Brand, GEO, API Keys and SEO pages were checked at 390px width without horizontal document overflow. English/Chinese navigation and the embedded SEO interface were observed. The existing database had no monitoring questions or answers, so these observations cover the empty-state experience; populated behavior is covered separately with fixtures.

Corrections include translated API-key lifecycle and expiry labels, selected expiry values that retain the chosen language, translated result counts, locale-aware dates and a local-workspace footer instead of an inherited release number. Regression coverage includes 22 selected Storybook cases, 182 SEO module tests, four web adapter tests and 19 SEO browser cases. Provider responses in these tests are synthetic.

## Local database upgrade

The owner authorized upgrading the actual bundled PostgreSQL instance. A complete offline copy of the stopped database, ownership marker and both private environment files was saved under the ignored `.beat-geo/backups` directory before migration. Migration `0029_remove_hosted_modes` completed; the database records 30 migrations including index 0000. Its latest migration hash matches the source SQL, and retired tables and columns are absent. Core user, membership, brand, prompt, run and secret records were compared before and after migration without exposing their contents.

The standard `pnpm start` launcher then reopened the upgraded database, applied migrations idempotently, and started the web interface, collector and ready worker. The obsolete mode setting was removed from both local environment files. Private backups, screenshots and verification details remain untracked.

## Boundaries

This is a source revision with schema 0029, not a newly published package release. No cloud deployment or paid research call was made. Real provider permissions, data coverage, fresh Google authorization and unattended overnight collection were not revalidated. Browser transport options do not establish that every selectable API model has passed real-browser acceptance.
