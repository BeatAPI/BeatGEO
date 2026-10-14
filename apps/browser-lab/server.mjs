import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
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
	return { profiles: result.profiles || [], taskSpaces: process.env.BEAT_BROWSER_SPACES !== "0" };
}

async function handle(request, response) {
	if (!allowedRequest(request)) return json(response, 403, { error: "Loopback same-origin requests only." });
	const url = new URL(request.url, `http://127.0.0.1:${port}`);
	if (request.method === "GET" && (await staticAsset(url, response))) return;
	if (request.method === "GET" && url.pathname === "/") {
		response.writeHead(200, {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"X-Frame-Options": "DENY",
		});
		return response.end(await readFile(path.join(here, "public/index.html")));
	}
	if (request.method === "GET" && url.pathname === "/api/bootstrap")
		return json(response, 200, { token, engines: ENGINES });
	if (request.method === "GET" && url.pathname === "/api/health")
		return json(response, 200, { ok: true, collector: "beat-browser", active: Boolean(active) });
	if (request.method === "GET" && url.pathname === "/api/browser") {
		return json(response, 200, await browserStatus());
	}
	if (request.method === "GET" && url.pathname === "/api/runs") {
		const runs = await listRuns(directory);
		return json(response, 200, { runs, summary: summarize(runs), active });
	}
	if (request.method !== "POST" || !["/api/run", "/api/collect"].includes(url.pathname))
		return json(response, 404, { error: "Not found" });
	return handleCollection(request, response, url);
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
		console.log(`BeatGeo Browser Lab: http://127.0.0.1:${port}`);
		console.log("Uses your signed-in Chrome. Runs and answers stay in the gitignored .beat-geo directory.");
	});
