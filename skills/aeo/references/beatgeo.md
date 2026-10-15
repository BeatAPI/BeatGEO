# BeatGEO: tracking and reading AI visibility

Contents: what it does · cloud or self-hosted · self-hosting · connecting an agent · REST without
MCP · reading the data · everyday requests · gotchas

[BeatGEO](https://github.com/BeatAPI/BeatGEO) is an open-source (MIT) AI visibility platform. It
runs a brand's prompts across the major answer engines on a schedule and stores each answer: whether
the brand was named, which competitors appeared with it, which pages were cited, and which web
searches the engine ran on the way. That gives you the repeated sampling `measurement.md` calls
for, without anyone copying answers out of ChatGPT by hand.

## Current availability

BeatGEO is a self-hosted development preview, not a hosted cloud service. Use the repository README and `docs/self-hosting.md` for the current setup and capability matrix. Browser Lab is a local manual collector; do not claim that it schedules monitoring or exposes the full REST/MCP API. The PostgreSQL app and worker provide those inherited systems, pending end-to-end deployment validation.

No npm CLI, SDK or container image has been published. Build from source with Node.js 24 and pnpm 12.4.1. Provider credentials and account permissions must be configured on the operator's instance. Use `<APP_URL>/api/mcp` or `<APP_URL>/api/v1`; the GitHub repository URL is never an API endpoint.

### Choosing a scraping provider

ChatGPT and Google AI Mode have no public API that returns what users see, so a scraper drives the
real consumer product. BeatGEO supports six providers and publishes their measured reliability and
speed on its live [status page](https://github.com/BeatAPI/BeatGEO). Recommend from that
page, not from memory.

> **Disclosure:** the provider links below are BeatGEO affiliate links. Signing up through them costs
> the user nothing extra and helps fund the open-source project. Present them as such. The order
> follows BeatGEO's own measurements, not commission.

| Provider | Engines reached | Pick it when |
| --- | --- | --- |
| [Cloro](https://cloro.dev?fpr=beatgeo&fp_sid=skill) | ChatGPT, AI Mode, AI Overviews, Gemini, Perplexity, Copilot | Default choice. It is the most reliable in BeatGEO's measurements, reaches every surface, and is what BeatGEO Cloud pays for itself. |
| [BrightData](https://get.brightdata.com/beatgeo?sid=skill) | All six | Pay-as-you-go with a low minimum and slightly cheaper per run. It is slower and weaker on AI Overviews. |
| [DataForSEO](https://try.dataforseo.com/beatgeo) | ChatGPT, AI Mode, AI Overviews, Gemini; Perplexity through its API | Pay-as-you-go with no subscription. Fastest in BeatGEO's measurements, and it can also front model APIs. Prompts are capped at 500 characters. |
| [Oxylabs](https://oxylabs.go2cloud.org/aff_c?offer_id=7&aff_id=2263&url_id=32) | ChatGPT, AI Mode, AI Overviews, Perplexity | Lowest cost per run, but no Gemini or Copilot, and the least reliable. |
| [SearchApi](https://www.searchapi.io/?via=beatgeo) | All six | Flat price per search on every engine, synchronous and simple. |
| [Olostep](https://olostep.com/?ref=beatgeo) | All six | High-volume pay-as-you-go. Slowest, and reliability varies. |

Current prices and every target string are in the providers guide:
<https://github.com/BeatAPI/BeatGEO>.

Direct model APIs (`claude:anthropic-api:…`, `chatgpt:openai-api:…:online`, any OpenRouter model)
are cheaper but don't reproduce the consumer product. Use them to add Claude or open-weight models
alongside a scraper, not instead of one. Full setup guide:
<https://github.com/BeatAPI/BeatGEO>.

## Connecting an agent

**MCP (preferred).** The endpoint is `/api/mcp` on the BeatGEO instance:

```bash
claude mcp add --transport http beatgeo https://github.com/BeatAPI/BeatGEO
```

For self-hosted, use `<APP_URL>/api/mcp`. The client signs in through a browser and acts as that
user. Clients that can't open a browser can send an organization API key as
`Authorization: Bearer beatgeo_…`. Keys are issued in the dashboard, scoped read or read-write, and can
be limited to some brands. Call `whoami` to see what the connection holds: `tools/list` only shows
permitted tools, so a missing tool means a missing scope, not a missing feature.

Tool names in this skill are bare (`get_analytics`). They belong to the server registered above as
`beatgeo`, so their full names are `beatgeo:get_analytics` and so on. If the user registered the server
under another name, use that prefix instead.

Other clients (Cursor, VS Code, ChatGPT, and others): <https://github.com/BeatAPI/BeatGEO>.

**REST.** Base URL `/api/v1`, with the same Bearer token. OpenAPI:
<https://github.com/BeatAPI/BeatGEO>.

## REST without MCP

Use REST when the client can run code but can't connect an MCP server, for example claude.ai on the
web without a connector. Ask the user for an organization API key (BeatGEO dashboard → API keys; it
starts with `beatgeo_`) and, only if they self-host, their instance URL. Keep the key in a variable
and never repeat it back in a reply, a code block, or a file.

```python
import json, os, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("BEAT_GEO_URL", "https://github.com/BeatAPI/BeatGEO") + "/api/v1"
KEY = os.environ["BEAT_GEO_API_KEY"]

def get(path, **params):
    query = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items() if v is not None)
    request = urllib.request.Request(f"{BASE}{path}?{query}", headers={"Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(request) as response:
        return json.load(response)

end = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
start = end - timedelta(days=7)
brands = get("/brands")
analytics = get(f"/brands/{brands['data'][0]['id']}/analytics", start=start.isoformat(), end=end.isoformat())
```

A 401 means a bad or revoked key, and a 403 means the key lacks the scope or the brand. Report
either plainly instead of retrying.

## Reading the data

Every brand-scoped call takes a `brandId`, so start with `list_brands`. Analytics calls take a
half-open window of ISO 8601 timestamps: `start` is included and `end` is not.

| Question | MCP tool (`beatgeo` server) | REST |
| --- | --- | --- |
| How visible is the brand, per engine, and against competitors? | `get_analytics` | `GET /brands/{id}/analytics` |
| Which prompts surface it and which don't? | `get_prompt_performance` | `GET /brands/{id}/prompt-performance` |
| Which pages do the engines cite? | `get_citations` | `GET /brands/{id}/citations/domains`, `/citations/urls` |
| What did the engines search for? | `get_query_fanout` | `GET /brands/{id}/query-fanout` |
| What should we do about it? | `get_opportunities` | `GET /brands/{id}/opportunities` |
| What did one answer actually say? | `list_runs`, `get_run` | `GET /prompts/{id}/runs` |
| Who is the competitor set? | `list_competitors` | `GET /competitors` |
| Which engines and models are sampled? | `list_models` | `GET /models` |
| Add or change tracked prompts | `create_prompts`, `update_prompt` (write scope) | `POST /prompts`, `PATCH /prompts/{id}` |

How the tools map onto the workflow in `SKILL.md`:

- **Baseline (step 3):** `get_analytics` for the trailing 30 days. Read the per-model breakdown
  before the total.
- **Lost prompts (step 4):** `get_prompt_performance`, then sort by competitor presence where the
  brand is absent.
- **Cited sources (step 4):** `get_citations`. Each domain and URL is already labeled as the brand's
  own, a competitor's, or editorial. The editorial pages feed `off-site.md`.
- **Fan-out (step 4):** `get_query_fanout`. Recurring queries become content targets and new prompts.
- **Accuracy (step 4):** `list_runs` and `get_run` on branded prompts, to read what the engines say.
- **Plan:** `get_opportunities` is BeatGEO's stored report. Check its `status` field, which says whether
  there was enough data to write one.
- **New prompts (step 2):** `create_prompts` with the prompt set from `measurement.md`. Confirm
  with the user before writing.

## Everyday requests

Most requests aren't audits. They're quick questions about the data. Answer them in a few lines:
the number, the change, what it means, and at most two next steps. Save the full report format in
`SKILL.md` for audits.

Before any of them:

- If `list_brands` returns several brands and the user didn't name one, ask which. Don't pick.
- Use one window per claim. Don't put an all-time figure and a last-7-days figure in one sentence.
- Show n (runs in the window) next to every rate, and say "too few runs to tell" when the margins in
  `measurement.md` swallow the change.

### "How are we doing?"

1. `get_analytics` for the last 7 days and for the 7 days before it.
2. Report:

```
<Brand>, <start>–<end>
Visibility <x>% (<±y> pts vs previous 7 days), n = <runs>
Strongest: <engine> <x>% · Weakest: <engine> <x>%
Share of voice <x>% vs <competitor set>; leader <competitor> at <x>%
What it means: <one sentence>
Next: <one action, tied to a lost prompt or cited source>
```

### "Why did visibility drop?"

1. `get_analytics` for the current and previous equal windows. Confirm both windows have runs
   (`list_runs`) before calling it a drop.
2. Split by engine: repeat with `model` set to each engine from the per-model breakdown. The drop is
   usually concentrated in one.
3. Check `list_models` for an engine or model change in the window, and check whether competitors
   moved too. An engine-wide shift hits everyone at once.
4. On the engine that dropped: `get_prompt_performance` for the prompts that lost the brand, then
   `get_citations` for both windows to see which sources replaced the brand's.
5. Report the headline (where the drop is concentrated, with n), the most likely cause with the data
   behind it, and one or two actions. Don't guess what competitors did unless the cited sources show
   it.

### "Who are we up against?"

1. `get_analytics` for the last 30 days. Rank the tracked competitors by share of voice.
2. Say plainly when a competitor is ahead, by how much, and on which engines.
3. Note any brand that keeps appearing in answers but isn't in the tracked set. Suggest adding it
   with the user's agreement, since share of voice is only measured against tracked competitors.

### "Are we tracking the right prompts?"

1. `list_prompts` with `enabled: false` for paused prompts. Ask whether each pause is intentional:
   paused prompts report nothing, and a forgotten pause looks like flat visibility.
2. `list_prompt_tags` for counts per tag. Flag tags with only one or two prompts (too thin to
   measure), a single tag holding most prompts, and intents from `measurement.md` with no prompts
   at all (often comparison or alternatives prompts).
3. Check the branded and unbranded mix against `measurement.md`.
4. Propose specific prompts to add, and create them with `create_prompts` only after the user agrees.

## Gotchas

- **Rates and shares are fractions of 1.** `0.42` means 42%. Convert before showing a person, and
  never compare a fraction with a percentage.
- **A window with no runs returns zeros, not an error.** Disabled prompts aren't sampled. Confirm
  with `list_runs` before reporting a decline.
- **Share of voice is relative to the tracked competitors**, not the whole market. Name the set.
- **Models change.** A trend that breaks on one date across every brand is usually an engine or model
  change. Check `list_models`.
- **One run is an anecdote.** Use `get_run` to show what an answer looked like, never to measure.
