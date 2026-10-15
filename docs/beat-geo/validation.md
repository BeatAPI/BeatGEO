# Local validation — 2026-10-14

## Live browser results

| Trial | Result | Evidence summary |
|---|---|---|
| ChatGPT, manually initiated neutral category query, captured by CLI | Completed | 8,764 characters, 18 visible source URLs; no literal BeatAPI mention |
| ChatGPT, fully automated fresh chat through the new collector | Completed | 404 characters, 5 visible source URLs; no literal BeatAPI mention |
| Gemini, fully automated fresh chat, 120-second completion window | Timeout | No completed answer scored; brand mention remains null |

The first and second questions differ; these are smoke tests, not a benchmark or visibility estimate. The manual capture is explicitly labeled operator-supplied prompt, not independently matched. The third result is a collector timeout, not proof Gemini failed to generate an answer: pending background rendering was observed in DOM inspection. No retry was submitted automatically.

Raw answers, account context and tab identifiers stay local and are excluded from Git. The Browser Lab UI was inspected in the real Chrome browser with a screenshot. No login data was exported.

## Code verification

- Browser collector behavior tests: completed evidence, failed-run denominator, source URL filtering, no duplicate submission after ambiguous transport failure, local storage, no-brand scoring and verification handoff.
- BeatGeo provider, configuration and text-extraction tests: 101 passed before final documentation-only updates.
- Environment registry tests: 6 passed.
- Shared library TypeScript check passed.
- Whole workspace Biome check passed (818 source files at the first check).

Final collector suite: 9 passed. Final whole-workspace lint passed after the last implementation fixes. Local HTTP checks returned 200 for health/history and 403 for disallowed Host, foreign Origin and unauthenticated writes. CI only runs the dependency-free browser collector test suite; the BeatGeo checks above were local.

## Not verified

Full BeatGeo dashboard + database + worker + browser collector end-to-end; unattended scheduling; all engines and regions; model pinning; BeatAPI analysis/billing integration. No database migrations or production deployment were performed.

## TaskSpace default and desktop workbench follow-up

- Browser/evidence suite: 15 passed. Default collection chooses the supplied profile, scopes every page command, never falls back to ordinary tabs, and retains pages after completion or ambiguous submission.
- Workspace lint: 819 files passed. The installed pnpm wrapper had an execution-format error; checks used the installed pnpm 12.4.1 JavaScript entrypoint, with the workspace security settings unchanged.
- Isolated headless Chrome: visibility/citations/prompts/raw-answer switching, denominator handling, filters, selected profile submission and local draft saving passed without page errors. Fixture data was intercepted only inside the disposable test context, never written into the user's evidence store.
- Daily Chrome: the local workbench opened inside a named BeatBrowser TaskSpace, alongside the signed-in Profound reference page. The profile-discovery endpoint confirmed a connected 1.3.1 extension and TaskSpace mode. This was a UI/read check, not a fresh model submission.
- Public UI assets use Lucide (ISC) and Geist (OFL), with included licenses. Private source-page captures and the reference font remain untracked.
- Ego Lite is not a runtime/package dependency. Its local application was moved to Trash at the owner's request; profile data was retained.

Full product/worker/database integration, all Profound modules, native macOS focus guarantees, and a new live ChatGPT/Gemini collection with the default TaskSpace path remain unverified. No migration, npm release or production deployment was performed.

## BeatGeo MVP identity and monitoring verification

Verified locally with Node.js 24.19.0 and pnpm 12.4.1:

- Workspace unit suites: 1,391 passing tests across config, CLI, lib, deployment and web.
- Browser collector/evidence: 16 passing Node tests; simulated transport, not fresh live-platform collection.
- Workspace TypeScript checks and Biome lint passed; the web production build passed with dependency bundling warnings.
- Headless workbench UI with synthetic observations: independent brand selection, 50% from 1/2 scored answers, timeout excluded, error plus partial text retained, elapsed time, JSON export and no JavaScript errors.
- Interactive product blueprint: 12 clickable steps, no JavaScript errors; README preview generated from that file.
- No production database migrations, account changes, paid provider calls or user browser windows were used for this verification.

PostgreSQL → worker → BeatBrowser end-to-end scheduled monitoring and live Gemini stability still need deployment acceptance. The README status table is the supported MVP boundary.

