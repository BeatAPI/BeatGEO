import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

test("async collection acknowledges durable evidence and can be polled without another submission", {
	timeout: 20000,
}, async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "beatgeo-async-"));
	const fake = path.join(directory, "fake.mjs");
	await writeFile(
		fake,
		`
import {existsSync,writeFileSync} from 'node:fs';
const tool=process.argv[3], p=JSON.parse(process.argv[4]), sent=${JSON.stringify(path.join(directory, "sent"))};
if(tool==='spaces') console.log(JSON.stringify({spaceId:'fixture-space',tabId:42,state:'running'}));
else if(tool==='snapshot') console.log('# ChatGPT');
else if(tool==='type') {if(existsSync(sent))throw Error('Duplicate submission');writeFileSync(sent,'1');console.log('Typed');}
else if(p.selector.includes('contenteditable')) console.log('[{"label":"Ask"}]');
else if(p.selector.includes('aria-busy')||p.selector.includes('a[href]'))console.log('[]');
else console.log(existsSync(sent)?'[{"text":"A completed fixture answer."}]':'[]');
`,
	);
	const probe = net.createServer().listen(0, "127.0.0.1");
	await once(probe, "listening");
	const port = probe.address().port;
	await new Promise((resolve) => probe.close(resolve));
	const child = spawn(process.execPath, ["apps/browser-lab/server.mjs"], {
		env: {
			...process.env,
			BROWSER_LAB_PORT: String(port),
			BROWSER_RUNNER_TOKEN: "fixture-token",
			BROWSER_RUNS_DIR: path.join(directory, "runs"),
			BEAT_BROWSER_COMMAND: process.execPath,
			BEAT_BROWSER_ARGS_JSON: JSON.stringify([fake]),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	try {
		await Promise.race([
			once(child.stdout, "data"),
			once(child, "exit").then(() => {
				throw Error("Runner exited");
			}),
		]);
		const base = `http://127.0.0.1:${port}/api/collect`;
		const submit = () =>
			fetch(base, {
				method: "POST",
				headers: { Authorization: "Bearer fixture-token", Prefer: "respond-async", "Content-Type": "application/json" },
				body: JSON.stringify({ engine: "chatgpt", prompt: "Which providers?" }),
			});
		const response = await submit();
		assert.equal(response.status, 202);
		const { runId } = await response.json();
		assert.equal(JSON.parse(await readFile(path.join(directory, "runs", `${runId}.json`), "utf8")).id, runId);
		assert.equal((await fetch(`${base}/${runId}`)).status, 403);
		assert.equal((await submit()).status, 409);
		let run;
		do {
			await delay(500);
			const progress = await fetch(`${base}/${runId}`, { headers: { Authorization: "Bearer fixture-token" } });
			assert.equal(progress.status, 200);
			run = await progress.json();
		} while (["opening", "submitting", "waiting"].includes(run.status));
		assert.equal(run.status, "completed");
		assert.equal(run.answer, "A completed fixture answer.");
		assert.equal(await readFile(path.join(directory, "sent"), "utf8"), "1");
	} finally {
		if (child.exitCode === null) {
			const stopped = once(child, "exit");
			child.kill("SIGTERM");
			await stopped;
		}
		await rm(directory, { recursive: true, force: true });
	}
});
