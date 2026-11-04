# BeatGEO SEO & GEO integration

Implemented 2026-10-31. Provider contract and price reference: https://docs.beatapi.io/zh/seo (prices checked 2026-10-31). The implementation is a local Node.js browser workbench + CLI + self-contained HTML/Markdown reports, not a hosted SaaS. See `references/workbench.md` for the browser interface. No live SEO endpoint calls or actual billing checks were performed during development.

## User workflow

1. Pick your website, market, keywords, and a small explicit list of competitor/source domains. No automatic expansion to all competitors or all AI-cited domains.
2. Bind a local credential source or supply `BEATAPI_API_KEY` in your environment.
3. Run a dry plan, review itemized scope and maximum estimated charges.
4. Execute explicitly into a new directory. Each completed request is saved atomically, so partial results survive a later failure.
5. Attach the SEO snapshot to an existing answer run with `analyze --seo-input`. This performs no network calls and preserves the original model questions.
6. Review evidence-linked content research tasks and editable question candidates. Confirm candidates manually and create a new version of your question set before collecting new answers.
7. Refresh by executing a new run into a new directory. Compare snapshots with `seo diff`. Fetch dates are not source observation dates; source updates can change results independently of your work.

## Credential binding

```sh
# Your private file contains BEATAPI_API_KEY=...; create it outside the repository.
chmod 600 /private/path/beatapi.env
node bin/beat-geo.mjs seo connect --key-file /private/path/beatapi.env --connection work
node bin/beat-geo.mjs seo status --connection work
node bin/beat-geo.mjs seo disconnect --connection work

# Or bind an existing macOS Keychain item, without exporting the secret:
node bin/beat-geo.mjs seo connect --keychain beatapi --keychain-account your-account
```

Bindings live at `~/.beat-geo/seo/NAME.json`, mode 600, and contain only an environment-variable name / private file path / Keychain reference. `connect` checks that a local key can be read; it does not contact BeatAPI or validate permissions or credit. `status` reports the saved source, not online validity. `disconnect` removes the local reference, not the provider key or private env file. Default environment variable is `BEATAPI_API_KEY`; `--keychain-var CUSTOM_ENV_NAME` selects another name. Environment values take precedence. Named connections must exist. No key values belong in project config, reports or chat.

The collector always targets `https://api.beatapi.io/v1/seo/`; redirects are rejected. There is no configurable proxy URL that could accidentally receive the key. Responses containing the actual supplied secret are rejected; arbitrary provider errors and unknown response fields are not exported.

## Project configuration and workflows

See `examples/seo.project.example.json`. Example domains and values are illustrative; replace them before live use.

| Workflow | Endpoints | User task |
|---|---|---|
| `overview` | `domain-overview`, `domain-rating`, `site-traffic` | Website and competitor background |
| `topics` | `keyword-ideas`, `keyword-overview` | Discover and evaluate seed themes |
| `research` | `competitors`, `ranked-keywords`, `top-pages` | Research selected competitors and AI-cited sources |
| `links` | `backlink-summary`, `backlinks` | Investigate link profile and referring pages |
| `history` | `domain-rating-history` | Read historical monthly rating |
| `difficulty` | `keyword-difficulty` | Difficulty-only lookup when other fields are unnecessary |
| `all` | All 12 | Explicit internal endpoint coverage; includes redundant difficulty data |

Default workflows are `overview` and `research`. Domains are explicit: project `site`, `competitors[]`, `sources[]`. Each selected domain tool runs once per unique domain. Keyword tools run once per seed batch, not once per domain. Tool/data repetition within one plan is deduplicated. `all` is explicit, never selected just because a key was bound.

`country` defaults to `us`; `language` is optional and defaults upstream to the market's language. Country coverage and country/language compatibility are ultimately validated by BeatAPI. `cn` is rejected locally. Global tools never receive market parameters. Default list `limit` is 20; project example uses 10. There is no automatic pagination. A topic workflow requires 1–20 seeds because `keyword-ideas` has that limit; overview/difficulty alone accept 1–100 keywords. Dates and volume refer to Google search data, not AI question popularity.

For precise filters, pagination, mixed markets or one-domain actions, use explicit requests. Workflow-wide fields cannot be combined with `requests` to prevent silently ignored settings:

```json
{
  "site": "acme.example",
  "requests": [
    { "tool": "ranked-keywords", "input": { "domain": "zeta.example", "country": "us", "language": "en", "contains": "image", "limit": 20, "offset": 0 } },
    { "tool": "backlinks", "input": { "domain": "zeta.example", "limit": 10, "one_per_domain": true } },
    { "tool": "site-traffic", "input": { "domain": "acme.example", "months": 6 } }
  ]
}
```

