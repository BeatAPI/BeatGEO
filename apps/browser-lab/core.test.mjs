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
		{ browser, delay: async () => {} },
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
	const run = await collect({ engine: "chatgpt", prompt: "best providers" }, { browser, delay: async () => {} });
	assert.equal(run.status, "needs_attention");
	assert.equal(run.brandMentioned, null);
	assert.equal(submissions, 1);
});

test("run evidence round-trips through private local storage", async () => {
	const directory = await mkdtemp(path.join(os.tmpdir(), "open-profound-test-"));
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
	const result = await collect({ engine: "chatgpt", prompt: "best providers" }, { browser, delay: async () => {} });
	assert.equal(result.status, "needs_attention");
	assert.equal(submissions, 0);
	assert.equal(result.brandMentioned, null);
});
