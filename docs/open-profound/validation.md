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
- Elmo provider, configuration and text-extraction tests: 101 passed before final documentation-only updates.
- Environment registry tests: 6 passed.
- Shared library TypeScript check passed.
- Whole workspace Biome check passed (818 source files at the first check).

Final collector suite: 9 passed. Final whole-workspace lint passed after the last implementation fixes. Local HTTP checks returned 200 for health/history and 403 for disallowed Host, foreign Origin and unauthenticated writes. CI only runs the dependency-free browser collector test suite; the Elmo checks above were local.

## Not verified

Full Elmo dashboard + database + worker + browser collector end-to-end; unattended scheduling; all engines and regions; model pinning; BeatAPI analysis/billing integration. No database migrations or production deployment were performed.

## TaskSpace default and desktop workbench follow-up

- Browser/evidence suite: 15 passed. Default collection chooses the supplied profile, scopes every page command, never falls back to ordinary tabs, and retains pages after completion or ambiguous submission.
- Workspace lint: 819 files passed. The installed pnpm wrapper had an execution-format error; checks used the installed pnpm 12.4.1 JavaScript entrypoint, with the workspace security settings unchanged.
- Isolated headless Chrome: visibility/citations/prompts/raw-answer switching, denominator handling, filters, selected profile submission and local draft saving passed without page errors. Fixture data was intercepted only inside the disposable test context, never written into the user's evidence store.
- Daily Chrome: the local workbench opened inside a named BeatBrowser TaskSpace, alongside the signed-in Profound reference page. The profile-discovery endpoint confirmed a connected 1.3.1 extension and TaskSpace mode. This was a UI/read check, not a fresh model submission.
- Public UI assets use Lucide (ISC) and Geist (OFL), with included licenses. Private source-page captures and the reference font remain untracked.
- Ego Lite is not a runtime/package dependency. Its local application was moved to Trash at the owner's request; profile data was retained.

Full product/worker/database integration, all Profound modules, native macOS focus guarantees, and a new live ChatGPT/Gemini collection with the default TaskSpace path remain unverified. No migration, npm release or production deployment was performed.
