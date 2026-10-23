#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { getPackageVersion } from "./version.js";

function workspaceRoot(explicitDir?: string): string {
	let candidate = explicitDir ? path.resolve(explicitDir) : path.dirname(fileURLToPath(import.meta.url));
	while (!existsSync(path.join(candidate, "scripts/setup-local.mjs"))) {
		const parent = path.dirname(candidate);
		if (explicitDir || parent === candidate)
			throw new Error("Run this CLI from the BeatGEO source checkout, or pass --dir with its path.");
		candidate = parent;
	}
	return candidate;
}

function runLocal(action: string, options: { dir?: string }, args: string[] = []): void {
	const root = workspaceRoot(options.dir);
	const script = action === "setup" ? "setup-local.mjs" : action === "start" ? "start-local.mjs" : "local-doctor.mjs";
	const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
		cwd: root,
		env: process.env,
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
}

async function main() {
	const program = new Command();
	program
		.name("beatgeo")
		.version(await getPackageVersion())
		.description("Run the local BeatGEO workspace with bundled storage")
		.option("--dir <path>", "BeatGEO source checkout")
		.configureHelp({ showGlobalOptions: true });
	program
		.command("init")
		.alias("setup")
		.description("prepare local storage and the browser extension")
		.option("--resume", "resume an interrupted local setup")
		.action((_options: object, command: Command) => {
			const options = command.optsWithGlobals<{ dir?: string; resume?: boolean }>();
			runLocal("setup", options, options.resume ? ["--resume"] : []);
		});
	program
		.command("start")
		.description("start the local web app, collector and worker")
		.argument("[env-file]", "Local environment file")
		.action((envFile: string | undefined, _options: object, command: Command) => {
			runLocal("start", command.optsWithGlobals(), envFile ? [path.resolve(envFile)] : []);
		});
	program
		.command("doctor")
		.description("check local prerequisites without changing data")
		.action((_options: object, command: Command) => runLocal("doctor", command.optsWithGlobals()));
	await program.parseAsync(process.argv);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
