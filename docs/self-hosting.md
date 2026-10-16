# Self-hosting

For the complete first-use journey, see [Getting started](beat-geo/getting-started.md). Run `node scripts/local-doctor.mjs` to check prerequisites without changing data.

For a new local installation, use `pnpm local:setup` and `pnpm local:start`, then open http://localhost:3140/setup. This source installer requires Git, Node.js 24, pnpm 12.4.1 and Chrome; it bundles and manages its own PostgreSQL (no Docker required) and the pinned BeatBrowser extension. The advanced manual path below is for an existing dedicated PostgreSQL installation. SQLite is not supported. Build from source; no BeatGEO npm CLI, SDK or container images are published in this MVP.

Default local storage lives in `.beat-geo/postgres`. Stop BeatGEO before backing up this directory together with `.beat-geo/database.json` and both private `.env` files. Existing Docker/manual installations keep their original data and configuration. For a new optional Docker install, run `pnpm local:setup --docker`. The native path has been exercised on macOS arm64; other upstream-supported platforms still require release validation.

## Configure one local instance

Run `pnpm install --frozen-lockfile`. Create a **dedicated BeatGEO PostgreSQL database**; do not reuse a production website database. Put configuration in both root `.env` and `apps/web/.env` (the worker reads the latter). Generate independent secrets with `openssl rand -base64 32`, and keep the files out of Git.

```dotenv
DATABASE_URL=postgres://YOUR_USER:YOUR_PASSWORD@127.0.0.1:5432/beatgeo
DEPLOYMENT_MODE=local
BETTER_AUTH_SECRET=REPLACE_WITH_RANDOM_SECRET
BEAT_GEO_ENCRYPTION_KEY=REPLACE_WITH_BASE64_32_BYTES
APP_URL=http://localhost:3000
VITE_APP_URL=http://localhost:3000
DISABLE_TELEMETRY=1

SCRAPE_TARGETS=chatgpt:beat-browser
RUNS_PER_PROMPT=1
BROWSER_RUNNER_URL=http://127.0.0.1:4318
BROWSER_RUNNER_TOKEN=REPLACE_WITH_RANDOM_RUNNER_SECRET

# Optional: configure these in Connections after signing in instead.
# BEATAPI_API_KEY=YOUR_BEATAPI_KEY
# BEATAPI_RESEARCH_MODEL=MODEL_ID_AVAILABLE_TO_YOUR_KEY
```

Select a model supporting structured JSON output. BeatAPI research uses Search → Read → one model completion; evidence-only opportunity analysis uses only the model. These paths have mocked contract tests; perform a small real-key acceptance before enabling scheduled usage. The local default-organization administrator (or platform admin) manages the shared instance key; this is not per-tenant BYOK. Key and model are encrypted together in the existing secrets table, and workers refresh within 60 seconds. An explicit `ONBOARDING_LLM_TARGET` overrides automatic research-provider selection. Verification reads `/v1/usage` and `/v1/models`; it does not validate a billed generation. Other research providers remain supported.

For UI-only testing without any paid calls, replace the two target values with `SCRAPE_TARGETS=stub:stub` and `ONBOARDING_LLM_TARGET=stub:stub` and remove BeatAPI credentials/model. Stub results are synthetic, never visibility evidence.

After checking the connection points to the intended database and backing up existing data, initialize/update its schema:

```sh
(cd packages/lib && node --env-file=../../.env node_modules/drizzle-kit/bin.cjs migrate)
```

## Start the collector, web and worker

The root dependency includes BeatBrowser. `pnpm local:start` prepares `.beat-geo/extension`; load it in Chrome or reuse an existing connection. Sign in to ChatGPT in your selected profile. You can also run `node node_modules/@beatapi/beat-browser/src/cli.js doctor --json`. The collector and worker must run on the same host. Start each command in its own terminal from the repo root:

```sh
node --env-file=.env apps/browser-lab/server.mjs
pnpm --filter @workspace/web dev
pnpm --filter @workspace/worker dev
```

For source BeatBrowser, also set `BEAT_BROWSER_COMMAND=node` and `BEAT_BROWSER_ARGS_JSON` to a JSON array containing the absolute path to `beat-browser/src/cli.js`. Set `BEAT_BROWSER_PROFILE_ID` if multiple Chrome profiles are connected. Share the same `BROWSER_RUNNER_TOKEN` between collector and worker; it is distinct from a model API key.

Open **http://localhost:3000**, register the local administrator, add a brand/website, use Connections to configure optional research credentials, then generate and review website-based questions (or an industry starter set without a key) and start collection. In Opportunities, save a recommendation with a completed baseline, record the change you made, and choose Retest. The queue processes the same questions and shows matched comparisons; changing a question or model configuration creates a different cohort. Timeouts and failures remain visible and do not count as zero exposure.

The browser bridge is serial, synchronous and loopback-only: run **one worker per collector**, with `RUNS_PER_PROMPT=1`. Add `gemini:beat-browser` only after validating that platform with your account; its background completion remains less reliable. A cloud worker cannot reach a user's localhost. Device leasing and offline recovery remain roadmap work. A sleeping laptop cannot provide continuous monitoring.

Do not expose the collector through a public tunnel. Keep raw evidence in its ignored local directory. See [privacy](privacy.md), [metrics](metrics.md) and the [developer guide](../packages/docs/content/docs/developer-guide/).

## Validation and release boundary

The source includes unit tests, browser transport tests, and PostgreSQL integration tests. Integration tests migrate/write only to a local database whose name ends in `_test`:

```sh
pnpm lint
pnpm test
pnpm test:browser
# Set TEST_DATABASE_URL to a disposable local database ending in _test first.
pnpm --filter @workspace/web test:integration
pnpm --filter @workspace/web build
```

Inherited package versions do not represent BeatGEO release history. The source CLI is development tooling pending separate release validation. Hosted billing modes and inherited marketing content are not supported BeatGEO offerings. Refer to the dated [acceptance evidence](beat-geo/validation.md) for what was actually exercised.
