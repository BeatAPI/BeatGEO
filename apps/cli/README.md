# BeatGEO local CLI — source preview

This private source CLI uses the same bundled-storage setup and startup scripts as the root quick start. No npm package or container images are published.

From a source checkout with Node.js 24 and pnpm 12.4.1:

```sh
pnpm beatgeo doctor
pnpm beatgeo init
pnpm beatgeo start
```

`init --resume` resumes an interrupted setup without replacing private configuration. `start` runs the web app, browser collector and worker until Ctrl+C. Local PostgreSQL is bundled and managed automatically. The `--dir` option selects another source checkout.

Existing installations are never converted automatically. Back up their data and private configuration before following the [self-hosting guide](../../docs/self-hosting.md).
