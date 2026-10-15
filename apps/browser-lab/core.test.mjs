import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanCitations, collect, detectMention, listRuns, parseRows, saveRun, summarize } from "./core.mjs";

test("mention detection does not count substrings or the submitted prompt", () => {
	assert.equal(detectMention("BeatAPI.io is one option", "BeatAPI"), true);
	assert.equal(detectMention("The provider is NotBeatAPIClone", "BeatAPI"), false);
	assert.equal(detectMention("OpenRouter is an option", "BeatAPI"), false);
	assert.equal(detectMention("Try Beat API", "BeatAPI", ["Beat API"]), true);
});

test("failed and pending runs never become negative observations", () => {
	assert.equal(summarize([{ status: "timeout", brandMentioned: null }]).mentionRate, null);
	const result = summarize([
		{ status: "completed", brandMentioned: true },
		{ status: "timeout" },
		{ status: "waiting" },
	]);
	assert.equal(result.mentionRate, 1);
	assert.equal(result.completed, 1);
});

test("sources reject script links, internal navigation and duplicate URLs", () => {
	const sources = cleanCitations(
		[
			{ url: "javascript:alert(1)" },
			{ url: "https://chatgpt.com/c/123" },
			{ url: "https://example.com/" },
			{ url: "https://example.com/" },
		],
		"chatgpt",
	);
	assert.equal(sources.length, 1);
	assert.equal(sources[0].url, "https://example.com/");
});

test("structured query output tolerates a navigation notice without accepting prose", () => {
	assert.deepEqual(parseRows('Navigation [notice]\n[\n{"text":"hello"}\n]'), [{ text: "hello" }]);
	assert.throws(() => parseRows("login required"));
});

test("a fresh browser run waits for finished text and records the actual answer only", async () => {
	let submitted = false;
	let submissions = 0;
	const browser = async (tool, params) => {
		if (params.selector?.includes("aria-busy")) return "[]";
		if (tool === "tabs") return "Opened tab [42] in the background";
		if (tool === "type") {
			submitted = true;
			submissions++;
			return "Typed";
		}
		if (tool === "snapshot") return "# ChatGPT — https://chatgpt.com/c/test";
		if (params.selector.includes("contenteditable")) return '[{"label":"Ask"}]';
		if (params.selector.includes("a[href]")) return '[{"url":"https://example.com/","title":"Source"}]';
		return submitted ? '[{"text":"Consider OpenRouter and fal."}]' : "[]";
	};
	const run = await collect(
		{ engine: "chatgpt", prompt: "Compare BeatAPI", brand: "BeatAPI" },
		{ browser, spaces: false, delay: async () => {} },
	);
	assert.equal(run.status, "completed");
	assert.equal(run.brandMentioned, false);
	assert.equal(run.citations.length, 1);
	assert.equal(submissions, 1);
});

test("an uncertain submission is not replayed or counted as a missing mention", async () => {
	let submissions = 0;
	const browser = async (tool, params) => {
		if (params.selector?.includes("aria-busy")) return "[]";
		if (tool === "tabs") return "Opened tab [42]";
		if (tool === "type") {
			submissions++;
			throw new Error("Connection lost after keypress");
		}
		if (tool === "snapshot") return "# ChatGPT";
		return params.selector.includes("contenteditable") ? '[{"label":"Ask"}]' : "[]";
	};
	const run = await collect(
		{ engine: "chatgpt", prompt: "best providers" },
		{ browser, spaces: false, delay: async () => {} },
	);
	assert.equal(run.status, "needs_attention");
	assert.equal(run.brandMentioned, null);
	assert.equal(submissions, 1);
});

