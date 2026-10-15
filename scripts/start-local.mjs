import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareExtension } from "./local-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const envPath = process.argv[2] || path.join(root, ".env");
if (!existsSync(envPath)) throw new Error("Run pnpm local:setup first, or supply your BeatGEO environment file.");
process.loadEnvFile(envPath);
if (process.env.DEPLOYMENT_MODE !== "local") throw new Error("This launcher only starts a local BeatGEO instance.");
await prepareExtension(root);
const compose = path.join(root, ".beat-geo/compose.yaml");
if (!process.argv[2] && existsSync(compose))
	execFileSync("docker", ["compose", "-p", "beatgeo-local", "-f", compose, "up", "-d", "--wait"], { stdio: "inherit" });
const children = [];
let stopping = false;
function stop(code = 0) {
	if (stopping) return;
	stopping = true;
	for (const child of children) {
		try {
			if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
			else child.kill("SIGTERM");
		} catch {
			/* This service already exited. */
		}
	}
	process.exitCode = code;
	setTimeout(() => process.exit(code), 2000).unref();
}
function start(command, args) {
	const child = spawn(command, args, {
		cwd: root,
		stdio: "inherit",
		env: process.env,
		detached: process.platform !== "win32",
	});
	children.push(child);
	child.on("error", () => {
		console.error("A local service could not start.");
		stop(1);
	});
	child.on("exit", (code) => {
		if (!stopping) stop(code || 1);
	});
}
const app = new URL(process.env.APP_URL || "http://localhost:3140");
if (!["localhost", "127.0.0.1"].includes(app.hostname))
	throw new Error("Use a loopback APP_URL for the local launcher.");
start(process.execPath, ["apps/browser-lab/server.mjs"]);
// Doctor reuses the existing shared bridge, or starts it once. Do not stop it
// with BeatGEO: other agents may still be using that connection.
try {
	execFileSync(process.execPath, ["node_modules/@beatapi/beat-browser/src/cli.js", "doctor", "--json"], {
		cwd: root,
		timeout: 15000,
		stdio: "pipe",
	});
} catch {
	console.log("Chrome is not connected yet. Complete the extension step in Setup.");
}
start("pnpm", [
	"--filter",
	"@workspace/web",
	"exec",
	"vite",
	"--host",
	"127.0.0.1",
	"--port",
	app.port || "3140",
	"--strictPort",
]);
start("pnpm", ["--filter", "@workspace/worker", "start"]);
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
console.log(
	`BeatGEO setup: ${app.origin}/setup\nKeep this terminal running for scheduled monitoring. Ctrl+C stops these services.`,
);
