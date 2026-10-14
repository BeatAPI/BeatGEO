import assert from "node:assert/strict";
import test from "node:test";
import { citationRows, filterRuns, promptRows } from "./public/evidence.js";

test("citations count completed answers once per URL and reject unsafe links", () => {
	const source = { url: "https://example.com/", title: "Example" };
	const rows = citationRows([
		{ status: "completed", engine: "chatgpt", citations: [source, source, { url: "javascript:alert(1)" }] },
		{ status: "completed", engine: "gemini", citations: [source] },
		{ status: "timeout", engine: "chatgpt", citations: [source] },
	]);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].count, 2);
	assert.deepEqual(rows[0].engines, ["chatgpt", "gemini"]);
});

test("question rates exclude incomplete and unscored answers and separate brands", () => {
	const base = { prompt: "best tools?", engine: "chatgpt", brand: "Example" };
	const rows = promptRows([
		{ ...base, status: "completed", brandMentioned: true },
		{ ...base, status: "timeout", brandMentioned: null },
		{ ...base, status: "completed", brandMentioned: null },
		{ ...base, brand: "Other", status: "completed", brandMentioned: false },
	]);
	assert.equal(rows.length, 2);
	assert.equal(rows[0].mentionRate, 1);
	assert.equal(rows[0].completed, 2);
	assert.equal(rows[0].total, 3);
	assert.equal(rows[1].mentionRate, 0);
});

test("engine and completion filters apply to all evidence views", () => {
	const rows = [
		{ engine: "chatgpt", status: "completed" },
		{ engine: "gemini", status: "completed" },
		{ engine: "chatgpt", status: "timeout" },
	];
	assert.deepEqual(filterRuns(rows, "chatgpt", "attention"), [rows[2]]);
	assert.deepEqual(filterRuns(rows, "all", "completed"), rows.slice(0, 2));
});
