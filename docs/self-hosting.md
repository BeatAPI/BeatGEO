# Local setup and advanced PostgreSQL configuration

For the complete first-use journey, see [Getting started](beat-geo/getting-started.md). Run `pnpm local:doctor` to check prerequisites without changing data.

Run `pnpm start` from the source checkout, then open the local URL printed in the terminal (normally http://localhost:3140/). The first start installs locked dependencies and prepares private configuration, bundled PostgreSQL and the included BeatBrowser extension. Later starts reuse the same workspace. Keep the terminal running while monitoring; Ctrl+C stops the local services in order.

Prepare Git, pnpm 12.4.1 and Chrome; pnpm installs and uses Node.js 24 for this project. No server deployment, Docker or separate database setup is needed. The advanced manual path below is only for users who choose to maintain a dedicated local PostgreSQL installation. SQLite is not supported. This MVP runs from source; no BeatGEO npm CLI, SDK or container images are published.

Default local storage lives in `.beat-geo/postgres`. Stop BeatGEO before backing up this directory together with `.beat-geo/database.json` and both private `.env` files. Older Docker/manual installations keep their original data and configuration; the local installer does not convert them. Back up and explicitly migrate existing data before switching to bundled storage. The local installer and launcher support bundled storage only. The native path has been exercised on macOS arm64; other upstream-supported platforms still require release validation.

Local mode has no registration, login, passwords, team invitations or organization switching. It establishes a private browser session automatically and accepts only loopback requests. Existing multi-user databases are never claimed automatically. Hosted commercial editions are not currently offered.

## Advanced: use an existing local PostgreSQL installation

Run `pnpm install --frozen-lockfile`. Create a **dedicated BeatGEO PostgreSQL database**; do not reuse a production website database. Put configuration in both root `.env` and `apps/web/.env` (the worker reads the latter). Generate independent secrets with `openssl rand -base64 32`, and keep the files out of Git.

```dotenv
DATABASE_URL=postgres://YOUR_USER:YOUR_PASSWORD@127.0.0.1:5432/beatgeo
BETTER_AUTH_SECRET=REPLACE_WITH_RANDOM_SECRET
BEAT_GEO_ENCRYPTION_KEY=REPLACE_WITH_BASE64_32_BYTES
APP_URL=http://localhost:3000

SCRAPE_TARGETS=chatgpt:beat-browser
RUNS_PER_PROMPT=1
BROWSER_RUNNER_URL=http://127.0.0.1:4318
BROWSER_RUNNER_TOKEN=REPLACE_WITH_RANDOM_RUNNER_SECRET

# Optional: configure these in Brand → API Key after opening the workspace instead.
# BEATAPI_API_KEY=YOUR_BEATAPI_KEY
# BEATAPI_RESEARCH_MODEL=MODEL_ID_AVAILABLE_TO_YOUR_KEY
```

Select a model supporting structured JSON output. BeatAPI research uses Search → Read → one model completion; evidence-only opportunity analysis uses only the model. These paths have mocked contract tests; perform a small real-key acceptance before enabling scheduled usage. The local default-organization administrator (or platform admin) manages the shared instance key; this is not per-tenant BYOK. Key and model are encrypted together in the existing secrets table, and workers refresh within 60 seconds. An explicit `ONBOARDING_LLM_TARGET` overrides automatic research-provider selection. Verification reads `/v1/usage` and `/v1/models`; it does not validate a billed generation. Other research providers remain supported.

For UI-only testing without any paid calls, replace the two target values with `SCRAPE_TARGETS=stub:stub` and `ONBOARDING_LLM_TARGET=stub:stub` and remove BeatAPI credentials/model. Stub results are synthetic, never visibility evidence.

After checking the connection points to the intended database and backing up existing data, initialize/update its schema:

```sh
(cd packages/lib && pnpm exec node --env-file=../../.env node_modules/drizzle-kit/bin.cjs migrate)
```

## Advanced: start the collector, web and worker separately

For this manual PostgreSQL path, prepare the included extension from the repo root without starting bundled storage:

```sh
pnpm exec node --input-type=module -e 'import { prepareExtension } from "./scripts/local-runtime.mjs"; await prepareExtension(process.cwd());'
```

Load `.beat-geo/extension` in Chrome or reuse an existing connection, then sign in to ChatGPT in your selected profile. Check the bridge with `pnpm exec node node_modules/@beatapi/beat-browser/src/cli.js doctor --json`. The collector and worker run on the same computer. Start each command below in its own terminal from the repo root; `pnpm start` and `pnpm local:start` are for bundled storage and reject a manual PostgreSQL configuration.

```sh
pnpm exec node --env-file=.env apps/browser-lab/server.mjs
pnpm --filter @workspace/web dev
pnpm --filter @workspace/worker dev
```

For source BeatBrowser, also set `BEAT_BROWSER_COMMAND=node` and `BEAT_BROWSER_ARGS_JSON` to a JSON array containing the absolute path to `beat-browser/src/cli.js`. Set `BEAT_BROWSER_PROFILE_ID` if multiple Chrome profiles are connected. Share the same `BROWSER_RUNNER_TOKEN` between collector and worker; it is distinct from a model API key.

Open **http://localhost:3000**, enter the workspace directly and add a brand/website, use **Brand → API Key** to configure optional research credentials, then generate and review website-based questions (or an industry starter set without a key) and start collection. In Opportunities, save a recommendation with a completed baseline, record the change you made, and choose Retest. The queue processes the same questions and shows matched comparisons; changing a question or model configuration creates a different cohort. Timeouts and failures remain visible and do not count as zero exposure.

The browser bridge is serial, synchronous and loopback-only: run **one worker per collector**, with `RUNS_PER_PROMPT=1`. Add `gemini:beat-browser` only after validating that platform with your account; its background completion remains less reliable. Keep Chrome and all three local services running on an awake computer for monitoring. Offline recovery remains roadmap work.

Do not expose the collector through a public tunnel. Keep raw evidence in its ignored local directory. See [privacy](privacy.md) and [metrics](metrics.md).

## Validation and release boundary

The source includes unit tests, browser transport tests, and PostgreSQL integration tests. Integration tests migrate/write only to a local database whose name ends in `_test`:

```sh
pnpm lint
pnpm test
pnpm test:browser
# Creates and removes its own local test database; no personal credentials or paid calls.
pnpm test:mvp
pnpm test:local:browser
# Set TEST_DATABASE_URL to a disposable local database ending in _test first.
pnpm --filter @workspace/web test:integration
pnpm --filter @workspace/web build
```

The source CLI is development tooling pending separate release validation. BeatGEO has no hosted plan or billing. Refer to the [local workspace acceptance](beat-geo/local-workspace-cleanup-2026-11-04.md) and earlier [browser collection evidence](beat-geo/validation.md) for what was actually exercised.
