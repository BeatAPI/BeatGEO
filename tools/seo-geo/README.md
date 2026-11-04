# BeatGEO · SEO & GEO

An integrated **SEO & GEO research workspace**, delivered as a local browser workbench, CLI and portable reports. The GEO core is a repeatable **AI-search visibility probe**. Ask an AI search engine the same buyer questions many times, keep every raw answer, and count what it publicly returned: which brands were mentioned, which sources were cited, which sub-queries it ran. Then turn the counts into a report, run-to-run diffs, and evidence-linked things to investigate.

Zero dependencies. Node.js 20+. MIT. Works as a CLI and as an agent skill (Claude Code, Codex, and any agent that reads `SKILL.md`).

> **Status: v0.3.** The 12 BeatAPI SEO endpoints, cost guards, local key-source binding, offline imports and combined reports are tested with synthetic fixtures and mocked HTTP. No live SEO acceptance or billing verification has been performed. A loopback-only browser workbench now provides key entry, query planning, execution, report history and question review. There is no hosted multi-user account system. Analysis, aggregation, reports, diffs, collection safeguards, offline crawl-log observations and a read-only GA4 connector are tested using synthetic fixtures and mocks. **Live answer collection has not yet been run against any real provider** (a Responses, chat or Anthropic-compatible endpoint, or a gateway). GA browser reports were inspected read-only; the new OAuth/Data API connector still needs real-client authorization and real-property acceptance. Crawl-log parsing is locally tested; no real site-log acceptance has been performed.

## Local browser workbench

```sh
pnpm start
# Open http://127.0.0.1:4317 in your browser.
```

The Chinese browser UI supports key connection, project forms, all 12 endpoints, cost preview, confirmed execution, progress/cancellation, report history, snapshot imports/exports, source-domain research, GEO answer imports, content task status, question editing/export and scoped snapshot comparison. Start with “体验示例报告” without a key or provider calls. Only confirming a query can spend credits.

Keys stay in server memory by default. “在本机记住 Key” explicitly saves the key to a private mode-600 file at `~/.beat-geo/workbench-key.json` (file permissions, not encrypted storage); disconnect removes that saved copy. Reports/projects are saved under `runs/workbench`. The server binds only to `127.0.0.1`, with origin/Host checks and a per-process request token. Do not expose this local single-user server on a public network. Change port with `BEAT_GEO_UI_PORT=4318 pnpm start`.

Read [工作台使用说明](references/workbench.md). Live GEO model collection remains available through the existing CLI; the workbench imports its answer records and exports reviewed question sets.

## SEO + GEO research

Connect your own BeatAPI key source locally. Research a site, selected competitors and AI-cited sources with all 12 SEO endpoints; keep search estimates separate from AI answer counts, GA4 traffic and crawl observations. No keyword, brand configuration or SEO result is injected into the sampled model's prompt.

```sh
# Offline, labelled demo covering all 12 endpoints. No key or network.
node bin/beat-geo.mjs seo --input examples/seo.snapshot.example.json --out ./runs/seo-demo --lang zh

# Edit example domains / keywords before live use. Default is a dry run, no files or requests.
node bin/beat-geo.mjs seo --config examples/seo.project.example.json --budget-usd 1

# Optional persistent local binding: file contains BEATAPI_API_KEY=... and must have mode 600.
# Saves only the key-file path, never copies the secret; API access/balance remain unverified.
node bin/beat-geo.mjs seo connect --key-file /private/path/beatapi.env
# Or: export BEATAPI_API_KEY=... in your own terminal; or use --keychain SERVICE.

# After reviewing scope and current provider prices, explicitly execute into a NEW directory.
node bin/beat-geo.mjs seo --config examples/seo.project.example.json --budget-usd 1 --execute --out ./runs/seo-live --lang zh

# Attach the saved snapshot to an existing GEO answer run, offline.
node bin/beat-geo.mjs analyze --input ./runs/existing-answers --seo-input ./runs/seo-live/seo-input.json --out ./runs/combined --lang zh

# Compare two snapshots with identical request scopes, offline.
node bin/beat-geo.mjs seo diff --base ./runs/seo-old/seo-input.json --head ./runs/seo-live/seo-input.json --out ./runs/seo-changes
```

