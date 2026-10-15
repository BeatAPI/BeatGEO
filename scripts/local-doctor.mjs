import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REQUIREMENTS = [
	["pnpm", ["--version"], "pnpm 12.4.1", "Install pnpm 12.4.1.", (value) => value.trim() === "12.4.1"],
	["git", ["--version"], "Git", "Install Git; the pinned BeatBrowser dependency uses it."],
	[
		"docker", ["info", "--format", "{{.ServerVersion}}"], "Docker engine",
		"Install and start Docker Desktop or a Docker engine.",
	],
	["docker", ["compose", "version", "--short"], "Docker Compose", "Install Docker Compose v2 or update Docker Desktop."],
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
	const checks = inspectLocalRequirements();
	for (const check of checks)
		console.log(`${check.ok ? "OK" : "NEEDS ACTION"} · ${check.name}${check.ok ? "" : ` — ${check.fix}`}`);
	console.log("Chrome: install it on this computer, then load the bundled BeatBrowser extension in Setup.");
	console.log("This check does not create a database, install extensions or call paid APIs.");
	process.exitCode = checks.every((check) => check.ok) ? 0 : 1;
}
