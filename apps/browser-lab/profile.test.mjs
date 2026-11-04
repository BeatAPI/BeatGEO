import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("profile selection requires the local token, rejects unknown profiles and survives restart", {
	timeout: 20000,
}, async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "beatgeo-profile-"));
	const fake = path.join(directory, "fake.mjs");
	await writeFile(
		fake,
		'console.log(JSON.stringify({profiles:[{profileId:"fixture-profile",description:"Fixture Chrome"}]}));',
	);
	const probe = net.createServer();
	probe.listen(0, "127.0.0.1");
	await once(probe, "listening");
	const port = probe.address().port;
	await new Promise((r) => probe.close(r));
	const env = {
		...process.env,
		BROWSER_LAB_PORT: String(port),
		BROWSER_RUNNER_TOKEN: "test-local-token",
		BROWSER_RUNS_DIR: path.join(directory, "runs"),
		BEAT_BROWSER_COMMAND: process.execPath,
		BEAT_BROWSER_ARGS_JSON: JSON.stringify([fake]),
		BEAT_BROWSER_PROFILE_ID: "",
	};
	let child;
	async function start() {
		child = spawn(process.execPath, ["apps/browser-lab/server.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
		await Promise.race([
			once(child.stdout, "data"),
			once(child, "exit").then(() => {
				throw new Error("collector exited");
			}),
		]);
	}
	async function stop() {
		const done = once(child, "exit");
		child.kill("SIGTERM");
		await done;
	}
	const base = `http://127.0.0.1:${port}`;
	const select = (profileId, token = "test-local-token") =>
		fetch(`${base}/api/browser/profile`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ profileId }),
		});
	try {
		await start();
		assert.equal((await select("fixture-profile", "wrong")).status, 403);
		assert.equal((await select("unknown")).status, 400);
		const cross = await fetch(`${base}/api/browser/profile`, {
			method: "POST",
			headers: { Origin: "https://example.com" },
		});
		assert.equal(cross.status, 403);
		assert.equal((await select("fixture-profile")).status, 200);
		assert.deepEqual(JSON.parse(await readFile(path.join(directory, "browser-config.json"), "utf8")), {
			profileId: "fixture-profile",
		});
		await stop();
		await start();
		assert.equal((await (await fetch(`${base}/api/browser`)).json()).selectedProfileId, "fixture-profile");
	} finally {
		if (child.exitCode === null) await stop();
		await rm(directory, { recursive: true, force: true });
	}
});