The integrated report groups website comparisons, topic discovery, competitor/cited-source research, link research and DR history. `seo-actions.json` retains research hypotheses and request evidence; `seo-question-candidates.json` contains editable suggestions requiring review before copying into a versioned question set. Neither artifact triggers content creation, publication or model calls. Opening an exported report makes no API requests.

See [SEO setup, workflows, all endpoints and limitations](references/seo.md). Search traffic and total site visits are different estimates; missing data is unknown, not zero; recorded rankings are not live SERP; keyword search volume is not AI question volume.

## Why not just look at one answer?

One response is an anecdote. Models are non-deterministic, and results shift with model, time, region and account personalization. beat-geo is built around that:

| | |
| --- | --- |
| **Fixed question sets** | Versioned JSON, stable ids, so runs are comparable. |
| **Repeated sampling** | N answers per question. Results are `k/n` counts, never percentages. |
| **Cited-source analysis** | Sources, cited URLs and citation occurrences are counted separately. |
| **Community and fan-out discovery** | Which Reddit communities and which sub-queries keep showing up. |
| **Run-to-run diffs** | Both denominators kept; small samples flagged, not trended. |
| **Evidence-linked next steps** | Every suggestion carries the counts it came from, and is labelled a hypothesis. |
| **Multi-engine sampling** | Run the same questions on several models/providers and compare them side by side. |
| **Import mode** | Analyze responses you collected elsewhere, without another request. |
| **Spend-capped** | Live collection requires `--budget-usd`. The worst case of the whole plan must fit the budget or nothing is sent; spend is tracked while running and stops at the cap. |
| **Safe by default** | `run` is a dry run; live collection needs `--execute`, a request cap, a budget, and a key in the environment. |

## Connect existing GA4 analytics

Use GA for AI-attributed human visits, server/CDN logs for crawl observations, and answer sampling for mentions/citations. These are independent evidence sources, not a combined conversion funnel. No additional tracking script or analytics infrastructure is installed.

```sh
# One-time publisher setup: our Google OAuth Desktop client JSON; see references/ga.md.
# Opens system browser for read-only consent, selects property/site, reads last 28 completed days.
node bin/beat-geo.mjs ga connect --client-file /private/path/google-desktop-client.json \
  --out ./runs/ga --lang zh

# Subsequent refresh: reuses authorization (until expired/revoked), no browser scraping.
node bin/beat-geo.mjs ga sync --out ./runs/ga --lang zh

# Offline synthetic demo, no Google account or network required.
node bin/beat-geo.mjs ga --input examples/ga.example.json --out ./runs/ga-demo --lang zh

# Optional: add GA next to an existing answer report (logs can also be attached).
node bin/beat-geo.mjs analyze --input ./runs/existing-answers \
  --ga-input ./runs/ga/ga-input.json --out ./runs/answers-with-ga --lang zh
```

The report shows AI-attributed sessions, engaged sessions, configured key events, platforms, landing pages and source evidence, using the existing report theme. Exact hostname filtering and explicit AI domains supplement GA's native `AI Assistant` channel; custom channel labels alone do not establish AI origin. Dates are resolved in the GA property timezone and retained in the snapshot. Source totals do not add landing-page rows or sum unique users. API sampling, thresholds and data restrictions remain visible.

Outputs: `ga.json` (summary), `ga-input.json` (replayable aggregate export), `report.html`, `report.md`. Authorization uses `analytics.readonly`, loopback callback + state/PKCE and private local credential storage **outside the repository**. It does not modify GA settings. `ga sync` refreshes on demand; there is no background scheduler or web connection form. First setup needs our Google client and API enablement; browser login alone is not a persistent product connection. See [GA connection guide](references/ga.md).

## Observe AI requests to your site

