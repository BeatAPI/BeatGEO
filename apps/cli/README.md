# BeatGEO deployment CLI — source preview

This is internal deployment tooling for [BeatGEO](https://github.com/BeatAPI/BeatGEO). The npm package and container images are **not published**. Start with the root [quick start](../../README.md#quick-start) or [self-hosting guide](../../docs/self-hosting.md).

After installing the workspace dependencies with pnpm, inspect the CLI from the repository root:

```sh
pnpm beatgeo --help
```

The source `init --dev` flow builds a Docker stack locally. It can initialize databases and start containers; use a dedicated development environment. Deployment upgrades require backups and review of migrations. This flow has not received release validation.

Telemetry is disabled by default. Events require an explicitly configured operator-owned `BEAT_GEO_POSTHOG_KEY`; `DISABLE_TELEMETRY=1` always disables them. There is no newsletter signup or upstream tracking destination.
