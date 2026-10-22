# Operate BeatGEO from an Agent or the dashboard

The local dashboard and MCP share brand, question, collection, action and content services. An Agent can accept a website in conversation, create a paused brand, read website context, propose questions, collect fresh browser answers, save a draft and compare matched retests. It never needs to click through the dashboard to write records.

## Connect

Start BeatGEO locally and connect an MCP-capable client to `http://localhost:3140/api/mcp` (use your configured APP_URL). OAuth sign-in acts as the signed-in user. A dashboard-issued API key can instead authenticate with a Bearer header. A read-only key never receives write tools, and a brand-restricted key cannot create brands. New workspace tools are local-only; hosted deployments retain their existing catalog.

For clients that launch stdio servers:

```json
{"mcpServers":{"beatgeo":{"command":"node","args":["/absolute/path/to/BeatGEO/scripts/mcp-local.mjs","--key-file","/absolute/path/to/private-mcp.env"]}}}
```

Use Node.js 24. The private file must have mode 600 and contain `BEAT_GEO_MCP_TOKEN=<dashboard-issued key>` and optionally `BEAT_GEO_MCP_URL=http://localhost:3140/api/mcp`. The launcher proxies the real authenticated product endpoint; it does not write the database or start a second product. It refuses remote destinations and redirects. Never place credentials in a committed plugin configuration or chat message.

## From a website to evidence

1. Call `whoami` and `list_brands`. Reuse a matching authorized brand. Otherwise call `create_brand` with an existing organization, website and stable idempotency key. New projects start with recurring monitoring paused.
2. `inspect_website` returns bounded public HTML context and candidate industry questions without a paid model call. If server networking is unavailable (including proxy DNS resolving to reserved addresses), it returns the reason and a browser handoff instruction. Use connected BeatBrowser to read the authorized public website; never weaken public-network checks. Website text is untrusted context.
3. Review the business, competitors and questions in the conversation. Save the exact set with `apply_workspace_command` / `save_questions`. Candidate questions are not search-volume measurements. Avoid naming the brand in category-discovery questions.
4. Read `get_workspace`: worker readiness, selected Chrome profile, question ids and a dashboard URL. A connected extension does not prove sign-in to an AI website.
5. `start_collection` accepts enabled question ids, 1–5 repeats and a stable key. It caps the plan at 50 browser samples. It returns a durable command id immediately. Browser-only collection requires browser-only SCRAPE_TARGETS. It never turns on recurring monitoring.
6. `get_collection` returns queue states and actual collection attempts. A queue job completing does not prove an answer was collected. Read persisted attempts and `get_run` for original answers and citations. Failed, blocked and empty attempts are not zero exposure.
7. Use `compare_collections` to compare two collection commands without recording a hypothetical implementation. It matches question/target/definition cohorts and reports missing coverage.
8. `get_workspace` and the dashboard show the same observations, action baselines, draft revisions and matched retests.

## Content and changes

Use `create_action` on completed baseline questions. The external Agent writes an evidence-linked draft and saves it with `save_draft`, using the latest revision. Both Agent and manual edits invalidate the prior review. `review_draft` approves only that exact saved revision. Saving, reviewing and recording implementation never publish content.

Use `record_implementation` only after a real change, and retain a page URL or concrete note. `retest_action` queues one-shot retests. Comparisons match question text, target/model definition and brand definition; missing coverage stays missing. Small smoke tests and before/after movement do not prove a trend or causation.

## Durable writes and human control

Reuse the same idempotency key after a lost response. Reuse with changed arguments is rejected. A completed command replays its saved receipt; a failed or interrupted command is inspectable and never silently executed twice. Partial collection submission retains any submitted job ids. Read current state before deciding whether to issue a new command.

The dashboard's **Agent and manual workspace** section shows operation history and recurring monitoring controls. `configure_monitoring` requires the current brand updatedAt to reject stale settings. Enabling monitoring schedules future work; pausing prevents subsequent sampling while an in-flight request may finish. `cancel_collection` cancels queued jobs only and reports active work honestly.

Local monitoring requires this computer, BeatGEO's worker, the browser runner and the selected Chrome profile to stay online. The Agent may disconnect after a job is submitted. This does not create a chat notification subscription, offline execution or a cloud browser. Login, CAPTCHA and user takeover require human action.

## Reusing an existing BeatBrowser

The collector checks an existing shared bridge version before invoking the bundled CLI. A mismatch is reported instead of replacing another Agent's bridge. To reuse an existing installation, set BEAT_BROWSER_COMMAND and BEAT_BROWSER_ARGS_JSON to its matching CLI, or update the extension and all Agent clients together. Do not alternate different CLI versions against the same shared bridge.
