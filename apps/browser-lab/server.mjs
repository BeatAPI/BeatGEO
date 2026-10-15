import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	collect,
	createBrowser,
	defaultRunDirectory,
	ENGINES,
	listRuns,
	saveRun,
	summarize,
	validateInput,
} from "./core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = defaultRunDirectory();
const port = Number(process.env.BROWSER_LAB_PORT || 4318);
const token = process.env.BROWSER_RUNNER_TOKEN || randomBytes(32).toString("hex");
let active = null;
const configPath = path.resolve(directory, "../browser-config.json");
try {
	const saved = JSON.parse(await readFile(configPath, "utf8"));
	if (!process.env.BEAT_BROWSER_PROFILE_ID && typeof saved.profileId === "string")
		process.env.BEAT_BROWSER_PROFILE_ID = saved.profileId;
} catch {
	/* First launch has no saved browser choice. */
}
const bundledRoot = path.resolve(here, "../../node_modules/@beatapi/beat-browser");
const stableExtension = path.resolve(here, "../../.beat-geo/extension");

function json(response, status, body) {
	response.writeHead(status, {
		"Content-Type": "application/json",
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	response.end(JSON.stringify(body));
}

async function bodyOf(request) {
	let text = "";
	for await (const chunk of request) {
		text += chunk;
		if (text.length > 12_000) throw new Error("Request too large.");
	}
	return JSON.parse(text);
}

function allowedRequest(request) {
	const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
	if (!allowed.has(request.headers.host)) return false;
	const origin = request.headers.origin;
	if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)) return false;
	return true;
}

async function executeRun(input) {
	active = { status: "opening" };
	try {
		const result = await collect(input, {
			publish: async (run) => {
				active = { ...run };
				await saveRun(directory, run);
			},
		});
		await saveRun(directory, result);
		return result;
	} finally {
		active = null;
	}
}

function authorized(request) {
	return (
		request.headers["x-beat-geo-token"] === token ||
		request.headers["x-open-profound-token"] === token ||
		request.headers.authorization === `Bearer ${token}`
	);
}

async function staticAsset(url, response) {
	if (/^\/(?:app\.js|evidence\.js|metrics\.js|style\.css|assets\/[a-zA-Z0-9._-]+)$/.test(url.pathname)) {
		const types = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
		const content = await readFile(path.join(here, "public", url.pathname.slice(1)));
		response.writeHead(200, {
			"Content-Type": types[path.extname(url.pathname)] || "application/octet-stream",
			"X-Content-Type-Options": "nosniff",
		});
		response.end(content);
		return true;
	}
	return false;
}

async function browserStatus() {
	const result = JSON.parse(await createBrowser()("spaces", { action: "profiles" }));
	let version = "";
	try {
		version = JSON.parse(await readFile(path.join(bundledRoot, "package.json"), "utf8")).version;
	} catch {
		/* An external CLI can still be used. */
	}
	return {
		profiles: result.profiles || [],
		taskSpaces: process.env.BEAT_BROWSER_SPACES !== "0",
		selectedProfileId: process.env.BEAT_BROWSER_PROFILE_ID || "",
		version,
		extensionPath: existsSync(stableExtension) ? stableExtension : path.join(bundledRoot, "extension"),
	};
}

async function selectProfile(request, response) {
	if (!authorized(request)) return json(response, 403, { error: "Invalid local runner token" });
	if (active) return json(response, 409, { error: "Wait for the active run before changing profiles." });
	const { profileId } = await bodyOf(request);
	const status = await browserStatus();
	if (!status.profiles.some((p) => p.profileId === profileId))
		return json(response, 400, { error: "Choose a connected profile." });
	if (active) return json(response, 409, { error: "A run started; try again after it finishes." });
	await mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
	const temporary = `${configPath}.${randomBytes(8).toString("hex")}.tmp`;
	await writeFile(temporary, JSON.stringify({ profileId }), { mode: 0o600 });
	await rename(temporary, configPath);
	process.env.BEAT_BROWSER_PROFILE_ID = profileId;
	return json(response, 200, await browserStatus());
}

async function handle(request, response) {
	if (!allowedRequest(request)) return json(response, 403, { error: "Loopback same-origin requests only." });
	const url = new URL(request.url, `http://127.0.0.1:${port}`);
	if (request.method === "GET") return handleRead(url, response);
	if (request.method === "POST" && url.pathname === "/api/browser/profile") return selectProfile(request, response);
	if (request.method !== "POST" || !["/api/run", "/api/collect"].includes(url.pathname))
		return json(response, 404, { error: "Not found" });
	return handleCollection(request, response, url);
}

async function handleRead(url, response) {
	if (await staticAsset(url, response)) return;
	if (url.pathname === "/") {
		response.writeHead(200, {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Frame-Options": "DENY",
		});
		return response.end(await readFile(path.join(here, "public/index.html")));
	}
	if (url.pathname === "/api/bootstrap") return json(response, 200, { token, engines: ENGINES });
	if (url.pathname === "/api/health")
		return json(response, 200, { ok: true, collector: "beat-browser", active: Boolean(active) });
	if (url.pathname === "/api/browser") {
		return json(response, 200, await browserStatus());
	}
	if (url.pathname === "/api/runs") {
		const runs = await listRuns(directory);
		return json(response, 200, { runs, summary: summarize(runs), active });
	}
	return json(response, 404, { error: "Not found" });
}

async function handleCollection(request, response, url) {
	if (!authorized(request)) return json(response, 403, { error: "Invalid local runner token" });
	if (active) return json(response, 409, { error: "A browser run is already active. Wait before submitting another." });
	const input = validateInput(await bodyOf(request));
	if (active) return json(response, 409, { error: "A browser run started while this request was being read." });
	const operation = executeRun(input);
	if (url.pathname === "/api/collect") return json(response, 200, await operation);
	operation.catch((error) => console.error("Run failed:", error.message));
	return json(response, 202, { accepted: true });
}

http
	.createServer((request, response) => {
		handle(request, response).catch((error) => json(response, 400, { error: error.message }));
	})
	.listen(port, "127.0.0.1", () => {
		console.log(`BeatGEO Browser Lab: http://127.0.0.1:${port}`);
		console.log("Uses your signed-in Chrome. Runs and answers stay in the gitignored .beat-geo directory.");
	});
