import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const load = (name) => import(pathToFileURL(require.resolve(`@modelcontextprotocol/sdk/${name}.js`)).href);
const { Client } = await load("client/index");
const { StreamableHTTPClientTransport } = await load("client/streamableHttp");
const { Server } = await load("server/index");
const { StdioServerTransport } = await load("server/stdio");
const { ListToolsRequestSchema, CallToolRequestSchema } = await load("types");

const fileIndex = process.argv.indexOf("--key-file");
let config = {};
if (fileIndex !== -1) {
	const file = process.argv[fileIndex + 1];
	if (!file) throw new Error("Supply a private environment file after --key-file.");
	const info = await stat(file);
	if (process.platform !== "win32" && (info.mode & 0o077)) throw new Error("The MCP key file must be private (chmod 600).");
	config = parseEnv(await readFile(file, "utf8"));
}
const token = process.env.BEAT_GEO_MCP_TOKEN || config.BEAT_GEO_MCP_TOKEN;
if (!token) throw new Error("Set BEAT_GEO_MCP_TOKEN to a dashboard-issued key, or provide --key-file. Credentials are never printed.");
const url = new URL(process.env.BEAT_GEO_MCP_URL || config.BEAT_GEO_MCP_URL || "http://localhost:3140/api/mcp");
if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/api/mcp" || url.search || url.hash) throw new Error("The local launcher only connects to a loopback /api/mcp endpoint.");
const client = new Client({ name: "beatgeo-local-stdio", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: "error" } }));
const server = new Server({ name: "beatgeo", version: client.getServerVersion()?.version || "1.0.0" }, { capabilities: { tools: {} }, instructions: client.getInstructions() });
server.setRequestHandler(ListToolsRequestSchema, () => client.listTools());
server.setRequestHandler(CallToolRequestSchema, (request) => client.callTool(request.params));
server.onclose = () => { void client.close(); };
await server.connect(new StdioServerTransport());
