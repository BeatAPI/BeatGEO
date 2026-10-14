# One product, BeatBrowser-owned execution

Research checked on 2026-10-14. The product ownership model remains proposed. Browser Lab and the BeatGeo provider bridge exist; BeatBrowser TaskSpaces are available in the 1.3.1 source preview; the npm stable package is separate.

## Decision

Use BeatGeo as the single product base and BeatBrowser as the execution product. Learn from Ego Lite’s workspace and takeover design, but implement the capability inside BeatBrowser; Ego is not a runtime dependency. Do not merge another application, identity system, scheduler or database. Do not require both browsers to run one task.

The Browser Lab is a development harness. Its local JSON files are evidence from experiments, not a second authoritative product datastore. When integrating the full product, observations must belong to BeatGeo's existing brand/prompt/run records. The local executor may spool a result for delivery, but must use the product's task ID and must not create a separate customer or scheduler.

## Ownership

| Concern | Sole owner | Browser runner responsibility |
|---|---|---|
| Product users, workspace access | BeatGeo product identity | Pair a device; no second signup |
| Brands, prompts, competitors, observations | One product PostgreSQL database | Receive selected input and return evidence |
| GEO schedules, run IDs, job state | Existing product worker/queue | Lease and execute one assigned task |
| Website login sessions | User's browser profile | Use sessions locally; do not upload cookies |
| Model, web and SEO API usage/balance | Existing BeatAPI gateway | No duplicated wallet or payment backend |

The first self-hosted edition has one product login and optional API credentials. For a future hosted BeatAPI edition, reuse gateway identity through a properly designed auth integration instead of making users register again. This identity integration is not implemented. BeatAPI's existing model-task service remains a downstream API capability, not a second GEO scheduler.

## Ego Lite: useful, with a dependency boundary

- Repository: https://github.com/citrolabs/ego-lite
- Repository contents are MIT: https://github.com/citrolabs/ego-lite/blob/main/LICENSE
- README explicitly says the browser is a separate free download. This repository does not establish that the complete native browser source is open or that its binary can be redistributed under MIT.
- Open helper runtime: https://github.com/citrolabs/ego-lite/tree/main/package/ego-browser
- The helper package calls browser-provided `globalThis.ego`, including CDP transport, tabs, spaces and snapshots. It is not a drop-in generic Chrome driver.
- The SDK's TaskSpace is a browser workspace, not a GEO job queue. Map a product run to a space/page reference; keep product lifecycle authoritative.
- Useful designs: stable page handles, action receipts, foreground-user takeover, event-based waits, iframe resolution and per-task workspace isolation. A Space must not be assumed to isolate website cookies or anonymize sampling.
- Browser onboarding can import Chrome data. Some sites may still require login again. Ego does not eliminate the need for valid website sessions.
- Current install documentation is macOS-focused. Cross-platform support and background-completion reliability need their own tests.
- Ego was installed and its onboarding/import was evaluated locally. This does not validate background completion and is not a shipped product dependency. User profile data stays outside the repository.

## Execution contract

BeatBrowser implements open, observe, submit, handoff, resume, stop and release. Site-specific ChatGPT/Gemini collection lives above this transport, with engine-aware completion signals. Browser Lab defaults to TaskSpaces and requires the matching 1.3.1 extension and bridge. The collection form lists connected Chrome profiles; CLI/worker runs can pin BEAT_BROWSER_PROFILE_ID. An unavailable TaskSpace never causes fallback into the user’s ordinary window.

Keep tabId and spaceId as executor handles, separate from the product run ID. Pin commands to the browser connection that opened the space. Lost connections stop the run without switching browsers. TaskSpace state is transient chrome.storage.session data, not a new product database or scheduler.

The current space is a minimized ordinary Chrome window in one connected profile. It shares that profile’s logins and website storage. It is not a separate browser engine, cookie sandbox or aggregation of all Chrome profiles. The window can be restored for inspection; focus pauses subsequent automated commands. BeatBrowser provides a task-space sidebar, opt-in progress notifications and explicit takeover/resume controls. The collector currently ends incomplete runs with their pages retained for review; continuing the same collection after human intervention remains separate work. Minimized screenshot support is not reliable on the tested macOS Chromium; capture now has a bounded failure and never foregrounds the window automatically.

## Local versus hosted

Local prototype: product worker -> loopback collector -> BeatBrowser -> signed-in Chrome.

Hosted product proposal: user pairs local runner once; runner makes an outbound authenticated connection to claim a scoped task and posts the observation back. A cloud server cannot access a user's `127.0.0.1`. Device tokens, leases, heartbeats, cancellation and ambiguous-submission recovery are required before shipping this mode. Do not expose a local browser-control endpoint through a public tunnel.

## Product loop

1. Add brand, domain and competitors.
2. Build a question set from customer research, own Search Console/site data and optional BeatAPI Web/SEO capabilities. Label generated or search-derived question demand as a proxy; do not invent real AI prompt-volume measurements.
3. Execute a baseline on selected consumer websites through the local browser. Store engine/account context, timestamp, completion state, answer and sources.
4. Use deterministic extraction first and optional BeatAPI models for entity normalization, sentiment, citations and comparisons; retain evidence spans and extractor version.
5. Diagnose unanswered topics and competitor/source gaps. Read the cited pages through optional BeatAPI Web capabilities and produce a sourced content brief.
6. Generate or edit content with BeatAPI, then review and publish through an explicitly configured workflow.
7. Re-run the same question cohort; compare mention/citation changes and downstream visits/leads. Separate model drift and sampling noise from plausible content effects; before/after alone is not causal proof.

## Open source and commercial boundary

Open: product UI, question/competitor management, data schema, browser execution protocol, default BeatBrowser adapter, scoring definitions, evidence viewer, provider extension points and exports. Preserve BeatGeo and other copied-source notices.

Paid optional services: BeatAPI model inference, Web/SEO data, research, content generation and future managed infrastructure. Users can self-host and bring their own supported providers. Browser monitoring itself should not be forced through a model API to manufacture consumption. BeatAPI earns use by making the analysis and improvement workflow convenient, reliable and cost-effective.

Consumer web observations and API-simulated answers must stay separate. A model API key does not turn a response into ChatGPT-web evidence. Managed real-web collection, if later offered, needs an actual operational service; it is not already shipped.
