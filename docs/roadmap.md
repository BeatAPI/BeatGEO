# BeatGEO roadmap

[Interactive blueprint](product/flow.html) · [67-item feature inventory](product/features.csv). These describe the target product, not completed functionality.

[2026-10-16 acceptance review](beat-geo/acceptance-2026-10-16.md) records the current test results, Profound gaps, SEO integration boundary and the seven-day live acceptance plan. Run `pnpm test:mvp` for repeatable isolated core regression.

## Available MVP

Independent BeatBrowser tasks, manual brand/questions, ChatGPT/Gemini adapters with stated limits, original answers and visible links, brand/engine/status filters, timeout evidence, export and local agent drafts. The full foundation retains organization, brand, prompt, competitor and report implementations. PostgreSQL and pg-boss now persist collection attempts, answers and citations, frozen action baselines, implementation notes and comparable retests. BeatAPI research supports bounded search/read/model calls; real-key acceptance is still pending.

Default source installation now bundles its own PostgreSQL without Docker. Setup exposes storage and worker health; single-question collection, observed-answer metrics and the reviewed draft workflow share the same database and queue.

## Current product boundary

The source edition focuses on AEO: generate and confirm questions, collect real AI answers, inspect mentions and citations, save evidence-backed improvements, and retest. The main workspace, onboarding, authentication and settings share a dark theme. Recommendations, actions/retests, observed evidence and website checks have separate views.

Desktop packaging and a full desktop client are deferred until the source edition demonstrates adoption and repeatable value. Commercial SEO datasets, GSC/GA4, Shopping and general-purpose agent builders are later work, not MVP requirements. A limited website check supports AEO diagnosis; it is not a full SEO suite.

## Next complete journey

1. Connect website onboarding; confirm business, aliases and competitors.
2. Extend the implemented bounded HTML/robots/sitemap check after public-network acceptance.
3. Expand the implemented observation/version contract to platform/account/region metadata that can be independently verified.
4. Validate complete sources and failure states separately for each platform.
5. Validate AI-generated drafts with a real key; reviewed outlines, draft revisions and Markdown copying are implemented. Publication integrations remain planned.
6. Validate the implemented retest comparison over long-running deployments, then add reports and statistical uncertainty.

Acceptance uses both an API business and an AI image business: topics, competitors, pages and actions must differ meaningfully.

## Continuous operation

Reuse pg-boss; add device leases, online/offline state, cancellation, cross-worker leases, budgets and weekly reports. Keep one identity, product database and task contract.

SQLite requires adapting the PostgreSQL schema/queries and replacing the PostgreSQL-specific queue. It is not claimed in this release and will not be added as a second parallel account system.

## Later domains

Sourced brand knowledge and fact checks, recommendation classification, complete citation categories, research/content templates and human review, GSC/GA4/CDN, shopping, authenticated API/MCP actions. True AI question-volume datasets and cross-site benchmarks need data rights and scale; generated questions are not observed demand.
