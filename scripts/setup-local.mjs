import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availablePort, startEmbeddedDatabase } from "./local-database.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLocalEnvironment } from "./local-doctor.mjs";
import { localEnvironment, prepareExtension, requireBundledStorage } from "./local-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(command, args, cwd = root, environment = process.env) {
	const result = spawnSync(command, args, { cwd, stdio: "inherit", env: environment });
	if (result.error || result.status !== 0) throw new Error(`${command} did not complete. Check the message above.`);
}
let database;

try {
	if (process.argv.slice(2).some((arg) => arg !== "--resume"))
		throw new Error("Use pnpm local:setup or pnpm local:setup --resume. Local storage is bundled; no database option is needed.");
	if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Run it as pnpm local:setup; pnpm installs and uses the project's Node.js 24.");
	const local = path.join(root, ".beat-geo");
	const resume = process.argv.includes("--resume");
	const configured = existsSync(path.join(root, ".env")) || existsSync(path.join(root, "apps/web/.env"));
	if (configured && !resume)
		throw new Error(
			"Existing configuration found; it has not been changed. Use pnpm local:start. For an interrupted automatic setup, run pnpm local:setup --resume.",
		);
	let env;
	if (resume) {
		const rootText = await readFile(path.join(root, ".env"), "utf8");
		const webText = await readFile(path.join(root, "apps/web/.env"), "utf8");
		const { parseEnv } = await import("node:util");
		env = parseEnv(rootText);
		requireBundledStorage(env);
		const url = new URL(env.DATABASE_URL);
		if (
			rootText !== webText ||
			env.DEPLOYMENT_MODE !== "local" ||
			url.hostname !== "127.0.0.1" ||
			!url.port ||
			url.pathname !== "/beatgeo"
		)
			throw new Error(
				"This is not an unchanged automatic local setup. Follow the self-hosting guide; no database was modified.",
			);
	} else {
		const [databasePort, appPort, browserPort] = await Promise.all([55440, 3140, 4319].map(availablePort));
		env = localEnvironment({ databasePort, appPort, browserPort });
	}
	requireLocalEnvironment();
	run("pnpm", ["install", "--frozen-lockfile"]);
	if (!resume) {
		const text =
			Object.entries(env)
				.map(([key, value]) => `${key}=${value}`)
				.join("\n") + "\n";
		await mkdir(local, { recursive: true, mode: 0o700 });
		await writeFile(path.join(root, ".env"), text, { mode: 0o600, flag: "wx" });
		await writeFile(path.join(root, "apps/web/.env"), text, { mode: 0o600, flag: "wx" });
	}
	database = await startEmbeddedDatabase(root, env, { initialize: true });
	run(
		process.execPath,
		["--env-file=../../.env", "node_modules/drizzle-kit/bin.cjs", "migrate"],
		path.join(root, "packages/lib"),
		{ ...process.env, ...env },
	);
	const extension = await prepareExtension(root);
	console.log(
		`BeatGEO is ready. Included BeatBrowser ${extension.version}.\nRun pnpm local:start, then open ${env.APP_URL}/\nLoad the Chrome extension from ${extension.destination}`,
	);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
} finally {
	await database?.stop();
}
