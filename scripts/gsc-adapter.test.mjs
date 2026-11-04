import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchGsc, listGscProperties } from "../packages/lib/src/traffic/gsc.mjs";

test("reads a selected property and keeps search totals separate from limited detail", async () => {
	const calls = [];
	const fetchImpl = async (url, options) => {
		calls.push({ url: String(url), options });
		if (options.method === "GET") return Response.json({ siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteFullUser" }] });
		const body = JSON.parse(options.body);
		return Response.json({ rows: [{ ...(body.dimensions ? { keys: ["example"] } : {}), clicks: 12, impressions: 100, ctr: 0.12, position: 4 }] });
	};
	const result = await fetchGsc({ token: "private", siteUrl: "sc-domain:example.com", startDate: "2026-10-01", endDate: "2026-10-28", fetchImpl });
	assert.equal(result.totals.clicks, 12);
	assert.equal(result.pages.length, 1);
	assert.equal(calls.length, 4);
	assert.ok(calls[1].url.includes("sc-domain%3Aexample.com"));
	assert.match(result.warning, /omit queries/);
});

test("rejects inaccessible properties and never treats API errors as empty data", async () => {
	const empty = async () => Response.json({ siteEntry: [] });
	await assert.rejects(fetchGsc({ token: "x", siteUrl: "sc-domain:other.com", startDate: "2026-10-01", endDate: "2026-10-02", fetchImpl: empty }), /cannot read/);
	await assert.rejects(listGscProperties("x", { fetchImpl: async () => new Response("secret", { status: 403 }) }), /HTTP 403/);
	await assert.rejects(fetchGsc({ token: "x", siteUrl: "x", startDate: "2026-02-30", endDate: "2026-10-02", fetchImpl: empty }), /valid/);
});

test("loads additional keyword pages and fails the entire read if a page fails", async () => {
	let fail = false;
	const starts = [];
	const fetchImpl = async (_url, options) => {
		if (options.method === "GET") return Response.json({ siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }] });
		const body = JSON.parse(options.body);
		if (body.dimensions?.[0] === "query") {
			starts.push(body.startRow);
			if (body.startRow === 1000 && fail) return new Response("private error", { status: 429 });
			return Response.json({ rows: Array.from({ length: body.startRow === 0 ? 1000 : 1 }, (_, i) => ({ keys: [`query ${body.startRow + i}`], clicks: 1, impressions: 2, ctr: 0.5, position: 2 })) });
		}
		return Response.json({ rows: [] });
	};
	const options = { token: "x", siteUrl: "https://example.com/", startDate: "2026-10-01", endDate: "2026-10-28", fetchImpl };
	const result = await fetchGsc(options);
	assert.deepEqual(starts, [0, 1000]);
	assert.equal(result.queries.length, 1001);
	fail = true;
	await assert.rejects(fetchGsc(options), /HTTP 429/);
});
