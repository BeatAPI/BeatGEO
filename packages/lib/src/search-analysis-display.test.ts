import { describe, expect, it } from "vitest";
import type { SearchFinding } from "./search-analysis";
import { searchActionText, searchComparisonText, searchDiagnosisWarnings, searchFindingText } from "./search-analysis";
import { type SearchMessage, searchMessageText } from "./search-analysis-display";

const messages: SearchMessage[] = [
	{ code: "low_ctr_v1" },
	{
		code: "ga_page_context",
		params: { startDate: "2026-10-01", endDate: "2026-10-28", timeZone: "America/Los_Angeles" },
	},
	{ code: "page_missing_metadata" },
	{ code: "keyword_context" },
];
const finding: SearchFinding = {
	id: "low_ctr:0",
	kind: "low_ctr",
	title: "Review search snippet and intent",
	page: "https://example.com/pricing",
	query: "image API 原文",
	evidenceIds: ["gsc"],
	metrics: {},
	messages,
	note: messages.map((m) => searchMessageText(m, "en")).join(" "),
};
const action = {
	kind: "seo",
	title: finding.title,
	description: `${finding.page}\n${finding.query}\n${finding.note}`,
	seoBaseline: { evidenceIds: ["gsc"], page: finding.page, query: finding.query, findingId: finding.id, finding },
};

describe("localized search evidence", () => {
	it("explains findings with their periods in Chinese while leaving evidence values intact", () => {
		const text = searchFindingText(finding, "zh");
		expect(text.title).toBe("核查搜索摘要与意图");
		expect(text.note).toContain("展示至少 100 次");
		expect(text.note).toContain("2026-10-01–2026-10-28（America/Los_Angeles）");
		expect(text.note).toContain("已保存的 HTML 缺少标题");
		expect(text.note).toContain("国家、语言");
		expect(text.note).not.toContain("Rule:");
		expect(searchFindingText(finding, "en").note).toBe(finding.note);
	});
	it("localizes new and existing SEO actions without changing user queries or URLs", () => {
		for (const seoBaseline of [action.seoBaseline, { ...action.seoBaseline, finding: undefined }]) {
			const text = searchActionText({ ...action, seoBaseline }, "zh");
			expect(text.title).toBe("核查搜索摘要与意图");
			expect(text.description).toContain(`${finding.page}\nimage API 原文\n筛选规则`);
			expect(text.description).not.toContain("Rule:");
		}
		expect(searchFindingText({ ...finding, messages: undefined }, "zh")).toEqual(searchFindingText(finding, "zh"));
	});
	it("preserves user-authored and unknown content instead of translating matching substrings", () => {
		for (const edited of [
			{ ...action, kind: "geo" },
			{ ...action, title: "My own title" },
			{ ...action, description: `${action.description}\nMy note` },
			{ ...action, description: "Review search snippet and intent" },
		])
			expect(searchActionText(edited, "zh")).toEqual({ title: edited.title, description: edited.description });
		expect(
			searchFindingText({ ...finding, messages: undefined, note: "Rule: user-authored explanation" }, "zh").note,
		).toBe("Rule: user-authored explanation");
	});
	it("explains legacy and structured missing-data warnings and comparison reasons", () => {
		const warning = searchMessageText({ code: "row_limit" }, "en");
		expect(searchDiagnosisWarnings({ warnings: [warning] }, "zh")[0]).toContain("行数上限");
		expect(
			searchDiagnosisWarnings({ warnings: [warning], warningMessages: [{ code: "row_limit" }] }, "zh")[0],
		).toContain("行数上限");
		const reason = searchMessageText({ code: "waiting_period" }, "en");
		expect(searchComparisonText({ reason }, "zh")).toContain("完整等长周期");
		expect(searchComparisonText({ reasonCode: "missing_query_page" }, "zh")).toContain("缺失不等于零");
		expect(searchComparisonText({ reason: "Unknown reason from a newer version" }, "zh")).toBe(
			"Unknown reason from a newer version",
		);
	});
});
