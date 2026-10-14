# Open Profound

An open-source AEO/GEO monitoring workbench by BeatAPI, built on [Elmo](https://github.com/elmohq/elmo).

**Prototype v0.1:** collect answers from real, signed-in Chrome sessions, inspect the original answer and visible source links, and distinguish collection failures from missing brand mentions. Independent project; not affiliated with Profound.

## Try the browser experiment first

Requires Node.js 22+, Chrome, and [BeatBrowser](https://github.com/BeatAPI/beat-browser) connected to your own browser. Check `beat-browser doctor --json` before starting. Sign in to ChatGPT or Gemini yourself.

```sh
node apps/browser-lab/server.mjs
```

Open **http://127.0.0.1:4318**. Choose an engine, enter a neutral question and a brand, then run one observation. Each run opens a fresh background tab and uses the account's currently selected mode. Model versions and location are not pinned. ChatGPT requests temporary chat; Gemini uses a new conversation with the existing account context.

CLI alternative:

```sh
node apps/browser-lab/cli.mjs --engine chatgpt --brand Example --prompt 'Which providers would you recommend for this category?'
node --test apps/browser-lab/core.test.mjs
```

If using a BeatBrowser source checkout, set `BEAT_BROWSER_COMMAND=node` and `BEAT_BROWSER_ARGS_JSON` to a JSON array containing its absolute `src/cli.js` path. No model API key is required for Browser Lab. Browser subscriptions and account limits still apply.

## What works, and what remains

- Local UI, CLI, one-at-a-time UI submissions, answer evidence, visible citations, literal brand mention checks, and separate incomplete/error states.
- ChatGPT: a real existing-tab capture and a complete automated fresh-chat run passed. See [validation notes](docs/open-profound/validation.md).
- Gemini adapter exists; background rendering can remain busy with invisible pending text. It must not be scored as a completed answer until rendered and finished.
- Elmo provider bridge (`beat-browser`) and stored-answer/citation rendering are implemented and unit tested. The full Elmo worker/database path is not yet an end-to-end verified deployment.
- No unattended browser fleet, automatic scheduling, regional sampling, guaranteed model selection, ranking estimator, search-volume dataset, or Profound feature-parity claim.
- Visible hyperlinks are only a subset of possible citations. Collapsed source panels are not expanded; search fan-out is unknown.

Failed, busy, empty, and timed-out runs **do not count as negative brand observations**. The lab's literal mention rate is not Profound's Visibility or Share of Voice metric. Personalization and small samples prevent treating it as a market-wide estimate.

## Connect the Elmo monitoring base

The inherited dashboard, prompt management, competitors, citation analysis, and worker infrastructure remain available. See the [upstream setup guide](docs/open-profound/upstream-readme.md) and `packages/docs/content/docs/developer-guide/`. Full workspace requires Node.js 24 and pnpm 12.4.1; preserve the lockfile and supply-chain settings.

Run Browser Lab and the Elmo worker on the **same host** for the loopback-only bridge. Set the same locally generated `BROWSER_RUNNER_TOKEN` in both processes, then configure:

```dotenv
BROWSER_RUNNER_URL=http://127.0.0.1:4318
SCRAPE_TARGETS=chatgpt:beat-browser,gemini:beat-browser
```

Do not append a model version or `:online`: the browser account controls those settings. Onboarding/analysis still needs a separately configured research provider. Browser collection is serial; overlapping requests return 409 and should be inspected, not blindly retried. The synchronous bridge requires timeouts long enough for consumer UI answers, up to 15 minutes.

## Data and access

The server binds only to loopback, checks Host/Origin, and requires a local token for submissions. It is intended for a trusted single-user workstation, not an internet-facing deployment. Browser cookies and credentials are never exported. Answers, prompts, tab IDs and local run state are stored in gitignored `.open-profound/runs/`, with private file permissions. Do not commit these files. Do not expose the server through a public tunnel.

A failed transport after submission is ambiguous: inspect the original tab before starting another run. Captchas, login prompts and changed page layouts need operator attention. A stopped process may leave an unfinished record; it is not a completed observation.

## Direction

Keep the product and collector interfaces open. Use BeatAPI for optional model-based extraction, content research and optimization workflows as those integrations are built. Browser observation and API simulation must remain separately labeled data sources. No BeatAPI payment integration or mandatory proprietary API dependency ships in this version.

Next: validate repeated observations across engines, align evidence with Elmo's prompt/brand records, then improve scheduling and content workflows based on real usage.

## Attribution and license

MIT. Elmo is the base, imported at commit `2f68b9199a236a4c3d1b5753cbf24f3f2bf088a1`; its history and copyright are preserved. [oneglanse](https://github.com/oneglanse/oneglanse) informed the browser-collector comparison; we did not combine its application/database with Elmo. See [design notes](docs/open-profound/design.md) and the [single-system architecture / Ego Lite review](docs/open-profound/architecture-and-ego.md).
