# BeatGeo for Cursor — source preview

Connect Cursor to **your own** BeatGeo full application. The included `mcp.json` points to `http://localhost:3000/api/mcp`; replace it with your configured `APP_URL` when appropriate. Sign in to that instance using its supported authentication flow.

This plugin does not create an account, start a database, or connect to a hosted BeatGeo service. The zero-dependency Browser Lab on port 4318 has no MCP endpoint. See [self-hosting](../../docs/self-hosting.md) and [MVP status](../../README.md#mvp-status) before configuring a client.