**A website URL alone cannot show past crawler visits.** The current workflow is: identify your site → supply its server/CDN access log → generate a report. This workspace provides a CLI and generated reports, not a website-connection form or automatic log collector. Crawler requests are separate from AI referral sessions read through GA above. [中文使用引导](references/getting-started-zh.md).

Import an existing **site-specific** Nginx/Apache Combined log, JSON array or JSONL file. This runs offline, needs no API key, and uses the existing HTML/Markdown reports. It shows declared crawler identities, requested paths, first/last visits, HTTP statuses and request evidence (input row numbers).

```sh
# Clearly labelled synthetic example; no real traffic or network requests.
node bin/beat-geo.mjs crawls --input examples/crawls.example.json \
  --site example.com --out ./runs/crawls-demo --lang zh

# Your existing, site-specific access log. Use a separate output directory.
node bin/beat-geo.mjs crawls --input /path/to/access.log \
  --site your-site.example --out ./runs/crawls --lang zh

# Put crawl observations next to an existing answer run, without recollecting answers.
node bin/beat-geo.mjs analyze --input ./runs/existing-answers \
  --crawl-log /path/to/access.log --site your-site.example \
  --out ./runs/answers-with-crawls --lang zh
```

Outputs are `crawls.json`, `report.html` and `report.md`; combined answer reports also retain `summary.json` and `actions.json`. Add `--format combined|json|jsonl` when needed. `.jsonl` and `.ndjson` extensions select JSONL automatically; otherwise auto detection distinguishes JSON from Combined. Optional `--from` / `--to` accept ISO timestamps with timezone and select a half-open event-time window (`from ≤ time < to`); report times use UTC.

The crawl view matches the existing report theme: a compact overview, crawler/page tables and expandable evidence. Wide tables scroll within the report on small screens; additional rows remain accessible, and Markdown/JSON keep complete results.

The initial catalogue contains 11 documented identities across OpenAI, Anthropic, Perplexity and Kimi. Search, training and user-triggered purposes are separate. **Identity remains unverified:** a matching UA can be copied, and this version performs no IP/DNS verification. No matches means none of these declarations appeared in the imported records, not that no AI visited. Log continuity/sampling is unknown; an event extent does not establish continuous coverage, and a request does not prove indexing, training or answer citation.

Combined logs lack a host field, so use a log belonging only to the configured site. JSON can supply `host`; other hosts are excluded. Query strings/fragments, IPs, full UAs and referrers are not exported. Query variants are grouped under their path. Repeated input rows remain separate requests; reports for overlapping files must not be added together. Invalid rows are counted with row/line numbers and safe reason codes; entirely invalid input writes a diagnostic report and exits 1. Input is limited to 10 MiB / 50,000 records. See [crawl input and evidence rules](references/crawl-logs.md).

## Quick start

```sh
git clone https://github.com/BeatAPI/BeatGEO.git
cd BeatGEO/tools/seo-geo
pnpm test
node bin/beat-geo.mjs demo --out ./runs/demo     # synthetic data, clearly labelled
open ./runs/demo/report.html
```

### Live run

```sh
export BEAT_GEO_API_KEY=...            # never commit or paste a key
# on macOS you can leave the key in the Keychain and read it into memory only:
#   --keychain <service> [--keychain-account <account>]
# or keep it in a file only you can read and pass --key-file:
#   printf 'BEAT_GEO_API_KEY=<your key>\n' > ~/.beat-geo.env && chmod 600 ~/.beat-geo.env
# optional: export BEAT_GEO_BASE_URL=https://your-provider.example/v1

# 0. Optional: check engines, pricing and keys (names only, never values). Sends nothing.
node bin/beat-geo.mjs doctor --engines engines.json          # ~/.beat-geo.env is read automatically if it exists

# 1. Dry run: prints the plan, key status, the itemized worst-case cost and a READY / NOT READY verdict (exit 2 when not ready).
#    Sends nothing, writes nothing, needs no --out.
#    Use --only id1,id2 to run some of the declared questions unchanged.
node bin/beat-geo.mjs run --questions examples/questions.example.json \
  --config examples/brands.example.json --model <model> --repeats 5 --out ./runs/2026-01-01 \
  --price-in <USD/Mtok> --price-out <USD/Mtok> --price-search <USD/call> --budget-usd <USD>

# 2. Same command plus --execute to actually collect. Each request may be billed by your provider.
#    --execute is refused without --budget-usd and per-engine pricing.
node bin/beat-geo.mjs run … --execute
```

