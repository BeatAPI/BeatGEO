# Local Agent workflow acceptance — 2026-10-22

## Verified implementation

The local MCP now exposes 27 tools. The added workflow group covers brand creation inside an existing authorized organization, website context, shared workspace state, semantic commands, one-shot collection submission/progress/cancellation, direct collection comparison and website checks. Shared services persist the same brands, questions, actions, drafts and evidence the dashboard reads.

Operation receipts use the additive `0027_workspace_commands` migration. Stable keys replay completed results and reject changed arguments; failed or interrupted operations remain inspectable. Draft revision checks and brand-settings compare-and-swap prevent stale writes. New projects start paused. Browser samples and action retests are one-shot and pin their question text and target contract; a changed queued contract is not executed.

Local tools retain organization/brand scope and read-only restrictions and are withheld from hosted deployments. They do not issue credentials, modify billing, create organizations, delete project data, publish content or call a paid research model.

## Automated acceptance

`pnpm test:mvp` passed 1,576 checks: 21 browser collector tests, 17 script tests, 119 config, 35 CLI, 704 lib, 52 deployment, 581 web unit and 47 PostgreSQL integration tests. Provider replies in these tests are synthetic. The integration workflow uses the official MCP client and real disposable PostgreSQL/pg-boss to exercise creation/replay, bounded job submission, persistence, scoped reads, draft conflicts, implementation records and matched retests.

Eight workspace type tasks passed. Biome checked 872 files successfully. The web production build passed with existing dependency/chunk warnings. These are local checks, not a claim of remote CI, publication or deployment.

The official MCP SDK connected to the running local HTTP endpoint and the new authenticated stdio proxy. Both exposed the expected local tool catalog; the stdio handshake and identity call succeeded.

## Manual dashboard acceptance

A fresh, dedicated local test instance was initialized without altering another product's database. A generated local test owner signed in through the normal auth endpoint. Headless Chromium inspected the Actions & retests view at 1440px and 390px: shared questions, monitoring state, operation history and failed collection status were visible, with no uncaught page errors or horizontal overflow. Private screenshots and test-account credentials remain outside Git.

## Real website and browser attempt

MCP created a paused BeatAPI brand, saved two unbranded buyer questions and configured competitor references. BeatBrowser read the live BeatAPI homepage. These are first-party website statements, not independently established price or capability claims.

The initial real collection did not complete: the connected extension/Agent CLI was 1.3.2 while the included collector CLI was 1.4.1. Alternating CLI versions restarted the shared bridge, causing disconnections. These attempts are retained as failures, not zero visibility or successful answers. The collector and local launcher now reject an existing mismatched bridge instead of replacing it. The test runner was explicitly aligned with the already installed CLI; completing the remaining browser check requires the human to reconnect the extension.

Server-side website fetching also encountered proxy DNS resolving the site to a reserved address. Public-network protections remain enabled. The MCP returns an unavailable state, a reason and a connected-browser next step rather than claiming it read the site.

No successful fresh AI answer, long-running cadence, paid model request, published content, production deployment or causal improvement is claimed by this acceptance. Private runtime receipts remain under `.beat-geo`.
