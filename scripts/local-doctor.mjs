import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REQUIREMENTS = [
	["pnpm", ["--version"], "pnpm 12.4.1", "Install pnpm 12.4.1.", (value) => value.trim() === "12.4.1"],
	["git", ["--version"], "Git", "Install Git; the pinned BeatBrowser dependency uses it."],
];

export function inspectLocalRequirements({ nodeVersion = process.versions.node, run = spawnSync } = {}) {
	const checks = [{ name: "Node.js 24", ok: nodeVersion.split(".")[0] === "24", fix: "Install and select Node.js 24." }];
	for (const [command, args, name, fix, accepts] of REQUIREMENTS) {
		const result = run(command, args, { encoding: "utf8", timeout: 5000, stdio: "pipe" });
		checks.push({ name, ok: !result.error && result.status === 0 && (!accepts || accepts(result.stdout)), fix });
	}
	return checks;
}

export function requireLocalEnvironment() {
	const checks = inspectLocalRequirements();
	const failed = checks.filter((check) => !check.ok);
	if (failed.length) throw new Error(failed.map((check) => `${check.name}: ${check.fix}`).join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (existsSync(".env")) process.loadEnvFile(".env");
	const checks = inspectLocalRequirements();
	if (process.env.BEAT_GEO_DATABASE_MODE && process.env.BEAT_GEO_DATABASE_MODE !== "embedded")
		checks.push({ name: "Bundled local storage", ok: false, fix: "Existing database and configuration were left unchanged. See docs/self-hosting.md before moving data from an older installation." });
	for (const check of checks)
		console.log(`${check.ok ? "OK" : "NEEDS ACTION"} · ${check.name}${check.ok ? "" : ` — ${check.fix}`}`);
	console.log("Local storage is bundled and managed by BeatGEO. No separate database installation is needed.");
	console.log("Chrome: install it on this computer, then load the bundled BeatBrowser extension in Setup.");
	console.log("This check does not create a database, install extensions or call paid APIs.");
	process.exitCode = checks.every((check) => check.ok) ? 0 : 1;
}
