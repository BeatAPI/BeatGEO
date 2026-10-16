import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

// A fresh database makes this command safe to repeat beside a real local instance.
const root = fileURLToPath(new URL("../", import.meta.url));
const name = `beatgeo-mvp-${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const pnpm = process.env.npm_execpath || "pnpm";
let child;
let created = false;

function docker(args) {
	const result = spawnSync("docker", args, { encoding: "utf8", timeout: 60000 });
	if (result.error || result.status !== 0) throw new Error(`Docker ${args[0]} failed. Check that Docker is running.`);
	return result.stdout.trim();
}

function cleanup() {
	if (created) {
		const result = spawnSync("docker", ["rm", "-f", name], { stdio: "pipe", timeout: 15000 });
		if (result.error || result.status !== 0) {
			console.error(`Could not remove test container ${name}. Run: docker rm -f ${name}`);
			process.exitCode = 1;
		}
		created = false;
	}
}

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.once(signal, () => {
		if (child?.pid) {
			try {
				if (process.platform === "win32") child.kill(signal);
				else process.kill(-child.pid, signal);
			} catch { /* The test process already exited. */ }
		}
		cleanup();
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
	docker(["info", "--format", "{{.ServerVersion}}"]);
	console.log("MVP regression: synthetic provider replies, disposable PostgreSQL; no live AI collection.");
	docker([
		"run", "--detach", "--rm", "--name", name,
		"--publish", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data",
		"--env", "POSTGRES_USER=beatgeo_test", "--env", `POSTGRES_PASSWORD=${password}`,
		"--env", "POSTGRES_DB=beatgeo_mvp_test", "postgres:17",
	]);
	created = true;
	let ready = false;
	for (let attempt = 0; attempt < 30; attempt++) {
		const result = spawnSync("docker", ["exec", name, "pg_isready", "-U", "beatgeo_test"], { stdio: "pipe", timeout: 5000 });
		if (result.status === 0) { ready = true; break; }
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	if (!ready) throw new Error("Test PostgreSQL did not become ready.");
	const address = docker(["port", name, "5432/tcp"]);
	if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error("Test database must bind only to loopback.");
	await run("Browser collector contracts", ["test:browser"]);
	await run("Installer and script tests", ["test:scripts"]);
	await run("Workspace unit tests", ["-r", "--if-present", "test"]);
	await run("Database, queue and retest integration", ["--filter", "@workspace/web", "test:integration"], {
		TEST_DATABASE_URL: `postgres://beatgeo_test:${password}@${address}/beatgeo_mvp_test`,
	});
	console.log("\nMVP regression passed. Live keys, platform sessions, UI and overnight scheduling need separate acceptance.");
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
} finally {
	cleanup();
}
