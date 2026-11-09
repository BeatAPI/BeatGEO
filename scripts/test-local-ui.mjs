import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { availablePort, startEmbeddedDatabase } from "./local-database.mjs";
import { localEnvironment } from "./local-runtime.mjs";
import { migrateTestDatabase } from "../packages/lib/scripts/verify-local-migration.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), "beatgeo-local-ui-"));
let database, web, worker, child;
const pnpm = process.env.npm_execpath || "pnpm";
const command = /\.[cm]?js$/.test(pnpm) ? process.execPath : pnpm;
const prefix = command === process.execPath ? [pnpm] : [];
let env;

async function run(args) {
	await new Promise((resolve, reject) => {
		child = spawn(command, [...prefix, ...args], { cwd: root, env, stdio: "inherit" });
		child.once("error", reject);
		child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Test command failed (${code}): ${args.join(" ")}`)));
	});
	child = undefined;
}
async function stop(process) {
	if (!process || process.exitCode !== null) return;
	await new Promise((resolve) => { process.once("exit", resolve); process.kill("SIGTERM"); });
}
async function cleanup() {
	await stop(child);
	await stop(worker);
	await stop(web);
	await database?.stop();
	await rm(temp, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await cleanup(); process.exit(1); });

try {
	const port = await availablePort(15850);
	const local = localEnvironment({ databasePort: await availablePort(55650) });
	database = await startEmbeddedDatabase(temp, local, { initialize: true });
	const admin = database.getClient();
	await admin.connect();
	await admin.query("CREATE DATABASE beatgeo_ui_test");
	await admin.end();
	const client = database.getClient("beatgeo_ui_test");
	try {
		await client.connect();
		await migrateTestDatabase(client);
	} finally { await client.end(); }
	// No provider credentials are inherited, and Vite reads only the empty temporary env directory.
	const registry = await readFile(path.join(root, "packages/config/src/env-registry.ts"), "utf8");
	const cleared = Object.fromEntries([...registry.matchAll(/name: "([A-Z0-9_]+)"/g)].map((match) => [match[1], ""]));
	env = { ...process.env, ...cleared, ...local,
		DATABASE_URL: local.DATABASE_URL.replace(/\/beatgeo$/, "/beatgeo_ui_test"),
		APP_URL: `http://127.0.0.1:${port}`, BASE_URL: `http://127.0.0.1:${port}`,
		SCRAPE_TARGETS: "stub:stub", ONBOARDING_LLM_TARGET: "stub:stub", ADMIN_API_KEYS: "test-api-key-e2e",
		BROWSER_RUNNER_TOKEN: "",
		PLAYWRIGHT_HTML_OPEN: "never", BEAT_GEO_TEST_ENV_DIR: temp,
	};
	const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
	const entry = path.join(temp, "web.mjs");
	await writeFile(entry, `
import { createServer } from ${JSON.stringify(pathToFileURL(webRequire.resolve("vite")).href)};
const server = await createServer({ root: ${JSON.stringify(path.join(root, "apps/web"))}, envDir: process.env.BEAT_GEO_TEST_ENV_DIR, server: {host:'127.0.0.1', port:${port}, strictPort:true} });
await server.listen();
process.once('SIGTERM', async () => { await server.close(); process.exit(0); });
`);
	web = spawn(process.execPath, [entry], { cwd: path.join(root, "apps/web"), env, stdio: "inherit" });
	const deadline = Date.now() + 120_000;
	while (true) {
		if (web.exitCode !== null) throw new Error("Isolated web server stopped before becoming ready");
		try { if ((await fetch(`${env.APP_URL}/api/setup-status`, { signal: AbortSignal.timeout(5000) })).ok) break; } catch {}
		if (Date.now() > deadline) throw new Error("Isolated web server did not become ready");
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	await run(["--dir", "e2e", "exec", "playwright", "test", "--project=first-run", "--reporter=list"]);
	await run(["--filter", "e2e", "seed"]);
	await run(["--dir", "e2e", "exec", "playwright", "test", "--project=local", "--reporter=list", ...process.argv.slice(2)]);
	await run(["--filter", "e2e", "seed"]);
	await run(["--filter", "e2e", "test:api", "--env-var", `baseUrl=${env.APP_URL}`]);
	await run(["--filter", "e2e", "validate:spec"]);
	const workerRequire = createRequire(new URL("../apps/worker/package.json", import.meta.url));
	worker = spawn(process.execPath, ["--import", workerRequire.resolve("tsx"), "src/index.ts"], {
		cwd: path.join(root, "apps/worker"), env, stdio: "inherit",
	});
	await run(["--dir", "e2e", "exec", "playwright", "test", "--project=worker", "--reporter=list"]);
	await run(["--dir", "e2e", "exec", "tsx", "scheduling/verify-scheduling.ts"]);

} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
} finally { await cleanup(); }
