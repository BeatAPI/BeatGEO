import { describe, expect, it } from "vitest";
import {
	type AiReport,
	type AiReportInput,
	compareAiReports,
	parseAiReport,
	validateConnectedReport,
} from "./ai-reports";

const base: AiReportInput = {
	source: "bing",
	dimension: "page",
	site: "example.com",
	startDate: "2026-10-01",
	endDate: "2026-10-28",
	scope: "All countries",
	content: 'Page,Citations\nhttps://example.com/a,"1,200"\nhttps://example.com/b,-',
};
const saved = (input: AiReportInput): AiReport => ({
	...parseAiReport(input),
	id: "test",
	importedAt: "2026-11-01T00:00:00Z",
});
describe("AI platform report imports", () => {
	it("preserves exact counts and missing observations in a BOM CSV", () => {
		const result = parseAiReport({ ...base, content: `\uFEFF${base.content}` });
		expect(result.rows).toEqual([
			{ key: "https://example.com/a", value: 1200 },
			{ key: "https://example.com/b", value: null },
		]);
	});
	it("accepts localized Google page exports", () => {
		expect(
			parseAiReport({ ...base, source: "google", content: "排名靠前的网页,曝光次数\nhttps://example.com/a,12" }).rows[0]
				.value,
		).toBe(12);
	});
	it.each([
		"Page,Citations\nhttps://evil.test/a,12",
		"Page,Citations\nhttps://example.com/a,2.5K",
		"Page,Citations\nhttps://example.com/a,5K-10K",
		"Page,Citations\nhttps://example.com/a,-1",
		"Page,Citations\nhttps://example.com/a,1\nhttps://example.com/a,2",
		'Page,Citations\n"https://example.com/a,2',
	])("rejects ambiguous or invalid imports: %s", (content) => {
		expect(() => parseAiReport({ ...base, content })).toThrow();
	});
	it("rejects ordinary search exports and opportunity tables", () => {
		expect(() =>
			parseAiReport({ ...base, source: "google", content: "Page,Clicks,Impressions\nhttps://example.com/a,1,3" }),
		).toThrow();
		expect(() =>
			parseAiReport({ ...base, dimension: "query", content: "Opportunity Query,Citation Range\napi,5K-10K" }),
		).toThrow();
	});
	it("validates dates and preserves missing days without filling zeros", () => {
		expect(() => parseAiReport({ ...base, startDate: "2026-02-30" })).toThrow();
		const daily = { ...base, dimension: "date" as const, content: "Date,Citations\n2026-10-03,5" };
		expect(parseAiReport(daily).rows).toHaveLength(1);
		expect(() => parseAiReport({ ...daily, content: "Date,Citations\n2026-09-01,5" })).toThrow();
	});
	it("compares matching pages without converting absent rows to zero", () => {
		const previous = saved({
			...base,
			startDate: "2026-09-01",
			endDate: "2026-09-28",
			content: "Page,Citations\nhttps://example.com/a,1100",
		});
		const current = saved(base);
		expect(compareAiReports(current, previous)?.map((r) => r.delta)).toEqual([100, null]);
		expect(compareAiReports(current, { ...previous, source: "google" })).toBeNull();
		expect(compareAiReports(current, { ...previous, scope: "US" })).toBeNull();
		expect(compareAiReports(current, current)).toBeNull();
		expect(compareAiReports(current, { ...previous, endDate: "2026-09-29" })).toBeNull();
	});
	it("canonicalizes equivalent CSV files for duplicate identification", () => {
		expect(parseAiReport(base)).toEqual(
			parseAiReport({
				...base,
				content: "Page,Citations\r\nhttps://example.com/b,-\r\nhttps://example.com/a,1200\r\n",
			}),
		);
	});
});

describe("connected AI reports", () => {
	const report = {
		source: "google" as const,
		dimension: "page" as const,
		site: "example.com",
		property: "sc-domain:example.com",
		startDate: "2026-10-01",
		endDate: "2026-10-28",
		scope: "Official AI report",
		rows: [{ key: "https://docs.example.com/a", value: 5 }],
		total: 12,
	};
	it("keeps official totals separate from partial page rows and accepts domain subdomains", () => {
		expect(validateConnectedReport(report)).toMatchObject({ total: 12, rows: report.rows });
		expect(validateConnectedReport({ ...report, rows: [] }).rows).toEqual([]);
	});
	it.each(["https://example.com.evil.test/a", "https://other.test/a", "javascript:alert(1)"])(
		"rejects unrelated page %s",
		(key) => {
			expect(() => validateConnectedReport({ ...report, rows: [{ key, value: 2 }] })).toThrow();
		},
	);
	it("restricts URL prefix properties", () => {
		expect(() =>
			validateConnectedReport({
				...report,
				property: "https://example.com/docs/",
				rows: [{ key: "https://example.com/blog/a", value: 2 }],
			}),
		).toThrow();
	});
	it("rejects duplicate rows, invalid counts and dates outside the report", () => {
		expect(() => validateConnectedReport({ ...report, rows: [...report.rows, ...report.rows] })).toThrow();
		expect(() => validateConnectedReport({ ...report, total: -1 })).toThrow();
		expect(() =>
			validateConnectedReport({ ...report, dimension: "date", rows: [{ key: "2026-11-01", value: 2 }] }),
		).toThrow();
	});
});
