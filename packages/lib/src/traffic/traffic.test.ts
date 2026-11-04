import { describe, expect, it, vi } from "vitest";
import logs from "./__fixtures__/crawls.json";
import ga from "./__fixtures__/ga.json";
import { analyzeCrawls, logTime } from "./crawls.mjs";
import { analyzeGa, classifyGaSource, fetchGa, gaDates, resolveGaDates } from "./ga.mjs";

describe("GA acquisition evidence", () => {
	it("groups native and legacy referrals without adding the landing view to totals", () => {
		const g = analyzeGa(ga);
		expect(g.totals).toEqual({ sessions: 22, engagedSessions: 13, keyEvents: 3 });
		expect(g.platforms).toHaveLength(3);
		expect(g.synthetic).toBe(true);
	});
	it("excludes lookalike brands and custom AI Traffic labels alone", () => {
		for (const s of [
			"deepseekv4.dev",
			"gemini3api.com",
			"chatgpt.com.evil.test",
			"fakechatgpt.com",
			"perplexity",
			"foo.ai",
		])
			expect(classifyGaSource(s, "AI Traffic")).toBeNull();
		expect(classifyGaSource("doubao.com", "Referral")?.platform).toContain("Doubao");
		expect(classifyGaSource("new.example", "AI Assistant")?.basis).toBe("ga-channel");
	});
	it("preserves data limits and refuses truncated or duplicated exports", () => {
		const data = structuredClone(ga);
		data.sources.metadata = Object.assign(data.sources.metadata, { subjectToThresholding: true });
		expect(analyzeGa(data).warnings).toContain("sources:thresholded");
		data.sources.rowCount++;
		expect(() => analyzeGa(data)).toThrow("Incomplete");
		data.sources.rows.push(data.sources.rows[0]);
		expect(() => analyzeGa(data)).toThrow("Duplicate");
	});
	it("resolves a fixed window in the property timezone", () => {
		expect(resolveGaDates(gaDates(), "Asia/Shanghai", Date.parse("2026-10-25T17:00:00Z"))).toEqual({
			startDate: "2026-09-28",
			endDate: "2026-10-25",
		});
		expect(() => gaDates({ start: "2026-02-29" })).toThrow();
	});
	it("reads every report page and retains the exact hostname filter", async () => {
		const requests: Record<string, unknown>[] = [];
		const api = vi.fn<typeof fetch>(async (url, init) => {
			if (String(url).includes("analyticsadmin")) return Response.json({ timeZone: "Asia/Shanghai" });
			const body = JSON.parse(String(init?.body));
			requests.push(body);
			const r = body.dimensions.length === 3 ? ga.sources : ga.landing;
			const offset = Number(body.offset);
			expect(JSON.stringify(body.dimensionFilter)).toContain('"value":"example.com"');
			return Response.json({ ...r, rows: r.rows.slice(offset, offset + 1) });
		});
		const result = await fetchGa({
			token: "private-test-token",
			property: ga.property,
			site: "example.com",
			fetchImpl: api,
		});
		expect(requests).toHaveLength(7);
		expect(result.summary.totals.sessions).toBe(22);
		expect(JSON.stringify(result)).not.toContain("private-test-token");
	});
	it("redacts provider failures rather than returning an apparently successful zero", async () => {
		await expect(
			fetchGa({
				token: "private-test-token",
				property: ga.property,
				site: "example.com",
				fetchImpl: vi.fn(async () => new Response("private-test-token", { status: 403 })),
			}),
		).rejects.toThrow("HTTP 403");
	});
});
describe("crawl observations", () => {
	it("counts UA declarations, response categories and paths independently from human visits", () => {
		const c = analyzeCrawls(JSON.stringify(logs), { site: "example.com" });
		expect(c.totals.requests).toBe(5);
		expect(c.totals.identities).toBe(4);
		expect(c.totals.verifiedRequests).toBeNull();
		expect(c.observation.coverage).toBe("unknown");
	});
	it("removes IPs, query strings, full UAs and referrers before persistence", () => {
		const c = analyzeCrawls(
			'192.0.2.123 - private-log-user [25/Oct/2026:16:00:00 +0800] "GET /docs?private=token HTTP/1.1" 403 42 "https://private.example/" "OAI-SearchBot/1.0 private-ua"',
			{ site: "example.com" },
		);
		const saved = JSON.stringify(c);
		for (const v of ["192.0.2.123", "private-log-user", "private=token", "private.example", "private-ua"])
			expect(saved).not.toContain(v);
		expect(c.pages[0].path).toBe("/docs");
		expect(c.totals.denied).toBe(1);
	});
	it("separates invalid, wrong-host and human-only logs and handles strict timestamps", () => {
		expect(() => logTime("2026-02-29T00:00:00Z")).toThrow();
		const data = {
			time: "2026-10-25T08:00:00Z",
			method: "GET",
			path: "/",
			status: 200,
			userAgent: "Mozilla/5.0",
			host: "other.example",
		};
		expect(analyzeCrawls(JSON.stringify([data]), { site: "example.com" }).observation.state).toBe("empty");
		expect(analyzeCrawls("broken", { site: "example.com" }).observation.state).toBe("invalid");
		data.host = "example.com";
		expect(analyzeCrawls(JSON.stringify([data]), { site: "example.com" }).input.unrecognized).toBe(1);
	});
	it("caps input size and retains rejected-row counts without raw contents", () => {
		expect(() => analyzeCrawls("x".repeat(10 * 1024 * 1024 + 1), { site: "example.com" })).toThrow("10 MiB");
		const c = analyzeCrawls("private-bad-record", { site: "example.com" });
		expect(c.input.rejected).toBe(1);
		expect(JSON.stringify(c)).not.toContain("private-bad-record");
	});
});