## Monitoring loop and BeatAPI integration — 2026-10-15

This entry supersedes the earlier unverified database/worker boundary for the specific path below; it does not certify every engine or unattended operation.

- Created a disposable PostgreSQL 17 instance on loopback port 55439, with a dedicated `beatgeo_mvp_test` database. Applied all migrations, including collection attempts and optimization actions. No BeatAPI main-site or gateway database was changed.
- Real pg-boss → worker → local collector → signed-in ChatGPT: one fresh category question completed, yielding 1,457 answer characters and 10 visible source links. The worker stored the answer/citations/observation atomically and scheduled the next cycle 24 hours later. The answer did not literally mention BeatAPI. This is one smoke test, not a visibility estimate; the future cycle was queued, not waited for or observed executing.
- An earlier attempt stopped on `PAGE_BUSY` before submission. Added bounded, read-only composer readiness polling, then completed the trial above. Regression tests cover transient/persistent busy states and human pause without refresh, focus changes or duplicate submission.
- PostgreSQL integration: 40 tests passed, including five new loop tests for baseline → implementation → actual queue → matched retest, duplicate job handling, timeout, empty answer, cross-brand isolation, changed questions and transaction rollback when citations cannot be saved. Provider replies in these integration tests are synthetic.
- Workspace unit suites: 1,408 passed (config 119, CLI 35, lib 660, deployment 52, web 542). Browser collector/evidence: 19 passed. All workspace TypeScript checks and Biome lint passed. Web production build passed with dependency directive/chunk-size warnings.
- Local authenticated dashboard UI: saved a synthetic recommendation and baseline, recorded implementation, queued a retest, and displayed missing comparable coverage. Desktop and mobile inspected; no horizontal overflow or browser page errors. UI fixtures are explicitly labeled synthetic and kept out of Git.
- BeatAPI provider contract tests cover search → page reading → structured analysis, fixed credential destination, API-simulation separation, truncated/empty answers, and no automatic retries for 401/402/429/5xx. These tests mock HTTP responses. Anonymous public capability discovery found Web Search; it does not validate billed requests.

Still unverified: a real BeatAPI key/model/charge, new Gemini live collection, overnight cadence execution, multi-worker/device leasing, account/region/model pinning, complete citation side panels, production deployment and long-term reliability. SEO dedicated endpoints are not connected. Website technical audit and a complete content publication workflow remain roadmap features. See [self-hosting](../self-hosting.md) and [product/API boundaries](beatapi-product-loop.md).

## Guided local setup acceptance — 2026-10-15

- A new `pnpm local:setup` created a dedicated PostgreSQL 17 container/volume on loopback port 55440, generated independent secrets, applied migrations, and prepared the pinned BeatBrowser 1.3.1 extension. `--resume` completed against the unchanged generated configuration. No main-site/gateway configuration or database was touched.
- From a fresh database, a headless local browser registered the first owner, opened Connections without a research key, selected the existing Chrome profile, created a brand and manually entered one question. The local organization admin can manage Connections; ordinary members and non-local modes cannot.
- That question ran through pg-boss → worker → bundled BeatBrowser → a signed-in ChatGPT TaskSpace. It completed in approximately 163 seconds with 2,663 characters and six visible citations, persisted to PostgreSQL, and queued its next cycle 24 hours later. This is one smoke test; the future cycle was not observed running.
- New connection contract/security tests passed, including unauthorized access, fixed credential destination/no redirects, rejected key/model updates, and sanitized status. PostgreSQL integration passed 41 tests, including encrypted key/model persistence and retaining the previous configuration after rejection. External BeatAPI responses in these tests were mocked; no billed model acceptance is claimed.
- Workspace unit suites passed 1,430 tests (config 119, CLI 35, lib 660, deployment 52, web 564). Browser tests passed 20; isolated local-runtime tests passed two. Workspace type checks and the web production build passed. The setup page was inspected at desktop and 390px width, with no mobile horizontal overflow.
- Source-based setup still requires Chrome's explicit extension installation when none is present. It does not silently install extensions, migrate Chrome profiles, or prove website login from bridge connectivity. There is no native one-click desktop installer, remote browser leasing or SQLite backend in this release.
