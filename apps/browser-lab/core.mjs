import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
export const ENGINES = {
	chatgpt: {
		name: "ChatGPT",
		url: "https://chatgpt.com/?temporary-chat=true",
		input: '[contenteditable="true"][role="textbox"][data-composer-markdown], #prompt-textarea',
		answer:
			'[data-markdown-text-style="assistant-message"]:not([data-markdown-text-tone]), [data-message-author-role="assistant"] .markdown',
	},
	gemini: {
		name: "Gemini",
		url: "https://gemini.google.com/app",
		input: '.ql-editor[contenteditable="true"]',
		answer: "model-response message-content .markdown",
	},
};

export function parseRows(text) {
	// The browser bridge may prepend a navigation notice to otherwise valid JSON.
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== "[" || (i > 0 && text[i - 1] !== "\n")) continue;
		try {
			const result = JSON.parse(text.slice(i));
			if (Array.isArray(result)) return result;
		} catch {
			// A notice containing brackets is not the structured result.
		}
	}
	throw new Error("Browser returned no structured rows; inspect the tab before retrying.");
}

export function createBrowser(env = process.env) {
	const bundled = fileURLToPath(new URL("../../node_modules/@beatapi/beat-browser/src/cli.js", import.meta.url));
	const useBundle = !env.BEAT_BROWSER_COMMAND && existsSync(bundled);
	const command = env.BEAT_BROWSER_COMMAND || (useBundle ? process.execPath : "beat-browser");
	const prefix = useBundle ? [bundled] : JSON.parse(env.BEAT_BROWSER_ARGS_JSON || "[]");
	if (!Array.isArray(prefix) || !prefix.every((value) => typeof value === "string")) {
		throw new Error("BEAT_BROWSER_ARGS_JSON must be a JSON array of command arguments.");
	}
	return async (tool, params) => {
		const { stdout } = await execute(command, [...prefix, "call", tool, JSON.stringify(params)], {
			timeout: 45_000,
			maxBuffer: 4 * 1024 * 1024,
		});
		if (/^\[[A-Z][A-Z_]+\]/m.test(stdout)) throw new Error(stdout);
		return stdout;
	};
}

export function validateInput(input) {
	if (!input || typeof input !== "object") throw new Error("Collection input is required.");
	if (!Object.hasOwn(ENGINES, input.engine)) throw new Error("Choose chatgpt or gemini.");
	if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 4000) {
		throw new Error("Prompt must contain 1–4000 characters.");
	}
	return {
		engine: input.engine,
		prompt: input.prompt.trim(),
		brand: typeof input.brand === "string" ? input.brand.trim().slice(0, 120) : "BeatAPI",
		aliases: Array.isArray(input.aliases) ? input.aliases.filter((x) => typeof x === "string").slice(0, 10) : [],
		profileId: typeof input.profileId === "string" ? input.profileId.trim().slice(0, 120) : undefined,
	};
}

export function detectMention(text, brand, aliases = []) {
	return [brand, ...aliases].filter(Boolean).some((name) => {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
	});
}

export function cleanCitations(rows, engine) {
	const ownHost = new URL(ENGINES[engine].url).hostname;
	const seen = new Set();
	return rows.flatMap((row) => {
		try {
			const url = new URL(row.url);
			if (!/^https?:$/.test(url.protocol) || url.hostname === ownHost || seen.has(url.href)) return [];
			seen.add(url.href);
			return [{ url: url.href, title: String(row.title || url.hostname), source: "visible-answer-link" }];
		} catch {
			return [];
		}
	});
}

export { summarize } from "./public/metrics.js";

export function defaultRunDirectory(env = process.env) {
	if (env.BROWSER_RUNS_DIR) return path.resolve(env.BROWSER_RUNS_DIR);
	const legacy = fileURLToPath(new URL("../../.open-profound/runs", import.meta.url));
	const current = fileURLToPath(new URL("../../.beat-geo/runs", import.meta.url));
	return !existsSync(current) && existsSync(legacy) ? legacy : current;
}

