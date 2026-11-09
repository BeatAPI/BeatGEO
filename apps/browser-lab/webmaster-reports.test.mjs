import assert from "node:assert/strict";
import { test } from "node:test";
import {
	parseBingHistory,
	parseGoogleReport,
	readWebmasterReport,
	reportUrl,
	responseJson,
} from "./webmaster-reports.mjs";

function googleFixture({ property = "sc-domain:example.com", metric = "IMPRESSIONS", value = 7, feature = 4 } = {}) {
	const descriptor = (dimension) => [
		[dimension],
		null,
		[[null, null, null, 3]],
		[[6, ["WEB"]]],
		null,
		null,
		null,
		null,
		null,
		null,
		true,
		null,
		null,
		2,
		null,
		feature,
	];
	const history = [
		[property, 27, null, null, null, descriptor(1)],
		[
			[
				[Date.UTC(2026, 9, 1), [value]],
				[Date.UTC(2026, 9, 2), [3]],
			],
			[null, [10]],
		],
		1,
		[0],
		null,
		null,
		[null, null, [[metric]]],
	];
	const key = Array(41).fill(null);
	key[40] = "https://docs.example.com/a";
	const column = (name) => {
		const c = Array(10).fill(null);
		c[9] = name;
		return c;
	};
	const pages = [
		[property, 32, null, null, null, descriptor(3)],
		[[[[key, [null, 10, null, null, null, null, null, null, 6]]]], [column("PAGES"), column(metric)]],
	];
	return `200 report\n\n)]}'\n\n${JSON.stringify([
		["wrb.fr", "OLiH4d", JSON.stringify(history)],
		["wrb.fr", "nDAfwb", JSON.stringify(pages)],
	])}\n`;
}

test("reads exact AI impressions and dates from matching official report frames", () => {
	const result = parseGoogleReport(googleFixture(), "sc-domain:example.com");
	assert.deepEqual(result.daily, [
		{ key: "2026-10-01", value: 7 },
		{ key: "2026-10-02", value: 3 },
	]);
	assert.deepEqual(result.pages, [{ key: "https://docs.example.com/a", value: 10 }]);
	assert.equal(result.total, 10);
});
test("rejects other properties, ordinary search reports and changed metric contracts", () => {
	for (const options of [{ property: "sc-domain:other.test" }, { metric: "CLICKS" }, { feature: 1 }, { value: -1 }])
		assert.throws(() => parseGoogleReport(googleFixture(options), "sc-domain:example.com"));
});
test("Bing uses exact numeric counts and verifies the returned website", () => {
	const data = {
		SiteUrl: "https://example.com/",
		CitationStats: [{ Date: "2026-10-01T00:00:00", Citations: 1234 }],
		TotalCitations: 1234,
	};
	assert.equal(parseBingHistory(data, data.SiteUrl).rows[0].value, 1234);
	assert.throws(() => parseBingHistory(data, "https://other.test/"));
	assert.throws(() => parseBingHistory({ ...data, TotalCitations: "1.2K" }, data.SiteUrl));
	assert.deepEqual(responseJson(`200 /report\n\n${JSON.stringify(data)}\n`), data);
});
test("website selection cannot redirect the reader to an arbitrary host", () => {
	assert.equal(new URL(reportUrl("google", "sc-domain:example.com")).hostname, "search.google.com");
	assert.throws(() => reportUrl("bing", "https://user:password@example.com/"));
	assert.throws(() => reportUrl("other", "https://example.com/"));
});
test("Bing follows every report page before returning a snapshot", async () => {
	let page = 0,
		table = "Queries";
	const site = "https://example.com/";
	const handlers = {
		spaces: (args) => JSON.stringify(args.action === "open" ? { spaceId: "s", tabId: 1, state: "running" } : {}),
		snapshot: () => "AI Performance",
		query: () =>
			JSON.stringify([
				{ id: "q", text: "Grounding Queries" },
				{ id: "p", text: "Pages" },
			]),
		click: (args) => {
			if (args.selector.includes('id="p"')) {
				table = "Pages";
				page = 0;
			} else if (args.selector.includes("next Page")) page++;
			return "Clicked";
		},
		network: (args) => {
			if (args.body.includes("citationstats"))
				return `200\n\n${JSON.stringify({ SiteUrl: site, CitationStats: [{ Date: "2026-10-01", Citations: 9 }], TotalCitations: 9 })}`;
			const key = table === "Pages" ? "PageUrl" : "GroundingQuery";
			return `200\n\n${JSON.stringify({ SiteUrl: site, TotalNumOfRecords: 2, [table]: [{ [key]: table === "Pages" ? `${site}${page}` : `query ${page}`, Citations: 4 }] })}`;
		},
	};
	const browser = async (tool, args) => handlers[tool](args);
	const result = await readWebmasterReport(
		{ source: "bing", property: site, action: "sync" },
		{ browser, delay: async () => {} },
	);
	assert.equal(result.tables.find((t) => t.dimension === "page").rows.length, 2);
	assert.equal(result.tables.find((t) => t.dimension === "query").rows.length, 2);
});
test("a missing report never returns a successful empty snapshot", async () => {
	const browser = async (tool, args) =>
		tool === "spaces"
			? JSON.stringify(args.action === "open" ? { spaceId: "s", tabId: 1, state: "running" } : {})
			: "Sign in";
	await assert.rejects(
		() =>
			readWebmasterReport(
				{ source: "bing", property: "https://example.com/", action: "sync" },
				{ browser, delay: async () => {} },
			),
		/could not be read/,
	);
});
