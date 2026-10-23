import { spawn, execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startEmbeddedDatabase } from "./local-database.mjs";
import { prepareExtension, requireBundledStorage } from "./local-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const envPath = process.argv[2] || path.join(root, ".env");
if (!existsSync(envPath)) throw new Error("Run pnpm local:setup first, or supply your BeatGEO environment file.");
Object.assign(process.env, parseEnv(readFileSync(envPath, "utf8")));
if (process.env.DEPLOYMENT_MODE !== "local") throw new Error("This launcher only starts a local BeatGEO instance.");
requireBundledStorage(process.env);
const app = new URL(process.env.APP_URL || "http://localhost:3140");
if (!["localhost", "127.0.0.1"].includes(app.hostname))
	throw new Error("Use a loopback APP_URL for the local launcher.");
const children = [];
let database;
let stopping = false;
function signal(child, signalName) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	try {
		if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signalName);
		else child.kill(signalName);
	} catch { /* The service already exited. */ }
}
async function stop(code = 0) {
	if (stopping) return;
	stopping = true;
	for (const child of children) signal(child, "SIGTERM");
	await Promise.all(children.map((child) => {
		if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
		return new Promise((resolve) => {
			const timeout = setTimeout(() => { signal(child, "SIGKILL"); resolve(); }, 35_000);
			child.once("exit", () => { clearTimeout(timeout); resolve(); });
		});
	}));
	try { await database?.stop(); } catch { console.error("Local storage did not stop cleanly. Restart BeatGEO before backing up."); code = 1; }
	process.exit(code);
}
function start(command, args) {
	const child = spawn(command, args, { cwd: root, stdio: "inherit", env: process.env, detached: process.platform !== "win32" });
	children.push(child);
	child.on("error", () => { console.error("A local service could not start."); void stop(1); });
	child.on("exit", (code) => { if (!stopping) void stop(code || 1); });
}
process.on("SIGINT", () => { void stop(); });
process.on("SIGTERM", () => { void stop(); });
try {
	await prepareExtension(root);
	database = await startEmbeddedDatabase(root, process.env);
	// Migrations are applied before either application process starts.
	execFileSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "migrate"], {
		cwd: path.join(root, "packages/lib"), stdio: "inherit", env: process.env,
	});
	start(process.execPath, ["apps/browser-lab/server.mjs"]);
	// The shared bridge may serve other agents, so it is not stopped with BeatGEO.
	try {
		execFileSync(process.execPath, ["node_modules/@beatapi/beat-browser/src/cli.js", "doctor", "--json"], {
			cwd: root, timeout: 15000, stdio: "pipe",
		});
	} catch { console.log("Chrome is not connected yet. Complete the extension step in Setup."); }
	start("pnpm", ["--filter", "@workspace/web", "exec", "vite", "--host", "127.0.0.1", "--port", app.port || "3140", "--strictPort"]);
	start("pnpm", ["--filter", "@workspace/worker", "start"]);
	console.log(`BeatGEO workspace: ${app.origin}/\nKeep this terminal running for scheduled monitoring. Ctrl+C stops these services and saves local data.`);
} catch (error) {
	console.error(error instanceof Error ? error.message : "BeatGEO could not start.");
	await stop(1);
}
