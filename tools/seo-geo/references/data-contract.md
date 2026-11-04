# Data contract

Offline site-log observations have a separate [crawl-log contract](crawl-logs.md). They never enter the answer record denominator. `analyze --crawl-log FILE --site HOST` adds an optional `summary.crawls` (`beat-geo/crawl-summary@1`) and `crawls.json`, using the same report renderers.

GA has a separate [GA contract](ga.md): `ga-input.json` (`beat-geo/ga-export@1`) retains resolved dates, hostname, property identity and fixed-column Data API reports; `ga.json` (`beat-geo/ga-summary@1`) contains platform/source/landing views and quality warnings. `analyze --ga-input FILE` adds `summary.ga`, without changing answer counts or merging traffic into crawler requests. GA credential files are never valid answer records or report inputs.

## Question set

```json
{ "questions": [ { "id": "best-generator", "text": "What is the best AI image generator?", "group": "category" } ] }
```

`id` must be unique and stable. A bare array of strings is also accepted (ids become `q1`, `q2`, …).

## Brand config (analysis only, never sent to the model)

```json
{
  "brand": { "name": "Acme", "aliases": ["Acme Studio"], "domains": ["acme.example"] },
  "competitors": [ { "name": "Other", "aliases": [], "domains": ["other.example"] } ],
  "categories": { "docs": ["readthedocs.io"] }
}
```

Every part is optional; an empty config still analyzes sources and queries. `categories` extends the built-in map (reddit, youtube, github, x, hackernews, stackoverflow, medium, linkedin, wikipedia).

## Engine file (`run --engines FILE`)

```json
{ "engines": [ {
  "id": "openai", "label": "OpenAI (native web search)",
  "api": "responses | chat | messages", "baseUrl": "https://api.openai.com/v1", "model": "<model>",
  "toolType": "web_search", "includeSources": true, "apiKeyEnv": "OPENAI_API_KEY",
  "pricing": { "inputPerMTok": 1.0, "outputPerMTok": 2.0, "perSearchCall": 0.01 },
  "maxOutputTokens": 1500, "maxSearchCalls": 3, "searchResultTokens": 6000, "sendSearchCap": true
} ] }
```

`apiKeyEnv` is the **name** of an environment variable. A value that is not a valid variable name (for example an actual key) is rejected. `api: "messages"` sends `x-api-key` and `anthropic-version` (`authStyle` and `anthropicVersion` override) and defaults `toolType` to `web_search_20250305`. `baseUrl` defaults to `BEAT_GEO_BASE_URL`, then `https://api.openai.com/v1`. `extraBody` (optional object) is merged into the request body, but the token and tool-call caps always win. `searchResultTokens` (default 6000) is how much text one search is assumed to add to the context; it is billed as input and re-read by later rounds, so it drives the input side of the worst-case estimate. `pricing.cachedInputPerMTok` (optional) prices cached input tokens; without it they bill at the full input rate. `pricing` (USD; copy from the provider's price page; optional `source` and `note` strings are shown in the report) is required for live runs together with `--budget-usd`; the values above are illustrative, not real prices. Zero rates make the cost estimate zero and defeat the budget, so only use them for genuinely free engines.

## Record — `records/*.json` (one per collected answer)

```json
{
  "schema": "beat-geo/record@1",
  "questionId": "best-generator",
  "question": "…exact text sent…",
  "engine": "openai",
  "engineLabel": "OpenAI (native web search)",
  "model": "…",
  "repeat": 1,
  "collectedAt": "2026-01-01T00:00:00.000Z",
  "source": "live | import | demo",
  "response": { "…unmodified provider response…" },
  "error": { "status": 500, "message": "…redacted, truncated…", "request": "POST /responses fields: model, input, tools[web_search], …" }
}
```

Exactly one of `response` / `error` is present. The response is stored unmodified so a run can be re-analyzed without another request.

## Accepted response shapes

| Shape | Detected by | Provides |
| --- | --- | --- |
| Responses API | `output[]` | search calls (queries, sources), message text, `url_citation` annotations |
| Anthropic Messages | `type: "message"` and `content[]` | `server_tool_use` (query), `web_search_tool_result` (sources), text blocks with `web_search_result_location` citations |
| Chat Completions | `choices[]` | message text, `url_citation` annotations or top-level `citations` |
| Top-level citations | `citations[]` | cited URLs (+ `output_text` if present) |

The last two carry no per-call search actions; the report says so.

## Outputs

- `budget.json` (live runs) — `{ sent, skipped, stoppedByBudget, budgetUsd, estimatedSpentUsd, overBudget, overruns[], worstCaseTotalUsd, rates[] }`; `overruns[]` lists requests that cost more than their worst case (`engine`, `questionId`, `actualUsd`, `worstCaseUsd`, `toolCalls`, `maxSearchCalls`), also copied into `summary.spend`. An estimate, not a bill. Records carry `costUsd`.

- `summary.json` — `beat-geo/summary@1`: `overall` and `questions[id]`, each with `n`, `failed`, `entities[]` (`mentioned`, `ownedCited`, `mentionsTotal`), `domains[]` (`answersCited`, `answersSourced`, `category`), `queries[]`, `subreddits[]`, `warnings[]`, `searched` (answers where a search ran), `grounded` (answers with search evidence: a real source or cited URL), `verbatimQueries` (queries that repeat the question) and `byEngine[]` (`id`, `label`, `model`, `n`, `failed`, `grounded`, `entities[]`); plus `sources[]` and `failures[]`.
- `actions.json` — array of `{ type, questionId, n, lowSample, title, evidence, suggestion }`. Types: `absent`, `engine-gap`, `mentioned-not-cited`, `competitor-cited`, `frequent-source`, `community-source`, `fan-out-topic`. These are hypotheses.
- `report.html` (self-contained, escaped) and `report.md`.
- `diff.json` / `diff.md` — `beat-geo/diff@1`.
