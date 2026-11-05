# Search analysis

The Search diagnosis tab under Opportunities combines actual Search Console query × page observations, GA Google-organic page context, matching saved SEO keyword research, and captured page text. Rules produce review candidates; neither low CTR nor multiple pages for a query proves a content problem. CMS publication and weekly reporting are outside this workflow.

## User flow

1. In Brand settings, authorize Google and select the matching GSC/GA properties. Refresh Search Console or acquisition data. Existing AI referral reports remain available.
2. Search Console includes query × page, date and date × page views, filters and pagination. GA includes all-channel acquisition, organic landing pages and Google-organic landing pages. Each offers current/previous periods.
3. In Opportunities → Search diagnosis, refresh sources or import the latest completed non-demo SEO workbench run. No paid SEO request is made by importing it; new paid research remains an explicit workbench operation.
4. Review candidates and evidence history. Read a candidate page before drafting. Create SEO action freezes the diagnosis and supporting evidence IDs; it requires no fabricated AI monitoring question.
5. Under Actions & retests, generate an outline or request a paid AI draft explicitly, edit and approve its exact revision, then record the real implementation separately. There is no publishing action.
6. After a full comparable period, refresh GSC. The action shows descriptive click movement only when property, query, page and window length match and the new full window is after implementation. Missing rows stay unknown.

## MCP contract

| Tool | Access | Behavior |
| --- | --- | --- |
| `get_analysis_context` | read | Saved source IDs, original observation times, age, missing sources and candidates. Use `get_workspace` for existing GEO answer evidence. |
| `read_analysis_evidence` | read | Omit `evidenceId` to list history. Otherwise read up to 100 rows using `offset`, `limit`, `dataset`; includes requested-period coverage and source metadata. |
| `diagnose_site` | read | Recompute deterministic candidates from selected immutable IDs (one snapshot per Google source), or latest snapshots. No fetch, persistence or model call. |
| `refresh_analysis_data` | write | `mode=preview/execute/status`; fixed `plan.source=gsc/ga/pages/saved_seo`. Execute requires an idempotency key. Status requires a command ID. |

GSC datasets: `current.queryPages`, `current.daily`, `current.dailyPages`, `current.pages`, `current.queries` (and the same with `previous.`).
GA datasets: `current.channels`, `current.organicPages`, `current.googleOrganicPages` (and `previous.`).
Other evidence types use `records`. Every ID is checked against the authorized brand before reading it. Credentials, SQL, local storage paths and raw provider errors are not returned.

The existing `apply_workspace_command` adds:

```json
{"type":"save_diagnosis","evidenceIds":["<snapshot UUID>"]}
{"type":"create_seo_action","diagnosisId":"<saved diagnosis UUID>","findingId":"low_ctr:0"}
{"type":"compare_seo_action","actionId":"<SEO action UUID>"}
```

The same `save_draft`, `review_draft`, and `record_implementation` operations handle SEO and GEO actions. `retest_action` remains the GEO browser-collection operation and rejects SEO actions.

## Evidence and comparison rules

- Migration `0030_search_analysis` adds append-only application evidence records and SEO action baselines. A failed Google collection leaves both the latest successful snapshot and archived history intact. Removing Google authorization does not erase saved analysis history; deleting the brand cascades its evidence.
- GSC defaults to 28 complete days ending four days before today in Search Console's Pacific timezone, plus the immediately preceding equal period. Only web search and final data, all countries/devices, are requested. Joint/daily datasets stop at 2,000 stored rows; aggregate page/query views retain the existing 10,000-row bound. Google can omit anonymous queries or return top rows even below these limits. Do not sum detail into site totals or fill missing dates with zero.
- GA defaults to 28 days through yesterday in the property's timezone and an equal preceding period. Each new report stores at most 2,000 rows, source row counts and threshold/sampling/restriction flags. Existing AI-referral reports retain their 50,000-row upper bound. Session key event rate is read from GA, never computed as events divided by sessions. Event configuration is not verified by these reports.
- GSC clicks, GA sessions and SEO search-volume estimates are distinct measurements. Page-level events never imply keyword-level conversions. GA context attaches only to the exact hostname/path and skips parameterized GSC URLs because GA's landingPage omits query strings.
- Rule v1: ≥100 impressions with position ≤10 and CTR <2%; ≥100 impressions with position >10 and ≤20; >30% click decline with ≥20 prior clicks on the same query/page; multiple observed pages each with ≥50 impressions for one query. These are configurable-in-code review heuristics, not predicted gains or universal CTR benchmarks. At most 50 candidates are returned, the dashboard initially shows 20.
- Captured pages are restricted to at most three current candidates on saved brand hostnames and use the existing public-network/SSRF-safe fetcher. Script, style and navigation content is excluded; text is bounded to 16,000 characters and treated as untrusted evidence. No scripts or embedded instructions are executed.

## Refresh execution

To keep the local product simple, the first version reuses durable workspace commands and **awaits** refresh in the request; it does not add a new worker queue. Network work is bounded by request counts and a three-minute Google fetch deadline. Preview is free and causes no network work. Defaults include current/prior periods; there is no arbitrary SQL, custom Google query or automatic schedule.

On a lost response, reuse the exact idempotency key. Completed commands replay saved results without network calls. Failed/interrupted commands never silently retry. If the process stopped during an in-flight request, inspect `get_workspace` history and source snapshots before issuing a new key. Page refresh returns per-page availability; a completed command can contain unavailable pages.

## Validation

Run `pnpm lint`, package type checks, `pnpm test:mvp`, `pnpm test:seo` and the `search-performance.stories.tsx` browser tests. The MVP runner creates a disposable bundled PostgreSQL instance and applies migrations only there; it does not modify the owner's database. Synthetic Google responses verify the contract, not live Google authorization, quota, event setup or actual ranking improvements. Real-account refresh and production database migration require separate acceptance.
