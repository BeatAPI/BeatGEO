# Local Agent workflow acceptance — demo run (undated)

## Verified implementation

The local MCP exposes 27 tools. The added workflow group covers brand creation inside an existing authorized organization, website context, shared workspace state, semantic commands, one-shot collection submission/progress/cancellation, direct collection comparison and website checks. MCP and the dashboard persist and read the same brands, questions, actions, drafts and evidence.

Operation receipts use the additive `0027_workspace_commands` migration. Stable keys replay completed results and reject changed arguments; failed or interrupted operations remain inspectable. Draft revision checks and brand-settings compare-and-swap prevent stale writes. New projects start paused. Browser samples and action retests are one-shot and pin question text and target configuration; a changed queued contract is not executed.

Local tools retain organization/brand scope and read-only restrictions and are withheld from hosted deployments. They do not issue credentials, modify billing, create organizations, delete project data or publish content.

## Automated acceptance

`pnpm test:mvp` passed 1,579 checks: 22 browser collector tests, 17 script tests, 119 config, 35 CLI, 706 lib, 52 deployment, 581 web unit and 47 PostgreSQL integration tests. Provider replies in these tests are synthetic. Integration checks use the official MCP client and disposable PostgreSQL/pg-boss for creation/replay, bounded jobs, persistence, scoped reads, draft conflicts, implementation records and matched retests. Integration files run sequentially because worker availability is shared database state.

Eight workspace type tasks passed. Biome checked 873 files successfully. The web production build passed with dependency/chunk warnings. The implementation head also passed remote browser-lab, quality and PostgreSQL integration CI. Checks and CI do not constitute publication or deployment.

The official MCP SDK connected to the running local HTTP endpoint and authenticated stdio proxy. Both exposed the expected catalog; the stdio handshake and identity call succeeded.

## Real BeatAPI workflow

A dedicated local test instance and generated test owner were used. MCP created a paused BeatAPI brand, saved two unbranded buyer questions and competitor references. BeatBrowser read the live homepage; its statements remain first-party claims.

Two separate, fresh consumer-ChatGPT samples of the same question completed through MCP, the queue, the real Chrome collector and PostgreSQL. The question asked which platforms let a small development team access text, image and video models with one API key, with capabilities, limitations and sources. `get_collection`, `list_runs` and `get_run` read back the completed evidence:

| Sample | Duration | Answer characters | Saved visible citation links | BeatAPI mentioned |
| --- | --- | --- | --- | --- |
| Baseline | About 9 minutes | 13,838 | 23 | No |
| Follow-up | About 8 minutes 21 seconds | 14,318 | 25 | No |

`compare_collections` returned one matched question/target/brand-definition pair, zero missing pairs, and a zero-point mention-rate difference. These were fresh samples without an intervening website change. They validate collection and comparison, not improvement or causation.

The browser runner persists its initial evidence record before acknowledging asynchronous submission. The worker polls only that run with authenticated loopback requests, avoiding a long-held HTTP response. Both successful samples exceeded the approximately five-minute request failure observed with synchronous transport. Control leases cover answer waiting plus setup and evidence reads.

## Dashboard and MCP read-back

MCP created a planned documentation action linked to the completed baseline, saved draft revision 1 and reviewed that exact revision. A headless browser then edited through the ordinary dashboard controls, saved and reloaded. MCP read-back confirmed revision 2, the saved editorial text, cleared review, planned status and no implementation timestamp. A stale MCP write was rejected without overwriting the dashboard edit.

The signed-in Actions & retests view was inspected at 1440px and 390px with real evidence and the draft: no uncaught page errors or horizontal overflow. Manual monitoring controls were enabled and then paused; MCP confirmed the paused state and 24-hour cadence. Credentials, screenshots and raw account evidence remain outside Git.

## Boundaries and retained failures

Initial bridge-version and user-takeover failures, and the answer whose synchronous worker request failed, remain failures rather than zero-exposure observations. Replaying a completed submission key returned its original job instead of sending another question. Comparing incomplete collections returned null rates and delta. A mismatched bridge is reported rather than replaced, and user takeover is not automatically resumed.

Server-side website fetching encountered proxy DNS resolving the site to a reserved address. Public-network protections remain enabled. Website context returns an unavailable reason and browser next step. The saved website check and its MCP read-back contain nine unknown checks with zero evaluated checks; this is not a failed website score.

Citation coverage is visible answer links only; collapsed source panels were not expanded. Account model/search mode and region were not pinned. The configured search flag is not evidence that the consumer UI performed no search. Model-generated platform claims were collected, not independently verified by this acceptance.

The final draft remains unpublished and needs review; the action is planned and recurring monitoring is paused. No overnight cadence, paid research-model API request, public content publication, production deployment, broad visibility benchmark or causal improvement is claimed. Private runtime receipts remain under `.beat-geo`.
