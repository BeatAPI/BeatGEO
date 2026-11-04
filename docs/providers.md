# Providers

BeatGEO tracks which AI answer engines mention your brand. Each tracked surface is one entry in `SCRAPE_TARGETS`, and each entry names the provider that reaches it. Scrapers read the real consumer surface (ChatGPT, Google AI Mode and so on); direct model APIs call the underlying model, which is cheaper but is not what a visitor sees. Most setups pair one scraper with one direct API key for onboarding analysis.

The local default is `chatgpt:beat-browser`, which samples ChatGPT through your own Chrome via BeatBrowser and needs no provider key.

## SCRAPE_TARGETS format

```
model:provider[:version][:online]
```

- `model` — the surface being tracked (`chatgpt`, `claude`, `google-ai-mode`, `google-ai-overview`, `gemini`, `perplexity`, `copilot`, `grok`, `kimi`).
- `provider` — how to reach it (`beat-browser`, `beatapi`, `cloro`, `brightdata`, `oxylabs`, `searchapi`, `olostep`, `dataforseo`, `openai-api`, `anthropic-api`, `mistral-api`, `openrouter`).
- `version` — required for `beatapi`, `openai-api`, `anthropic-api`, `mistral-api` and `openrouter`. Optional for scrapers: a BrightData dataset id, or a DataForSEO model name.
- `:online` — enables web search. Required for most scraped surfaces, since the live UIs always search.

Entries are comma-separated.

## BeatAPI

```bash
BEATAPI_API_KEY=...
BEATAPI_RESEARCH_MODEL=MODEL_ID_AVAILABLE_TO_YOUR_KEY
```

BeatAPI powers research (Search → Read → one model completion) and API simulations. API simulations use their own label so they never mix with browser visibility:

```
api-simulation:beatapi:<model-id>
```

The key and model can also be configured from the local workspace instead of `.env`.

## Scrapers

### Cloro

```bash
CLORO_API_KEY=...
```

```
chatgpt:cloro:online
perplexity:cloro:online
copilot:cloro:online
gemini:cloro:online
google-ai-mode:cloro:online
google-ai-overview:cloro:online
```

Cloro authenticates with one bearer key. BeatGEO uses its asynchronous task API and polls until each task completes. Every Cloro surface is the live web-search UI, so `:online` is required.

### BrightData

```bash
BRIGHTDATA_API_TOKEN=...
```

```
chatgpt:brightdata:online
google-ai-mode:brightdata:online
google-ai-overview:brightdata:online
perplexity:brightdata:online
copilot:brightdata:online
gemini:brightdata:online
```

A custom dataset id can be passed as the version: `chatgpt:brightdata:gd_abc123`.

### Oxylabs

```bash
OXYLABS_USERNAME=...
OXYLABS_PASSWORD=...
```

```
chatgpt:oxylabs:online
chatgpt:oxylabs
perplexity:oxylabs:online
google-ai-mode:oxylabs:online
google-ai-overview:oxylabs:online
```

Oxylabs uses HTTP Basic auth with Web Scraper API credentials. BeatGEO submits through the asynchronous Push-Pull API. `:online` toggles web search for ChatGPT; the other surfaces always search.

### SearchApi

```bash
SEARCHAPI_API_KEY=...
```

```
chatgpt:searchapi:online
chatgpt:searchapi
perplexity:searchapi:online
copilot:searchapi:online
gemini:searchapi:online
google-ai-mode:searchapi:online
google-ai-overview:searchapi:online
```

SearchApi serves every surface from one synchronous search endpoint. ChatGPT is the only surface with a web-search toggle. Google AI Overview is read from the Google SERP; when Google loads the overview separately, BeatGEO redeems the returned page token straight away, and a run that still has no overview fails rather than storing an empty answer.

### Olostep

```bash
OLOSTEP_API_KEY=...
```

```
chatgpt:olostep:online
google-ai-mode:olostep:online
google-ai-overview:olostep:online
gemini:olostep:online
copilot:olostep:online
perplexity:olostep:online
```

Olostep surfaces always use web search, so `:online` is required.

### DataForSEO

```bash
DATAFORSEO_LOGIN=...
DATAFORSEO_PASSWORD=...
```

```
chatgpt:dataforseo:online
gemini:dataforseo:online
google-ai-mode:dataforseo:online
google-ai-overview:dataforseo:online
perplexity:dataforseo:online
```

DataForSEO scrapes the live surface where it can: ChatGPT and Gemini through its LLM Scraper, Google AI Mode and AI Overview through its SERP endpoints. Perplexity goes through LLM Responses because no Perplexity scraper exists. All DataForSEO targets require `:online`, and prompt text is limited to 500 characters.

#### Pinning a model

A version switches ChatGPT or Gemini to the LLM Responses API, which calls the vendor's model instead of the consumer product:

```bash
chatgpt:dataforseo:gpt-5.5:online
gemini:dataforseo:gemini-2.5-flash:online
```

This is faster and cheaper but does not reflect the real ChatGPT or Gemini experience. The scraped and SERP surfaces reject a version rather than ignore it.

## Direct model APIs

These call the provider API directly. They are cheaper than scrapers but do not represent the actual ChatGPT or Google AI Mode experience; use them alongside a scraper for extra model coverage, and for onboarding analysis.

| Provider | Key | Tracks |
| --- | --- | --- |
| Anthropic API | `ANTHROPIC_API_KEY` | Claude models |
| OpenAI API | `OPENAI_API_KEY` | OpenAI models, optionally with web search |
| Mistral API | `MISTRAL_API_KEY` | Mistral models, optional web search through the beta Conversations API |
| OpenRouter | `OPENROUTER_API_KEY` | Any OpenRouter-hosted model |

```
claude:anthropic-api:claude-sonnet-5
chatgpt:openai-api:gpt-5-mini:online
mistral:mistral-api:mistral-medium-latest:online
claude:openrouter:anthropic/claude-sonnet-5
grok:openrouter:x-ai/grok-4.5:online
kimi:openrouter:moonshotai/kimi-k3
perplexity:openrouter:perplexity/sonar:online
```

These providers all require a version as the third segment. For Mistral, `:online` routes through the Conversations API with the `web_search` tool; without it no citations are returned. On OpenRouter, `:online` uses the model's own web search where one exists and OpenRouter's search elsewhere.

## Example setup

One scraper plus one direct API key:

```bash
CLORO_API_KEY=...
OPENROUTER_API_KEY=...
SCRAPE_TARGETS=chatgpt:cloro:online,google-ai-mode:cloro:online
```