test("run evidence round-trips through private local storage", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "beat-geo-test-"));
	try {
		const run = { id: "abcdef-1234", startedAt: "2026-10-14T00:00:00Z", status: "completed", answer: "Raw answer" };
		await saveRun(directory, run);
		assert.deepEqual(await listRuns(directory), [run]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("a completed observation with no brand to score is not a negative mention", () => {
	assert.equal(summarize([{ status: "completed", brandMentioned: null }]).mentionRate, null);
});

test("verification stops collection before submitting a prompt", async () => {
	let submissions = 0;
	const browser = async (tool) => {
		if (tool === "tabs") return "Opened tab [42]";
		if (tool === "snapshot") return "Verify you are human";
		if (tool === "type") submissions++;
		return '[{"label":"Ask"}]';
	};
	const result = await collect(
		{ engine: "chatgpt", prompt: "best providers" },
		{ browser, spaces: false, delay: async () => {} },
	);
	assert.equal(result.status, "needs_attention");
	assert.equal(submissions, 0);
	assert.equal(result.brandMentioned, null);
});

test("TaskSpace collection pins every page command and releases after an uncertain submission", async () => {
	const calls = [];
	const browser = async (tool, params) => {
		calls.push({ tool, params });
		if (tool === "spaces") return JSON.stringify({ spaceId: "owned-space", tabId: 42, state: "running" });
		assert.equal(params.spaceId, "owned-space");
		assert.equal(params.tabId, 42);
		if (tool === "snapshot") return "# ChatGPT";
		if (tool === "type") throw new Error("Connection lost after keypress");
		return params.selector.includes("contenteditable") ? '[{"label":"Ask"}]' : "[]";
	};
	const run = await collect(
		{ engine: "chatgpt", prompt: "best providers" },
		{ browser, spaces: true, delay: async () => {} },
	);
	assert.equal(run.status, "needs_attention");
	assert.equal(run.executionMode, "beat-browser-taskspace");
	assert.equal(calls.filter((c) => c.tool === "type").length, 1);
	assert.equal(
		calls.some((c) => c.tool === "tabs"),
		false,
	);
	assert.deepEqual(calls.at(-1), { tool: "spaces", params: { action: "finish", spaceId: "owned-space", keep: "all" } });
});

test("an interrupted TaskSpace never falls back to an ordinary browser tab", async () => {
	const calls = [];
	const run = await collect(
		{ engine: "chatgpt", prompt: "best providers" },
		{
			browser: async (tool, params) => {
				calls.push({ tool, params });
				return JSON.stringify({ spaceId: "interrupted-space", tabId: 42, state: "interrupted" });
			},
		},
	);
	assert.equal(run.status, "needs_attention");
	assert.equal(run.submissionAttempted, false);
	assert.equal(calls.length, 2);
	assert(calls.every((call) => call.tool === "spaces"));
});

test("default collection uses the chosen profile and preserves evidence pages", async () => {
	const calls = [];
	let submitted = false;
	const run = await collect(
		{ engine: "chatgpt", prompt: "best providers", brand: "Example", profileId: "chosen-profile" },
		{
			delay: async () => {},
			browser: async (tool, params) => {
				calls.push({ tool, params });
				if (tool === "spaces") return JSON.stringify({ spaceId: "test-space", tabId: 9, state: "running" });
				assert.equal(params.spaceId, "test-space");
				if (tool === "snapshot") return "# ChatGPT";
				if (tool === "type") {
					submitted = true;
					return "Typed";
				}
				if (params.selector.includes("contenteditable")) return '[{"label":"Ask"}]';
				if (params.selector.includes("aria-busy") || params.selector.includes("a[href]")) return "[]";
				return submitted ? '[{"text":"Example is one option."}]' : "[]";
			},
		},
	);
	assert.equal(run.status, "completed");
	assert.equal(run.brandMentioned, true);
	assert.equal(calls[0].params.profileId, "chosen-profile");
	assert.equal(
		calls.some((call) => call.tool === "tabs"),
		false,
	);
	assert.equal(calls.at(-1).params.keep, "all");
});

test("duplicate observation IDs and failed attempts do not inflate a brand percentage", () => {
	const result = summarize([
		{ id: "a", status: "completed", brandMentioned: true },
		{ id: "a", status: "completed", brandMentioned: true },
		{ id: "b", status: "completed", brandMentioned: false },
		{ id: "c", status: "timeout", brandMentioned: null },
	]);
	assert.equal(result.mentionRate, 0.5);
	assert.equal(result.total, 3);
	assert.equal(result.timeout, 1);
	assert.equal(result.statusCounts.timeout, 1);
	assert.equal(result.metricVersion, "beatgeo-v1");
});

for (const readiness of ["transient", "persistent", "human-pause"]) {
	test(`composer readiness ${readiness} never refreshes, refocuses or replays a submission`, async () => {
		const calls = [];
		let reads = 0;
		let submitted = false;
		const composer = () => {
			reads++;
			if (readiness === "human-pause") throw new Error("[TASKSPACE_PAUSED] Human owns the page");
			if (readiness === "persistent" || reads < 3) throw new Error("[PAGE_BUSY] Loading");
			return '[{"label":"Ask"}]';
		};
		const run = await collect(
			{ engine: "chatgpt", prompt: "Which tools?", brand: "Example" },
			{
				delay: async () => {},
				browser: async (tool, params) => {
					calls.push({ tool, params });
					if (tool === "spaces") return JSON.stringify({ spaceId: "readiness-space", tabId: 9, state: "running" });
					if (tool === "snapshot") return "# ChatGPT";
					if (tool === "type") {
						submitted = true;
						return "Typed";
					}
					if (params.selector.includes("contenteditable")) return composer();
					if (params.selector.includes("aria-busy") || params.selector.includes("a[href]")) return "[]";
					return submitted ? '[{"text":"Example is an option."}]' : "[]";
				},
			},
		);
		assert.equal(run.status, readiness === "transient" ? "completed" : "needs_attention");
		assert.equal(reads, readiness === "transient" ? 3 : readiness === "persistent" ? 12 : 1);
		assert.equal(calls.filter((c) => c.tool === "type").length, readiness === "transient" ? 1 : 0);
		assert(calls.every((c) => ["spaces", "snapshot", "query", "type"].includes(c.tool)));
		assert.deepEqual(
			calls.filter((c) => c.tool === "spaces").map((c) => c.params.action),
			["open", "finish"],
		);
		if (readiness === "persistent") assert.equal(run.errorCode, "page_busy");
		if (readiness === "human-pause") assert.equal(run.errorCode, "needs_attention");
	});
}
