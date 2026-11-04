# BeatGEO roadmap

[Current scope and implementation checklist — 2026-11-03](beat-geo/browser-geo-plan-2026-11-03.md) is the active plan: website → confirmed question bank → BeatBrowser observations in the user's signed-in browser → evidence-backed improvements → matched retests. GSC, GA and the existing BeatAPI SEO endpoints are optional supporting inputs. [SEO / GEO experience plan](beat-geo/seo-geo-experience-2026-11-03.md) defines the current navigation and saved-data views. Google client setup, remaining GEO work and live acceptance are deferred to the next work session; the checklist is not a completed-feature claim.

[Interactive blueprint](product/flow.html) · [67-item feature inventory](product/features.csv). These describe the target product, not completed functionality.

[2026-10-16 acceptance review](beat-geo/acceptance-2026-10-16.md) records the current test results, Profound gaps, SEO integration boundary and the seven-day live acceptance plan. Run `pnpm test:mvp` for repeatable isolated core regression.

## Available MVP

Independent BeatBrowser tasks, manual brand/questions, ChatGPT/Gemini adapters with stated limits, original answers and visible links, brand/engine/status filters, timeout evidence, export and local agent drafts. The full foundation retains organization, brand, prompt, competitor and report implementations. PostgreSQL and pg-boss now persist collection attempts, answers and citations, frozen action baselines, implementation notes and comparable retests. BeatAPI research supports bounded search/read/model calls; real-key acceptance is still pending.

Default source installation now bundles its own PostgreSQL without Docker. Setup exposes storage and worker health; single-question collection, observed-answer metrics and the reviewed draft workflow share the same database and queue.

## Current product boundary

The source edition focuses on AEO: generate and confirm questions, collect real AI answers, inspect mentions and citations, save evidence-backed improvements, and retest. The main workspace, onboarding, authentication and settings share a dark theme. Recommendations, actions/retests, observed evidence and website checks have separate views.

Desktop packaging and a full desktop client are deferred until the source edition demonstrates adoption and repeatable value. GSC/GA connection code and the existing BeatAPI SEO workbench are available as optional supporting paths, with live authorization/data acceptance still required. They do not gate the question-and-browser workflow. A limited website check supports AEO diagnosis; it is not a full SEO suite.

This iteration serves sites regardless of CMS and excludes WordPress/Shopify connectors, automatic publishing, local-business/Maps research and new geography/device targeting features. Do not add data-provider endpoints or subscriptions merely to match a competitor's catalog.

## Next complete journey

1. Connect website onboarding; confirm business, aliases and competitors.
2. Extend the implemented bounded HTML/robots/sitemap check after public-network acceptance.
3. Validate the implemented observation/version contract with available platform and collection context; unobservable values stay unknown. New region/device controls are outside this iteration.
4. Validate complete sources and failure states separately for each platform.
5. Validate AI-generated drafts with a real key; reviewed outlines, draft revisions and Markdown copying are implemented. Users implement changes on their own sites and record what changed; publication integrations are outside this iteration.
6. Validate the implemented retest comparison over long-running deployments, then add reports and statistical uncertainty.

Acceptance uses both an API business and an AI image business: topics, competitors, pages and actions must differ meaningfully.

## Continuous operation

Reuse pg-boss; add device leases, online/offline state, cancellation, cross-worker leases, budgets and weekly reports. Keep one identity, product database and task contract.

SQLite requires adapting the PostgreSQL schema/queries and replacing the PostgreSQL-specific queue. It is not claimed in this release and will not be added as a second parallel account system.

## Later domains

After the active checklist, reassess sourced brand knowledge, recommendation classification, citation coverage and research/content quality against real user needs. Shopping, new external datasets and broader integrations are not commitments. Extend the existing authenticated API/MCP only where the core workflow needs it. Generated questions are not observed demand.
