import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const entry = fileURLToPath(new URL("./index.ts", import.meta.url));
function cli(args: string[]) {
	return spawnSync(process.execPath, ["--import", "tsx", entry, ...args], {
		encoding: "utf8",
		timeout: 15000,
	});
}

test("the source CLI presents only bundled local operations", () => {
	const result = cli(["--help"]);
	expect(result.status).toBe(0);
	expect(result.stdout).toContain("init|setup");
	expect(result.stdout).toContain("start");
	expect(result.stdout).toContain("doctor");
	expect(result.stdout).not.toMatch(/compose|docker|upgrade/i);
});

test("obsolete container commands fail before running any setup", () => {
	for (const args of [
		["compose", "up"],
		["init", "--docker-dir", "."],
		["init", "--dev"],
	]) {
		const result = cli(args);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/unknown command|unknown option/);
	}
});

test("local commands use the selected workspace and preserve resume arguments", async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), "beatgeo-cli-"));
	try {
		await mkdir(path.join(dir, "scripts"));
		for (const name of ["setup-local", "start-local", "local-doctor"])
			await writeFile(
				path.join(dir, "scripts", `${name}.mjs`),
				`console.log(JSON.stringify({ action: ${JSON.stringify(name)}, cwd: process.cwd(), args: process.argv.slice(2) }));`,
			);
		for (const [args, action, forwarded] of [
			[["init", "--resume"], "setup-local", ["--resume"]],
			[["start"], "start-local", []],
			[["doctor"], "local-doctor", []],
		] as const) {
			const result = cli(["--dir", dir, ...args]);
			expect(result.status).toBe(0);
			expect(JSON.parse(result.stdout)).toEqual({
				action,
				cwd: await import("node:fs/promises").then((fs) => fs.realpath(dir)),
				args: forwarded,
			});
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
