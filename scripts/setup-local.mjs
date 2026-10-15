import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLocalEnvironment } from "./local-doctor.mjs";
import { localCompose, localEnvironment, prepareExtension } from "./local-runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(command, args, cwd = root) {
	const result = spawnSync(command, args, { cwd, stdio: "inherit" });
	if (result.error || result.status !== 0) throw new Error(`${command} did not complete. Check the message above.`);
}
async function available(port) {
	await new Promise((resolve, reject) => {
		const server = net.createServer();
		server.on("error", () =>
			reject(new Error(`Port ${port} is occupied. Stop that service or configure BeatGEO manually.`)),
		);
		server.listen(port, "127.0.0.1", () => server.close(resolve));
	});
}

try {
	if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Use Node.js 24 and pnpm 12.4.1.");
	const local = path.join(root, ".beat-geo");
	const resume = process.argv.includes("--resume");
	const configured = existsSync(path.join(root, ".env")) || existsSync(path.join(root, "apps/web/.env"));
	if (configured && !resume)
		throw new Error(
			"Existing configuration found; it has not been changed. Use pnpm local:start. For an interrupted automatic setup, run pnpm local:setup --resume.",
		);
	requireLocalEnvironment();
	let env;
	if (resume) {
		const rootText = await readFile(path.join(root, ".env"), "utf8");
		const webText = await readFile(path.join(root, "apps/web/.env"), "utf8");
		const { parseEnv } = await import("node:util");
		env = parseEnv(rootText);
		const url = new URL(env.DATABASE_URL);
		if (
			rootText !== webText ||
			env.DEPLOYMENT_MODE !== "local" ||
			url.hostname !== "127.0.0.1" ||
			url.port !== "55440" ||
			url.pathname !== "/beatgeo" ||
			(await readFile(path.join(local, "compose.yaml"), "utf8")) !== localCompose(env)
		)
			throw new Error(
				"This is not an unchanged automatic local setup. Follow the self-hosting guide; no database was modified.",
			);
	} else {
		await Promise.all([55440, 3140, 4319].map(available));
		env = localEnvironment();
	}
	run("pnpm", ["install", "--frozen-lockfile"]);
	if (!resume) {
		const text =
			Object.entries(env)
				.map(([key, value]) => `${key}=${value}`)
				.join("\n") + "\n";
		await mkdir(local, { recursive: true, mode: 0o700 });
		await writeFile(path.join(local, "compose.yaml"), localCompose(env), { mode: 0o600, flag: "wx" });
		await writeFile(path.join(root, ".env"), text, { mode: 0o600, flag: "wx" });
		await writeFile(path.join(root, "apps/web/.env"), text, { mode: 0o600, flag: "wx" });
	}
	run("docker", ["compose", "-p", "beatgeo-local", "-f", path.join(local, "compose.yaml"), "up", "-d", "--wait"]);
	run(
		process.execPath,
		["--env-file=../../.env", "node_modules/drizzle-kit/bin.cjs", "migrate"],
		path.join(root, "packages/lib"),
	);
	const extension = await prepareExtension(root);
	console.log(
		`BeatGEO is ready. Included BeatBrowser ${extension.version}.\nRun pnpm local:start, then open ${env.APP_URL}/setup\nLoad the Chrome extension from ${extension.destination}`,
	);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
