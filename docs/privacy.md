# Data, defaults and migration

This describes the open-source MVP, not terms for a hosted service.

The collector binds to loopback, validates Host/Origin and checks a local token for submissions. BeatBrowser uses the selected Chrome profile. Cookies are not exported; the target website receives questions through that account.

Private evidence contains prompts, answers, links, errors and browser handles. It is gitignored and stored with private permissions in `.beat-geo/runs/`. If the new directory does not exist, existing `.open-profound/runs/` remains readable without moving or deleting data. `BROWSER_RUNS_DIR` explicitly overrides the location. Legacy token headers remain accepted; new callers use `x-beat-geo-token` or bearer authentication.

Full-product accounts and tasks live in the operator's PostgreSQL deployment. Website sessions and BeatAPI balances are separate credentials. No upstream PostHog project, ad account or Crisp site is enabled by default. Optional web analytics needs `VITE_POSTHOG_KEY`; worker analytics needs `BEAT_GEO_POSTHOG_KEY` and `DEPLOYMENT_ID`. `DISABLE_TELEMETRY=1` disables them. Explicitly configured providers may receive data; review their settings for your deployment.

New key variables are `BEAT_GEO_ENCRYPTION_KEY` and `BEAT_GEO_ENCRYPTION_KEY_OLD`. Legacy `ELMO_ENCRYPTION_KEY` variables remain fallback aliases. Ciphertext key-ID namespace is unchanged intentionally. Do not rotate secrets simply to rename a product. Existing API keys remain stored; new keys use the BeatGEO prefix.

No production migrations or destructive data moves are part of this change. Back up established deployments and verify credentials, accounts and queued tasks before upgrading.