`--max-requests` (default 50) and `--budget-usd` are both hard caps: a plan above either is refused even with `--execute`. Requests are made once each; a failure is recorded as a failure and never replaced with demo data. Each record is written as soon as it returns, so an interrupted run keeps what it already collected.

### Spend control

Live collection will not start without a budget, and every engine needs the rates you copy from the provider's price page:

```sh
node bin/beat-geo.mjs run … --engines engines.json --budget-usd <USD>            # dry run prints the worst-case cost
node bin/beat-geo.mjs run … --engines engines.json --budget-usd <USD> --execute
```

- **Pre-flight:** worst case per request = input tokens + `maxOutputTokens` + `maxSearchCalls × perSearchCall`, summed over the plan. Input tokens include the text each search injects into the context, which every later round re-reads: `(searches+1) × question + searchResultTokens × searches × (searches+1) / 2`. `searchResultTokens` (default 6000 per search) is an assumption you can set per engine. If it exceeds the budget, nothing is sent.
- **Runtime:** each request reserves its worst case before it is sent, then is replaced by the cost computed from the provider's reported `usage`. If usage is missing the worst case is charged. Timeouts and network errors are charged at worst case; HTTP error responses at zero. When the next request would break the budget, the run stops, keeps what it has, and says how many requests were not sent.
- **Caps are sent to the provider** (`max_output_tokens` and `max_tool_calls` for Responses, `max_tokens` for chat) and cannot be overridden through `extraBody`. If a provider rejects `max_tool_calls`, set `"sendSearchCap": false` on that engine; the runtime guard still applies.
- If a provider ignores a cap, the run prints a WARNING, reserves the observed cost for later requests to that engine, and stops sooner. If the estimate still ends above the budget it prints `OVER BUDGET` and exits 3 (outputs are written). Cached input can be priced with `pricing.cachedInputPerMTok`; otherwise it bills at the full input rate. `analyze --engines FILE` re-prices raw responses offline.
- `budget.json` and the report record the estimate. It is **an estimate from your rates and the provider's reported usage, not a bill**. Providers can ignore caps and change prices, so also set a spending limit in the provider's console.

For a first live check, run a pilot: a small run such as two questions × all engines × one repeat (`--only`), with lowered `--max-output-tokens` / `--max-search-calls` if the worst case does not fit your budget. Its counts are a smoke test, not results.

### Capture answers from AI products in a browser

