# Profound UI reference — 2026-10-17

Inspected the signed-in Profound product with BeatBrowser in an isolated background workspace: Agents entry, Answer Engine Insights / Visibility, Citations and Prompts, including expansion of a prompt topic. Source: https://platform.tryprofound.com/agents and its in-product navigation. The minimized window did not produce pixels; observations below come from rendered DOM, interactive state and computed styles. Private brand metrics and account identifiers are intentionally omitted.

## Observed structure

- The left rail selects a product module; Answer Engine Insights keeps visibility, sentiment, fact check, citations and prompts as a horizontal navigation within that module.
- A shared filter row sits below the module navigation. Date range, comparison period, topic and platform are prominent; some filters vary by view.
- Visibility switches metrics above its chart/ranking section and exposes a matrix/table below.
- Citations offers domain/page/watchlist views with search and table controls.
- Prompts uses expandable topic rows to reveal individual questions; query fan-out is a sibling view.
- A dismissible guide occupies the top of the first-use layout. It is not a permanent large page heading.

## Measured styles

At a 1512px desktop viewport: sidebar 240px, navigation rows 32px, inner navigation about 40px, filter controls 28px, content inset 24px. The declared body font is Inter with SF Pro/system fallbacks, 13px / 18px, weight 400. Filter labels use weight 500; the guide heading uses 18px / 24px, weight 600. Panels use subtle warm-charcoal surfaces and separators rather than nested full borders.

## BeatGEO implementation boundary

Answer analytics now share a module entry and horizontal navigation. Existing visibility, share-of-voice, citations, responses and query-fan-out routes remain real and directly addressable. Common model, period, tag and search filters survive navigation; view-specific ordering is discarded. The existing question editor remains under settings. Inter is bundled locally with explicit Chinese fallbacks; the shell uses a 240px rail and denser controls.

Sentiment, fact check, regional filters, saved views and the full Profound chart/table workflow are not implemented by this UI change. They must not appear as non-working controls. BeatGEO retains its own logo and bilingual UI. Screenshot-based visual parity is not claimed from the background DOM inspection.

## Local acceptance

An isolated source installation with synthetic questions was checked in the browser. The five analysis routes are reachable from the common navigation; a 7-day filter survives the citation-to-response transition; the module stays selected across sibling routes and disappears from brand settings. English/Chinese switching and a 390px viewport were checked without document overflow. Empty prompt charts render as measured compact rows; scrolling reached the final question without overlapping rows. The local dataset contains unfinished/empty attempts, not populated performance reports, so populated chart/table visual parity remains unverified.

Workspace lint, web typecheck, production build and all 570 web unit tests passed.
