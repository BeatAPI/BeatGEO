import assert from "node:assert/strict";
import { test } from "node:test";
import { localEnvironment, requireBundledStorage } from "./local-runtime.mjs";
test("new installs have isolated credentials and need no paid key or fake collector", () => {
	const first = localEnvironment(),
		second = localEnvironment();
	for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BEAT_GEO_ENCRYPTION_KEY", "BROWSER_RUNNER_TOKEN"])
		assert.notEqual(first[key], second[key]);
	assert.equal(Buffer.from(first.BEAT_GEO_ENCRYPTION_KEY, "base64").length, 32);
	assert.equal(first.SCRAPE_TARGETS, "chatgpt:beat-browser");
	assert.equal(first.BEATAPI_API_KEY, undefined);
	assert.equal(first.ONBOARDING_LLM_TARGET, undefined);
	const url = new URL(first.DATABASE_URL);
	assert.equal(url.hostname, "127.0.0.1");
	assert.equal(url.port, "55440");
});
test("older database configurations are rejected without being changed", () => {
	for (const mode of [undefined, "docker", "external"]) {
		const env = { ...localEnvironment(), BEAT_GEO_DATABASE_MODE: mode };
		const before = { ...env };
		assert.throws(() => requireBundledStorage(env), /existing database and configuration have not been changed/);
		assert.deepEqual(env, before);
	}
	assert.doesNotThrow(() => requireBundledStorage(localEnvironment()));
});

test("installation preflight reports unsupported Node, pnpm and missing Git", async () => {
	const { inspectLocalRequirements } = await import("./local-doctor.mjs");
	const checks = inspectLocalRequirements({
		nodeVersion: "22.0.0",
		run: (command) => command === "pnpm"
			? { status: 0, stdout: "11.0.0" }
			: { status: null, error: new Error("not found") },
	});
	assert.deepEqual(checks.filter((check) => !check.ok).map((check) => check.name), [
		"Node.js 24", "pnpm 12.4.1", "Git",
	]);
	assert(checks.every((check) => check.fix.length > 0));
});
test("installation preflight accepts the supported source-install environment", async () => {
	const { inspectLocalRequirements } = await import("./local-doctor.mjs");
	const checks = inspectLocalRequirements({
		nodeVersion: "24.19.0",
		run: () => ({ status: 0, stdout: "12.4.1\n" }),
	});
	assert(checks.every((check) => check.ok));
});

test("default install does not require Docker or a database command", async () => {
	const { inspectLocalRequirements } = await import("./local-doctor.mjs");
	const commands = [];
	const checks = inspectLocalRequirements({ nodeVersion: "24.19.0", run: (command) => {
		commands.push(command);
		return { status: 0, stdout: "12.4.1" };
	} });
	assert(checks.every((check) => check.ok));
	assert.deepEqual(commands, ["pnpm", "git"]);
	assert.equal(localEnvironment().BEAT_GEO_DATABASE_MODE, "embedded");
});


test("an old Compose file cannot make the environment check require Docker", async () => {
	const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const path = await import("node:path");
	const { spawnSync } = await import("node:child_process");
	const { fileURLToPath } = await import("node:url");
	const dir = await mkdtemp(path.join(tmpdir(), "beatgeo-doctor-"));
	try {
		await mkdir(path.join(dir, ".beat-geo"));
		await writeFile(path.join(dir, ".beat-geo/compose.yaml"), "legacy config: leave unchanged");
		const bin = path.join(dir, "bin");
		await mkdir(bin);
		for (const [name, version] of [["pnpm", "12.4.1"], ["git", "git version 2"]])
			await writeFile(path.join(bin, name), `#!/bin/sh\nprintf '${version}\\n'\n`, { mode: 0o755 });
		const env = { ...process.env, PATH: bin };
		delete env.BEAT_GEO_DATABASE_MODE;
		const result = spawnSync(process.execPath, [fileURLToPath(new URL("./local-doctor.mjs", import.meta.url))], {
			cwd: dir, env, encoding: "utf8", timeout: 10000,
		});
		assert.equal(result.status, 0, result.stderr + result.stdout);
		assert.match(result.stdout, /Local storage is bundled/);
		assert.doesNotMatch(result.stdout, /Docker engine|Docker Compose/);
	} finally { await rm(dir, { recursive: true, force: true }); }
});