To measure what people actually see in ChatGPT, Claude, Gemini, Grok, Perplexity and similar products, save one capture per answer (`beat-geo template` prints the format) and analyze the folder. No API key or API spend is involved. The protocol (new conversation each time, exact question text, record only what is visible) is in [SKILL.md](SKILL.md#browser-capture).

```sh
node bin/beat-geo.mjs analyze --input ./captures --questions questions.json --config brands.json --out ./runs/browser
```

`analyze` refuses records whose question text differs from the declared question set, so the questions cannot drift between engines.

### Analyze responses you already have

```sh
# raw provider JSON needs the exact question that was asked
node bin/beat-geo.mjs analyze --input response.json --question "What is the best…?" \
  --config brands.json --out ./runs/imported

# records produced by a previous run
node bin/beat-geo.mjs analyze --input ./runs/2026-01-01 --config brands.json --out ./runs/2026-01-01-reanalyzed
```

### Compare two runs

```sh
node bin/beat-geo.mjs diff --base ./runs/2026-01-01 --head ./runs/2026-02-01 --out ./runs/diff
```

Add `--lang zh` to any command that writes a report for Chinese output.

## Comparing models: three collection lanes

The same question can reach an answer three different ways, and they answer different questions. Beat Geo records which one you actually got, from the response itself rather than from your configuration:

| Lane | What it is | What the counts mean | Supported in v0.1 |
| --- | --- | --- | --- |
| **Native search** | The provider runs its own web search and returns citations (a Responses-compatible `web_search` tool, or citations in the response). | What this engine retrieves and cites: the real GEO signal. | Yes |
| **No search** | The same or another model answered from its own knowledge. | Brand awareness in the model itself. Mentions can appear, but there are no sources to cite. | Yes (use `--api chat` with no search tool) |
| **Tool-augmented** | A text model that you give your own search tool and run in an agent loop. | What the model says *given the results of your tool*. It measures your tool plus the model, not the provider's native retrieval. | Import only: collect the answers elsewhere, then `analyze` them. The collector does not run tool loops. |

The report shows **Searched in k/n** (the provider ran a search) and **Search evidence in k/n** (a real source or cited URL came back). A search that returned nothing is searched but not evidence, and an answer without evidence should not be read as a retrieval result.

```sh
# same questions on several engines; each engine names the ENVIRONMENT VARIABLE holding its key
node bin/beat-geo.mjs run --questions questions.json --config brands.json \
  --engines examples/engines.example.json --repeats 5 --out ./runs/2026-01-01           # dry run
node bin/beat-geo.mjs run … --execute                                                    # collect
```

The request plan is `questions × engines × repeats` and is checked against `--max-requests` before anything is sent. All keys are checked first: if one is missing the run stops and names the variable, not its value. An `apiKeyEnv` that looks like a key instead of a variable name is rejected.

## Engines

The collector talks to any endpoint that exposes:

| `--api` | Endpoint | Expected response |
| --- | --- | --- |
| `responses` (default) | `POST {base}/responses` with a `web_search` tool (`--tool-type` to change) | `output[]` with `web_search_call` items and `url_citation` annotations |
| `chat` | `POST {base}/chat/completions` | message text with `url_citation` annotations, or top-level `citations` |
| `messages` | `POST {base}/messages` (Anthropic-compatible) with a web search server tool, `x-api-key` by default (`authStyle: bearer` to change) | `server_tool_use` and `web_search_tool_result` blocks, text blocks with `web_search_result_location` citations |

For a single engine, point `--base-url` / `BEAT_GEO_BASE_URL` at a compatible provider or gateway and set `--engine` to a label. For several, use `--engines FILE` (see `examples/engines.example.json`). Providers that return top-level `citations` only (no per-call search actions) are supported, and the report notes what such responses cannot show. Whether a given provider or model performs web search through these endpoints depends on that provider; check its documentation.

## What the report contains

Per-question and overall: who was mentioned (`k/n`), whose own pages were cited, the most cited domains by type (own, competitor, reddit, github, youtube, …), Reddit communities surfaced, recurring sub-queries, provider warnings, failed requests, and the next steps to investigate. HTML is self-contained and escapes all imported text; Markdown is included too.

## Evidence rules

See [references/evidence-rules.md](references/evidence-rules.md). In short: only publicly returned search actions, sources and citations; no hidden-reasoning claims; a source is not a citation; a mention is not a recommendation; missing means "not returned".

Brand configuration is **analysis-only**. It is never sent to the model, so the probe does not steer the answers it measures.

## Limits

- A snapshot of one engine, model and time, not a visibility rate, search volume or ranking guarantee.
- Personalization, region and model updates change results. Repeat sampling reduces noise but does not remove it.
- Domains are hostnames without `www.`; there is no public-suffix list.
- Next-step suggestions are hypotheses derived from counts. They do not explain why a model chose a source, and a frequently cited community is a place to read its rules first, not a target for promotion.

## Use as an agent skill

`tools/seo-geo/SKILL.md` is this module’s agent entry point. Read it with the working directory set to `tools/seo-geo`. The skill instructs the agent to run a dry run first and to ask before spending on `--execute`.

## Data formats

See [references/data-contract.md](references/data-contract.md).

## License

MIT
