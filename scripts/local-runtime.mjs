import { randomBytes } from "node:crypto";
import { cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export function localEnvironment({ databasePort = 55440, appPort = 3140, browserPort = 4319 } = {}) {
	const password = randomBytes(24).toString("hex");
	return {
		DATABASE_URL: `postgres://beatgeo:${password}@127.0.0.1:${databasePort}/beatgeo`,
		DEPLOYMENT_MODE: "local",
		BEAT_GEO_DATABASE_MODE: "embedded",
		BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
		BEAT_GEO_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
		DISABLE_TELEMETRY: "1",
		APP_URL: `http://localhost:${appPort}`,
		VITE_APP_URL: `http://localhost:${appPort}`,
		SCRAPE_TARGETS: "chatgpt:beat-browser",
		RUNS_PER_PROMPT: "1",
		BROWSER_RUNNER_URL: `http://127.0.0.1:${browserPort}`,
		BROWSER_LAB_PORT: String(browserPort),
		BROWSER_RUNNER_TOKEN: randomBytes(32).toString("hex"),
	};
}

export function requireBundledStorage(env) {
	if (env.BEAT_GEO_DATABASE_MODE !== "embedded")
		throw new Error("Local setup and startup require bundled storage. Your existing database and configuration have not been changed. See docs/self-hosting.md before moving data from an older installation.");
}

export async function prepareExtension(root) {
	const source = path.join(root, "node_modules/@beatapi/beat-browser/extension");
	const destination = path.join(root, ".beat-geo/extension");
	const manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));
	await mkdir(destination, { recursive: true });
	await cp(source, destination, { recursive: true });
	return { version: manifest.version, destination };
}
