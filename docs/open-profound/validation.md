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

Full Elmo dashboard + database + worker + browser collector end-to-end; unattended scheduling; all engines and regions; model pinning; Ego browser integration; BeatAPI analysis/billing integration. No database migrations or production deployment were performed.
