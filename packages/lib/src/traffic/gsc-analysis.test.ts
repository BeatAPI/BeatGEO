import { describe, expect, it, vi } from "vitest";
import { fetchGscAnalysis } from "./gsc.mjs";

describe("Search Console page/query evidence", () => {
	it("fetches actual joint rows and equal preceding periods, retaining truncation and missing days", async () => {
		const requests: Record<string, unknown>[] = [];
		const api = vi.fn<typeof fetch>(async (_url, init) => {
			if (!init?.body)
				return Response.json({ siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }] });
			const input = JSON.parse(String(init.body));
			requests.push(input);
			const dimensions: string[] = input.dimensions ?? [];
			return Response.json({
				rows:
					dimensions.join() === "query,page"
						? [{ keys: ["query", "https://example.com/a"], clicks: 4, impressions: 200, ctr: 0.02, position: 8 }]
						: [],
			});
		});
		const result = await fetchGscAnalysis({
			token: "secret",
			siteUrl: "https://example.com/",
			startDate: "2026-10-01",
			endDate: "2026-10-28",
			maxRows: 1,
			fetchImpl: api,
		});
		expect(result.analysis.previous.startDate).toBe("2026-09-03");
		expect(result.analysis.previous.endDate).toBe("2026-09-30");
		expect(result.analysis.current.queryPages.rows[0].keys).toEqual(["query", "https://example.com/a"]);
		expect(result.analysis.current.queryPages.limitReached).toBe(true);
		expect(result.analysis.current.daily.rows).toEqual([]);
		expect(requests.some((r) => JSON.stringify(r.dimensions) === '["date","page"]')).toBe(true);
		expect(JSON.stringify(result)).not.toContain("secret");
	});
	it("rejects invalid budgets before network access", async () => {
		const api = vi.fn<typeof fetch>();
		await expect(
			fetchGscAnalysis({
				token: "x",
				siteUrl: "x",
				startDate: "2026-10-01",
				endDate: "2026-10-28",
				maxRows: 0,
				fetchImpl: api,
			}),
		).rejects.toThrow("budget");
		expect(api).not.toHaveBeenCalled();
	});
});

it("rejects corrupt metrics and strips unrequested provider fields", async () => {
	const make =
		(invalid: boolean): typeof fetch =>
		async (_url, init) => {
			if (!init?.body)
				return Response.json({ siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }] });
			const body = JSON.parse(String(init.body));
			if (body.dimensions?.join() !== "query,page") return Response.json({ rows: [] });
			return Response.json({
				rows: [
					{
						keys: ["api", "https://example.com/a"],
						clicks: invalid ? "bad" : 1,
						impressions: 100,
						ctr: 0.01,
						position: 3,
						unrequested: "private",
					},
				],
			});
		};
	const args = {
		token: "x",
		siteUrl: "https://example.com/",
		startDate: "2026-10-01",
		endDate: "2026-10-28",
		maxRows: 1,
	};
	await expect(fetchGscAnalysis({ ...args, fetchImpl: make(true) })).rejects.toThrow("metrics");
	expect(JSON.stringify(await fetchGscAnalysis({ ...args, fetchImpl: make(false) }))).not.toContain("private");
});
