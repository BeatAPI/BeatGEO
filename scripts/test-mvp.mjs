import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { availablePort, startEmbeddedDatabase } from "./local-database.mjs";
import { localEnvironment } from "./local-runtime.mjs";
import { fileURLToPath } from "node:url";

// A fresh database makes this command safe to repeat beside a real local instance.
const root = fileURLToPath(new URL("../", import.meta.url));
const pnpm = process.env.npm_execpath || "pnpm";
let child;
let database;
let temporaryRoot;
async function cleanup() {
	await database?.stop();
	if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.once(signal, async () => {
		if (child?.pid) {
			try {
				if (process.platform === "win32") child.kill(signal);
				else process.kill(-child.pid, signal);
			} catch { /* The test process already exited. */ }
		}
		await cleanup();
		process.exit(signal === "SIGINT" ? 130 : 143);
	});
}

async function run(label, args, env = {}) {
	console.log(`\n${label}`);
	const command = /\.[cm]?js$/.test(pnpm) ? process.execPath : pnpm;
	const commandArgs = command === process.execPath ? [pnpm, ...args] : args;
	await new Promise((resolve, reject) => {
		child = spawn(command, commandArgs, {
			cwd: root, stdio: "inherit", detached: process.platform !== "win32",
			env: { ...process.env, ...env },
		});
		child.once("error", reject);
		child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${label} failed (${code}).`)));
	});
	child = undefined;
}

try {
	if (process.versions.node.split(".")[0] !== "24") throw new Error("Select Node.js 24 before running pnpm test:mvp.");
	console.log("MVP regression: synthetic provider replies, disposable bundled PostgreSQL; no Docker or live AI calls.");
	temporaryRoot = await mkdtemp(path.join(tmpdir(), "beatgeo-mvp-"));
	const env = localEnvironment({ databasePort: await availablePort(55550) });
	database = await startEmbeddedDatabase(temporaryRoot, env, { initialize: true });
	const first = database.getClient();
	await first.connect();
	await first.query("CREATE TABLE restart_probe (id integer primary key)");
	await first.query("INSERT INTO restart_probe VALUES (1)");
	await first.query("BEGIN");
	await first.query("INSERT INTO restart_probe VALUES (2)");
	await first.query("ROLLBACK");
	await first.query("CREATE DATABASE beatgeo_mvp_test");
	await first.end();
	await assert.rejects(() => startEmbeddedDatabase(temporaryRoot, env), /port is in use/);
	await database.stop();
	database = await startEmbeddedDatabase(temporaryRoot, env);
	await Promise.all(Array.from({ length: 8 }, async () => {
		const client = database.getClient();
		try {
			await client.connect();
			assert.deepEqual((await client.query("SELECT id FROM restart_probe")).rows, [{ id: 1 }]);
		} finally { await client.end(); }
	}));
	console.log("Bundled storage: restart, rollback, concurrent connections and duplicate-instance protection passed.");
	await run("Browser collector contracts", ["test:browser"]);
	await run("Installer and script tests", ["test:scripts"]);
	await run("Workspace unit tests", ["-r", "--if-present", "test"]);
	await run("Database, queue and retest integration", ["--filter", "@workspace/web", "test:integration"], {
		TEST_DATABASE_URL: env.DATABASE_URL.replace(/\/beatgeo$/, "/beatgeo_mvp_test"),
	});
	console.log("\nMVP regression passed. Live keys, platform sessions, UI and overnight scheduling need separate acceptance.");
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
} finally {
	await cleanup();
}