export async function saveRun(directory, run) {
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const filename = path.join(directory, `${run.id}.json`);
	const temporary = `${filename}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(run, null, 2), { mode: 0o600 });
	await rename(temporary, filename);
}

export async function listRuns(directory) {
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const files = (await readdir(directory)).filter((file) => /^[a-f0-9-]+\.json$/.test(file));
	const runs = await Promise.all(
		files.map(async (file) => JSON.parse(await readFile(path.join(directory, file), "utf8"))),
	);
	return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function isBusy(snapshot) {
	return /button\s+"(?:停止|停止回答|停止生成|Stop|Stop generating|Stop response)"/i.test(snapshot);
}

function checkAttention(snapshot) {
	if (/verify you are human|确认您是真人|验证您是真人|人机验证|captcha challenge/i.test(snapshot)) {
		throw new Error("Browser verification needs operator attention. Nothing will be retried automatically.");
	}
}

async function queryRows(browser, tabId, selector, extract) {
	return parseRows(await browser("query", { tabId, selector, extract, limit: 100 }));
}

async function waitForInput(browser, tabId, selector, delay) {
	for (let attempt = 0; attempt < 12; attempt++) {
		try {
			const rows = await queryRows(browser, tabId, selector, { label: ".@aria-label" });
			if (rows.length) return;
		} catch (error) {
			// A newly created background page can still be attaching its content script.
			// Only re-read readiness; never reload, refocus, resume or repeat a submission.
			if (!String(error.message).includes("[PAGE_BUSY]")) throw error;
			if (attempt === 11) throw error;
		}
		await delay(2500);
	}
	throw new Error("No composer found. Open the tab and check login or a changed page layout. No prompt was sent.");
}

async function currentAnswer(browser, tabId, engine) {
	const rows = await queryRows(browser, tabId, ENGINES[engine].answer, { text: ".@text" });
	return (
		rows
			.map((row) => row.text || "")
			.filter(Boolean)
			.at(-1) || ""
	);
}

async function awaitAnswer(browser, run, deadline, delay, publish) {
	let previous = "";
	let stable = 0;
	while (Date.now() < deadline) {
		const snapshot = await browser("snapshot", { tabId: run.tabId });
		checkAttention(snapshot);
		const answer = await currentAnswer(browser, run.tabId, run.engine);
		const busyRows = await queryRows(
			browser,
			run.tabId,
			ENGINES[run.engine].answer
				.split(", ")
				.flatMap((selector) => [`${selector} [aria-busy="true"]`, `${selector}[aria-busy="true"]`])
				.join(", "),
			{ busy: ".@aria-busy" },
		);
		stable = answer && answer === previous && !isBusy(snapshot) && !busyRows.length ? stable + 1 : 0;
		previous = answer;
		if (answer) run.partialAnswer = answer;
		if (stable >= 2) return answer;
		await publish(run);
		await delay(4000);
	}
	throw new Error("Timed out waiting for a completed answer. The prompt will not be resubmitted automatically.");
}

async function openRunPage(config, run, transport, useSpaces) {
	if (useSpaces) {
		const space = JSON.parse(
			await transport("spaces", {
				action: "open",
				url: ENGINES[config.engine].url,
				label: `BeatGEO · ${ENGINES[config.engine].name}`,
				profileId: config.profileId || process.env.BEAT_BROWSER_PROFILE_ID || undefined,
			}),
		);
		run.spaceId = space.spaceId;
		run.tabId = space.tabId;
		run.executionMode = "beat-browser-taskspace";
		if (!run.spaceId || !Number.isInteger(run.tabId)) throw new Error("TaskSpace returned no usable page handle.");
		if (space.state !== "running")
			throw new Error("Background TaskSpace could not start; inspect its state before retrying.");
	} else {
		const opened = await transport("tabs", {
			action: "new",
			url: ENGINES[config.engine].url,
			label: `BeatGEO · ${ENGINES[config.engine].name}`,
		});
		const match = opened.match(/(?:tab\s*)?\[(\d+)\]/i);
		if (!match) throw new Error("Browser did not return a tab ID.");
		run.tabId = Number(match[1]);
		run.executionMode = "background-tab";
	}
}

async function releaseRunPage(run, transport) {
	if (!run.spaceId) return;
	try {
		await transport("spaces", { action: "finish", spaceId: run.spaceId, keep: "all" });
	} catch {
		run.cleanupWarning = "TaskSpace did not confirm release. Inspect it before another task.";
	}
}

export async function collect(input, options = {}) {
	const config = validateInput(input);
	const transport = options.browser || createBrowser();
	const browser = (tool, params) => transport(tool, run.spaceId ? { ...params, spaceId: run.spaceId } : params);
	const delay = options.delay || sleep;
	const publish = options.publish || (async () => {});
	const run = {
		id: randomUUID(),
		...config,
		status: "opening",
		startedAt: new Date().toISOString(),
		surface: "consumer-web-ui",
		collector: "beat-browser",
		collectorVersion: "beatgeo-browser-v0.2",
		accountContext: config.engine === "chatgpt" ? "temporary-chat-requested" : "existing-account-new-chat",
		region: null,
		modelVersion: null,
		brandMentioned: null,
		citations: [],
		submissionAttempted: false,
		attempts: 1,
		timeoutMs: options.timeoutMs || 900_000,
	};
	await publish(run);
	try {
		await openRunPage(config, run, transport, options.spaces ?? process.env.BEAT_BROWSER_SPACES !== "0");
		await waitForInput(browser, run.tabId, ENGINES[config.engine].input, delay);
		checkAttention(await browser("snapshot", { tabId: run.tabId }));
		const existing = await currentAnswer(browser, run.tabId, config.engine);
		if (existing) throw new Error("This tab already contains an answer. Start a new conversation before collecting.");
		run.status = "submitting";
		run.submissionAttempted = true;
		await publish(run);
		await browser("type", {
			tabId: run.tabId,
			selector: ENGINES[config.engine].input,
			text: config.prompt,
			submit: true,
		});
		run.status = "waiting";
		await publish(run);
		run.answer = await awaitAnswer(browser, run, Date.now() + (options.timeoutMs || 900_000), delay, publish);
		const anchors = await queryRows(
			browser,
			run.tabId,
			ENGINES[config.engine].answer
				.split(", ")
				.map((selector) => `${selector} a[href]`)
				.join(", "),
			{ url: ".@href", title: ".@text" },
		);
		run.citations = cleanCitations(anchors, config.engine);
		run.citationCoverage = "visible-answer-links-only; collapsed-source-panels-not-expanded";
		run.brandMentioned = config.brand ? detectMention(run.answer, config.brand, config.aliases) : null;
		run.status = "completed";
		delete run.partialAnswer;
	} catch (error) {
		run.status = String(error.message).startsWith("Timed out") ? "timeout" : "needs_attention";
		run.errorCode = failureCode(error);
		run.error = String(error.message).slice(0, 500);
	}
	await releaseRunPage(run, transport);
	return { ...run, finishedAt: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(run.startedAt) };
}

function failureCode(error) {
	const message = String(error.message);
	if (message.startsWith("Timed out")) return "timeout";
	if (message.includes("[PAGE_BUSY]")) return "page_busy";
	if (/verification needs operator|captcha/i.test(message)) return "blocked";
	return "needs_attention";
}

export async function captureExisting(input, tabId, options = {}) {
	const config = validateInput(input);
	const browser = options.browser || createBrowser();
	const snapshot = await browser("snapshot", { tabId });
	if (!snapshot.includes(new URL(ENGINES[config.engine].url).hostname))
		throw new Error("Tab does not match the selected engine.");
	if (isBusy(snapshot)) throw new Error("Answer is still generating; capture again when it finishes.");
	const answer = await currentAnswer(browser, tabId, config.engine);
	if (!answer) throw new Error("No completed answer found. Nothing was scored.");
	const anchors = await queryRows(
		browser,
		tabId,
		ENGINES[config.engine].answer
			.split(", ")
			.map((selector) => `${selector} a[href]`)
			.join(", "),
		{ url: ".@href", title: ".@text" },
	);
	return {
		id: randomUUID(),
		...config,
		tabId,
		status: "completed",
		startedAt: new Date().toISOString(),
		finishedAt: new Date().toISOString(),
		surface: "consumer-web-ui",
		collector: "beat-browser-existing-tab",
		collectorVersion: "beatgeo-browser-v0.2",
		promptVerification: "operator-supplied; existing-tab prompt not independently matched",
		accountContext: "operator-supplied-existing-tab",
		region: null,
		modelVersion: null,
		answer,
		brandMentioned: detectMention(answer, config.brand, config.aliases),
		citations: cleanCitations(anchors, config.engine),
		citationCoverage: "visible-answer-links-only; collapsed-source-panels-not-expanded",
	};
}
