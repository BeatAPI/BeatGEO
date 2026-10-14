# Self-hosting

The root README's collector is the zero-dependency MVP entry. The full product requires Node.js 24, pnpm 12.4.1 and PostgreSQL. SQLite is not supported.

Read the [developer guide](../packages/docs/content/docs/developer-guide/) and run `pnpm install --frozen-lockfile`. Supply root and `apps/web/.env` configuration: `DATABASE_URL`, `DEPLOYMENT_MODE=local`, `BETTER_AUTH_SECRET`, `BEAT_GEO_ENCRYPTION_KEY`, `APP_URL`, `VITE_APP_URL`, `DISABLE_TELEMETRY=1`, and provider settings. Generate your own secrets; do not copy credentials into Git. Initialize only your intended database using the documented migration procedure and backups.

The browser provider and runner currently run on the same host with the same locally generated `BROWSER_RUNNER_TOKEN`:

```dotenv
BROWSER_RUNNER_URL=http://127.0.0.1:4318
SCRAPE_TARGETS=chatgpt:beat-browser,gemini:beat-browser
```

Onboarding/analysis also needs a configured research model. UI-only testing can use `SCRAPE_TARGETS=stub:stub` and `ONBOARDING_LLM_TARGET=stub:stub`; these are simulations, never real measurements.

The bridge is serial, synchronous and loopback-only, not a multi-user browser fleet. A cloud worker cannot reach a user's localhost. Device leasing remains roadmap work.

No BeatGeo npm CLI, SDK or container images are published in this MVP. Build from source. Inherited package versions do not represent BeatGeo release history. The source CLI is development tooling pending its own release validation. Hosted billing modes and inherited marketing content are not supported BeatGeo offerings.
