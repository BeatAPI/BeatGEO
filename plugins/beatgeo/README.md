# BeatGEO for Cursor — source preview

Connect Cursor to **your own** BeatGEO full application. The included `mcp.json` points to `http://localhost:3140/api/mcp`; replace it with your configured `APP_URL` when appropriate. Sign in to that instance using its supported authentication flow.

This plugin does not create an account, start a database, or connect to a hosted BeatGEO service. The zero-dependency Browser Lab on port 4318 has no MCP endpoint. See [self-hosting](../../docs/self-hosting.md) and [MVP status](../../README.md#mvp-status) before configuring a client.

The local MCP supports website onboarding, one-shot browser collection, evidence, shared content drafts, actions/retests and monitoring controls. See [Agent workflow](../../docs/beat-geo/agent-workflow.md). An Agent and the manual dashboard operate the same project.
