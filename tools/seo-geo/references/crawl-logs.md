# AI crawl observations

`crawls --input FILE --site HOST --out DIR [--lang zh]` analyzes an existing site log offline. `analyze --crawl-log FILE --site HOST …` adds the same observations to an answer report. It never sends a model request or fetches identity feeds. Use a separate output directory, and keep logs separate from answer `records/` folders.

A URL only selects the site; it does not supply traffic history. Obtain the site's access log from its server/CDN or its maintainer first. This version has no automatic data-source connection or URL-only onboarding form. Reports label imported/synthetic snapshots and distinguish crawler declarations from AI referral visitors, which are not measured. See the [Chinese getting-started guide](getting-started-zh.md).

## Input

Supported formats: standard Nginx/Apache Combined; JSON array; `beat-geo/logs@1` envelope; JSONL (one record per nonblank line). Auto detects JSON versus Combined; `.jsonl`/`.ndjson` filenames choose JSONL, or pass `--format jsonl`. Custom Nginx formats, arbitrary CDN exports and compressed files must be converted first.

JSON records require `time` (or `timestamp`), `path` (or `url`), uppercase `method`, integer `status` 100–599 and `userAgent` (or `user_agent`). Time requires ISO timezone information. Optional `host` (or `hostname`) must match the configured hostname exactly, including subdomain. A complete HTTP(S) URL is also checked against that host. Other-host rows are excluded, not silently assigned to the site. A missing host is attributed to configuration and labelled accordingly; the log must be site-specific. The tool does not inspect or trust forwarded-IP headers.

```json
{
  "schema": "beat-geo/logs@1",
  "synthetic": true,
  "records": [{
    "time": "2026-10-25T08:00:00Z",
    "host": "example.com",
    "path": "/docs",
    "method": "GET",
    "status": 200,
    "userAgent": "OAI-SearchBot/1.0"
  }]
}
```

`synthetic: true` labels fixture input and all generated report views. Omit it for real logs. IP and full UA values are not retained; the UA is only used in memory for token recognition. Additional input fields, including self-reported `verification`, are not trusted or exported. The tool does not copy the source log.

## Evidence and counting

- Catalogue: `beat-geo/crawlers@1`, reviewed 2026-10-26; 11 identities from four operators. Entries retain official documentation and review date in `crawls.json`. Other agents may remain unrecognized, including those with ordinary browser UAs.
- A complete token with punctuation boundaries matches a declaration. Lookalike token names do not match; multiple different supported tokens in one UA are ambiguous and excluded from identity totals, with separate row evidence.
- Every matched request has `verification: unverified`; `verifiedRequests` is null, meaning not measured. No IP range, DNS or trusted-edge verifier is implemented in this version.
- Count input requests, not answer samples or users. Identical rows are retained as separate requests. The SHA-256 binds the exact input; rerunning produces a new snapshot rather than appending data. Different overlapping imports are not automatically deduplicated.
- GET 2xx, HEAD, 304, denied statuses (401/403/429/451) and 5xx retain their individual meanings. GET 2xx is an HTTP response category, not proof of body completion or content inclusion.
- Paths retain case, percent encoding and trailing slash. Query strings/fragments are omitted, so different parameter-based pages share a path. No full-site coverage or canonical URL equivalence is inferred.
- `--from` is inclusive and `--to` exclusive, both timezone-aware ISO timestamps. All output times are UTC. Future events beyond a five-minute tolerance are invalid. The event extent uses all valid site records within the window; the per-crawler times use only matching declarations.
- `observation.coverage: unknown` always applies to these manual imports. Missing records and unknown sampling cannot establish no visit, continuous coverage or a decline. Requests do not establish indexing, training, answer citation or conversion.
- Invalid rows have safe codes and input indices (1-based JSON array position or physical text line). The first 30 error details are displayed; total rejected count is complete. Entirely invalid input produces a diagnostic report and CLI exit 1. Empty, wrong-host-only or out-of-window input has no observation. Ordinary-browser-only input is a valid observation with no supported crawler match.

## Output

`crawls.json` uses `beat-geo/crawl-summary@1`: `site`, `generatedAt`, `synthetic`, `ruleVersion`, `catalogue`, `input` (SHA-256, format, counts, errors), `observation`, `totals`, `crawlers`, `pages`, `requests` and `ambiguous`. `requests` retain safe time/path/method/status/identity/host-basis facts and input line references. The original input hash plus line number locates the evidence in the user-supplied log.

Standalone mode writes only `crawls.json`, `report.html` and `report.md`. Attached mode additionally stores the same object under `summary.crawls`. Answer counts, budget and derived answer actions remain unchanged. Both report renderers show an independent request section, not an answer-based k/n metric. Reports are self-contained; imported data is escaped.

The crawl view uses the existing Beat Geo report palette, font and table style. Its overview shows declared requests, identities, paths and HTTP error responses; empty/invalid input shows unavailable values rather than measured zeros. Display timestamps use readable UTC seconds; JSON retains ISO timestamps. HTML puts request evidence, rejected records and import/method details in keyboard-operable disclosures. Large main tables preview 12 rows and offer all remaining rows in a disclosure; request evidence previews 30 after expansion. No rows are removed from HTML, Markdown or JSON. Wide tables scroll within their own region on narrow screens. Markdown expands the complete document for export.

## Official catalogue sources

- [OpenAI crawlers](https://developers.openai.com/api/docs/bots): GPTBot, OAI-SearchBot, ChatGPT-User.
- [Anthropic crawlers](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler): ClaudeBot, Claude-SearchBot, Claude-User.
- [Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers): PerplexityBot, Perplexity-User.
- [Kimi crawlers](https://www.kimi.com/policies/kimi-crawlers): KimiBot, Kimi-SearchBot, Kimi-User.

The implementation is local to Beat Geo; GEOInflow supplied the functional reference, not its runtime or database code.
