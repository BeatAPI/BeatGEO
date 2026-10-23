import { spawn, execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startEmbeddedDatabase } from "./local-database.mjs";
import { prepareExtension, requireBundledStorage } from "./local-runtime.mjs";
import { assertCompatibleBridge } from "../apps/browser-lab/core.mjs";

// Ctrl+C must stop the services in order: web and worker first, the database last. A terminal
// signals its whole foreground process group, and the embedded-postgres library also stops the
// database on any SIGINT/SIGTERM it sees, so the worker lost its connections mid-shutdown. The
// launcher and its database therefore run in their own process group, and this outer process
// asks them to stop over IPC, which those signal hooks ignore.
if (process.platform !== "win32" && !process.env.BEATGEO_LAUNCHER) {
	const launcher = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
		stdio: ["inherit", "inherit", "inherit", "ipc"],
		detached: true,
		env: { ...process.env, BEATGEO_LAUNCHER: "1" },
	});
	const forward = () => {
		if (launcher.connected) launcher.send("stop");
	};
	process.on("SIGINT", forward);
	process.on("SIGTERM", forward);
	launcher.on("error", () => process.exit(1));
	launcher.on("exit", (code, signalName) => process.exit(code ?? (signalName ? 1 : 0)));
	await new Promise(() => {});
}

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
function start(command, args, cwd = root) {
	const child = spawn(command, args, { cwd, stdio: "inherit", env: process.env, detached: process.platform !== "win32" });
	children.push(child);
	child.on("error", () => { console.error("A local service could not start."); void stop(1); });
	child.on("exit", (code) => { if (!stopping) void stop(code || 1); });
}
process.on("SIGINT", () => { void stop(); });
process.on("message", (message) => { if (message === "stop") void stop(); });
// The outer process is gone (its terminal closed): stop in order rather than keep running unseen.
process.on("disconnect", () => { void stop(); });
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
		const external = process.env.BEAT_BROWSER_COMMAND;
		if (!external) assertCompatibleBridge(JSON.parse(readFileSync(path.join(root, "node_modules/@beatapi/beat-browser/package.json"), "utf8")).version);
		const prefix = external ? JSON.parse(process.env.BEAT_BROWSER_ARGS_JSON || "[]") : ["node_modules/@beatapi/beat-browser/src/cli.js"];
		if (!Array.isArray(prefix) || !prefix.every((arg) => typeof arg === "string")) throw new Error("Invalid browser CLI arguments.");
		execFileSync(external || process.execPath, [...prefix, "doctor", "--json"], {
			cwd: root, timeout: 15000, stdio: "pipe",
		});
	} catch (error) {
		console.log(error.message?.startsWith("[BROWSER_VERSION_MISMATCH]") ? error.message : "Chrome is not connected yet. Load .beat-geo/extension at chrome://extensions, then sign in to ChatGPT in that Chrome profile.");
	}
	// Started directly rather than through `pnpm --filter … exec`, which reports a stopped child as a failure.
	start(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", app.port || "3140", "--strictPort"], path.join(root, "apps/web"));
	// One process (tsx loaded in place, not its CLI wrapper), so stop() waits for the worker's
	// own graceful shutdown before stopping the database.
	start(process.execPath, ["--import", "tsx", "src/index.ts"], path.join(root, "apps/worker"));
	console.log(`BeatGEO workspace: ${app.origin}/\nKeep this terminal running for scheduled monitoring. Ctrl+C stops these services and saves local data.`);
} catch (error) {
	console.error(error instanceof Error ? error.message : "BeatGEO could not start.");
	await stop(1);
}