`contains` is case-insensitive substring matching, not exact keyword rank tracking. Query with the filter and inspect returned keywords; absence in a partial result is not proof of no ranking. Unknown parameters fail locally. `site-traffic` supports 3/6/12 months; DR history has no month selector.

## Cost and failure handling

- SEO is separately budgeted from AI sampling. `--execute` requires positive `--budget-usd` and an available key. A plan exceeding its budget or `--max-requests` is refused before network activity.
- Catalog prices are checked-in estimates, not a permanent billing guarantee. Recheck provider pricing before live use. DR history reserves 24 months ($0.096); actual returned months determine the provider charge, with the documented minimum for no data.
- The example's all-tools plan, two domains, two seeds and list limit 10 has 21 requests and a $0.5772 estimated maximum at the recorded prices. This is an estimate, not a test bill.
- `--max-requests` (default 50) counts actual HTTP sends including retries. A retry can leave later planned queries unsent; the partial report records stoppage.
- `usage.price_usd` is retained as the provider-reported charge. Missing usage or ambiguous failures reserve the planned maximum and remain marked unknown. 400/503 release the reservation, according to documented non-billing. Other errors conservatively retain it.
- Only retryable 429/500/503 responses get one retry; the same operation reuses its idempotency key. Retry delays above five seconds are not waited out automatically. Timeouts, malformed responses and transport failures are not retried automatically because the first request may have completed. The fixed request timeout defaults to 30 seconds; `--timeout-ms` may be at most 120000.
- A price above the per-request estimate stops further collection. Actual charges can exceed an estimate before the client can stop; set provider-side limits too.
- 401/402/403 stop the run. Other failures remain visible alongside successful records. No failure becomes synthetic data. Partial/failed CLI collection exits nonzero.
- Each response is checkpointed in `seo-input.json`. A new explicit run uses a new idempotency key and may be billed again. There is no cross-process automatic resume, persistent response cache, scheduled refresh or claim of exactly-once billing. Re-render saved snapshots offline instead of re-querying for presentation changes.

## Output contract

- `seo-plan.json`: normalized requests and estimated maximum costs, live runs only.
- `seo-input.json`: replayable `beat-geo/seo-snapshot@1` with site, synthetic marker, created time, request records, stoppage and collection metadata. Records retain normalized input, fetch time, status, safe response fields, request ID, reported charge when present and conservative reservation.
- `seo.json`: sanitized `beat-geo/seo-summary@1` for report rendering. Import `seo-input.json`, not this summary.
- `report.html` / `report.md`: standalone SEO report or combined GEO/SEO report through `analyze --seo-input`.
- `seo-question-candidates.json`: candidates, source keyword/market/search volume, source record ID and `reviewRequired: true`. Candidate strings are templates, not model-generated finished questions. Copy edited approved questions into a normal question set; this file is deliberately not accepted as one.
- `seo-actions.json`: content research hypotheses from returned competitor/source ranking pages, with request IDs, timestamps and, in combined reports, the same-domain AI citation count and sample denominator.
- `seo diff`: `seo-diff.json` and Markdown report compare matching normalized request identities only. Comparable scalar metrics and common keyword/page rows retain both values, deltas and fetch times; ranked rows preserve source times and old/new URLs. New or missing rows in partial pages are not labelled ranking gains/losses.

Supported public fields are projected into the snapshot. Unrecognized fields and arbitrary HTTP error messages are deliberately discarded. Imports have a 20 MiB limit and 1200-record limit; response lists allow at most 1000 rows. Duplicate requests in a snapshot are rejected rather than summed. Provider task retrieval via `GET /v1/tasks/{id}` is not automated; retained request IDs can be used for support/recovery separately.

## Evidence boundaries

Search estimates, AI answer counts, GA4 sessions and crawls retain distinct meanings. No aggregate GEO score or causal claim is calculated. No added SEO context is sent to the original answer collector. Search competitors require user confirmation before becoming business/brand competitors. Domain SEO performance does not establish why an engine cited a page. Missing data is unknown, not zero. Keyword volume does not estimate question volume in AI assistants. DR and link authority use different scales. Third-party `gen_ai` channel share is not GA4-measured traffic. Totals from different datasets, markets or periods are not summed. Exact domain joins do not silently merge different subdomains.

The 12 endpoints do not fetch page body content, perform technical site audits, or write/publish content. Research tasks link the evidence needed for the next decision. The static report is offline and does not contain a secret-bearing query button. Local key entry and on-demand queries are available in the workbench. Hosted login, tenant isolation and scheduled collection are not implemented.

## Validation

Run `pnpm test`. The SEO tests mock HTTP, exercise all endpoints, budget and credential guards, retries, malformed responses, missing data, report escaping, offline imports, combined reports and scoped snapshot comparison. Example results are visibly synthetic. Live access, data quality and billing acceptance remain unverified until a separately authorized pilot.
