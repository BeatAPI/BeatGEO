# Monitoring platforms

BeatGEO reaches AI platforms two ways, and the two answer different questions:

| Route | Provider id | What you get | Cost |
| --- | --- | --- | --- |
| **BeatBrowser** | `beat-browser` | The AI product opened in your own signed-in Chrome: the answer and the visible sources a visitor sees. | No API charge; uses your website account. |
| **BeatAPI** | `beatapi` | The model asked directly through one BeatAPI key, without web search: what the model already believes about your brand. | Billed to your BeatAPI balance. |

Each tracked platform is one entry in `SCRAPE_TARGETS`. The local default is `chatgpt:beat-browser`. Browser observations and API answers are shown in separate groups and never pooled into one visibility figure.

## SCRAPE_TARGETS format

```
platform:provider[:model-id]
```

- `platform` — `chatgpt`, `gemini`, `claude`, `deepseek`, `qwen`, `kimi`, `grok` or `glm`.
- `provider` — `beat-browser` or `beatapi`.
- `model-id` — optional. `beatapi` asks each platform's default model (below); add an ID only to pin another model your key can use. `beat-browser` always uses the account's current model.

| Platform | Default BeatAPI model |
| --- | --- |
| ChatGPT | `gpt-5.6-luna` |
| Gemini | `gemini-3.8-flash` |
| Claude | `claude-sonnet-5-5` |
| DeepSeek | `deepseek-v4.1-flash` |
| Qwen | `qwen3.8-flash` |
| Kimi | `kimi-k3` |
| Grok | `grok-4.6` |
| GLM | `glm-5.3` |

Entries are comma-separated. After editing `.env`, restart `pnpm local:start`.

## BeatBrowser

Supported platforms: `chatgpt` (live worker smoke test passed) and `gemini` (adapter present; completion stability still being validated).

```bash
SCRAPE_TARGETS=chatgpt:beat-browser,gemini:beat-browser
```

Setup is in **Brand → Browser**: load the bundled extension and sign in to each AI site in the same Chrome profile. The collector requires `RUNS_PER_PROMPT=1`. A timeout or missing login is recorded as a failed collection, never as zero visibility.

## BeatAPI

```bash
BEATAPI_API_KEY=...
BEATAPI_RESEARCH_MODEL=MODEL_ID_AVAILABLE_TO_YOUR_KEY
```

Save both in **Brand → API Key**. The same key powers website research and question generation (search → page reads → one model completion), the Opportunities report, the SEO workbench and API monitoring targets such as:

```bash
SCRAPE_TARGETS=chatgpt:beat-browser,claude:beatapi,deepseek:beatapi
```

The monitoring platforms page shows which model each platform uses. API targets do not search the web and carry no citations; use BeatBrowser to see the sources a consumer page shows.

## Keyless UI work

`SCRAPE_TARGETS=stub:stub` and `ONBOARDING_LLM_TARGET=stub:stub` return synthetic answers for interface development. Stub output is never real evidence.
