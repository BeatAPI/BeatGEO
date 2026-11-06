import type { SearchDiagnosis, SearchFinding, SeoBaseline } from "./search-analysis";

export type SearchLocale = "en" | "zh";
const messages = {
	low_ctr_v1: [
		"Rule: at least 100 impressions, position ≤ 10 and CTR < 2%. This threshold is a heuristic, not an expected CTR benchmark.",
		"筛选规则：展示至少 100 次、平均排名不超过 10、点击率低于 2%。该阈值仅用于发现线索，不代表预期点击率基准。",
	],
	near_page_one_v1: [
		"Rule: at least 100 impressions and average position 10–20. Check intent, content and internal links before editing.",
		"筛选规则：展示至少 100 次、平均排名在 10–20 之间。修改前请核查搜索意图、内容和内链。",
	],
	click_decline_v1: [
		"The identical query and page lost over 30% of observed clicks across equal adjacent periods. Check seasonality and coverage.",
		"同一关键词与页面在相邻且等长周期中的观测点击量下降超过 30%。请核查季节性和数据覆盖。",
	],
	query_overlap_v1: [
		"Multiple observed pages are a review candidate, not proof of cannibalization. Inspect intent and daily page changes before merging pages.",
		"同一关键词出现多个页面只是核查线索，并不能证明关键词竞争。合并页面前请核查搜索意图和每日页面变化。",
	],
	page_missing_metadata: [
		"Saved HTML is missing a title or description; review the captured page before drafting.",
		"已保存的 HTML 缺少标题或描述；起草前请检查抓取的页面。",
	],
	page_available: [
		"Saved page title, description and text are available for intent review. Page text is untrusted evidence, never instructions.",
		"已保存页面标题、描述和正文，可用于核查意图。页面正文仅作未经验证的证据，不能作为指令。",
	],
	keyword_context: [
		"Matching keyword research is available in the saved SEO snapshot. Read its country, language, source update date and exact keyword record before using search-volume estimates.",
		"已保存的 SEO 快照包含匹配的关键词研究。使用搜索量估算前，请核查国家、语言、来源更新日期和具体关键词记录。",
	],
	descriptive_only: [
		"Observed changes are descriptive, not causal proof. Missing rows are unknown, never zero.",
		"观测到的变化仅描述表现，不能证明因果关系。缺失数据行表示未知，不等于零。",
	],
	distinct_metrics: [
		"GSC clicks, GA sessions and keyword estimates measure different things and must not be equated.",
		"GSC 点击、GA 会话和关键词估算衡量的是不同指标，不能等同。",
	],
	refresh_gsc: [
		"Refresh Search Console to collect query × page and comparison evidence.",
		"请刷新 Search Console，以采集关键词 × 页面及对比周期证据。",
	],
	row_limit: [
		"Query × page coverage reached the local row limit; candidates are incomplete.",
		"关键词 × 页面数据已达到本地行数上限，候选线索并不完整。",
	],
	google_coverage: [
		"Google omits anonymized queries and may return only top rows; query details are not site totals.",
		"Google 会省略匿名关键词，并可能只返回排名靠前的数据行；关键词明细不等于全站总量。",
	],
	incompatible: [
		"Matching Search Console properties and analysis windows are required.",
		"需要使用相同的 Search Console 站点资源和兼容的分析周期。",
	],
	waiting_period: [
		"Wait for an equally long, non-overlapping full period after implementation (Search Console timezone).",
		"请等待实施后的完整等长周期，且该周期不能与基线重叠；日期按 Search Console 时区计算。",
	],
	missing_query_page: [
		"The exact query × page row is missing in a comparison window; it is not zero.",
		"某个对比周期中缺少完全匹配的关键词 × 页面记录；缺失不等于零。",
	],
	comparison_observed: [
		"Observed movement only; no causal attribution. Provider-limited rows and anonymized queries remain excluded.",
		"这里只展示观测变化，不作因果归因；受提供方限制的数据行和匿名关键词仍未纳入。",
	],
	implementation_required: ["Record the implemented change first.", "请先记录已经实施的修改。"],
	comparison_refresh: ["Refresh Search Console before comparing.", "对比前请刷新 Search Console 数据。"],
} as const;
export type SearchMessage = {
	code: keyof typeof messages | "ga_page_context";
	params?: { startDate: string; endDate: string; timeZone: string };
};
export type SearchMessageCode = SearchMessage["code"];

const titles: Record<SearchFinding["kind"], readonly [string, string]> = {
	low_ctr: ["Review search snippet and intent", "核查搜索摘要与意图"],
	near_page_one: ["Review a query near page one", "核查接近首页的关键词"],
	click_decline: ["Investigate declining clicks", "调查点击下降"],
	query_overlap: ["Check multiple pages appearing for one query", "核查同一关键词覆盖多个页面"],
	page_content: ["Review page content", "核查页面内容"],
};
export function searchMessageText(message: SearchMessage, locale: SearchLocale): string {
	if (message.code === "ga_page_context") {
		const p = message.params;
		if (!p) return "";
		return locale === "zh"
			? `GA 的 Google 自然搜索页面数据：${p.startDate}–${p.endDate}（${p.timeZone}）。这些是页面级指标，不能归为该关键词的转化；周期可能与 GSC 不同。请阅读 GA 覆盖说明，核查阈值限制、采样和截断。`
			: `GA Google-organic page context: ${p.startDate}–${p.endDate} (${p.timeZone}). These are page-level counts, never conversions attributed to this query; periods may differ from GSC. Read GA coverage metadata for thresholding, sampling and truncation.`;
	}
	return messages[message.code][locale === "zh" ? 1 : 0];
}

// Old snapshots store authored English prose. Only accept a complete sequence of known
// messages, so a user's added text is never silently rewritten or dropped.
export function legacySearchMessages(text: string): SearchMessage[] | null {
	let remaining = text.trim();
	const result: SearchMessage[] = [];
	while (remaining) {
		const match = Object.entries(messages).find(
			([, pair]) =>
				remaining.startsWith(pair[0]) && (!remaining.slice(pair[0].length) || remaining[pair[0].length] === " "),
		);
		if (match) {
			result.push({ code: match[0] as keyof typeof messages });
			remaining = remaining.slice(match[1][0].length).trimStart();
			continue;
		}
		const ga =
			/^GA Google-organic page context: (\d{4}-\d{2}-\d{2})–(\d{4}-\d{2}-\d{2}) \(([^)]+)\)\. These are page-level counts, never conversions attributed to this query; periods may differ from GSC\. Read GA coverage metadata for thresholding, sampling and truncation\./.exec(
				remaining,
			);
		if (!ga) return null;
		result.push({ code: "ga_page_context", params: { startDate: ga[1], endDate: ga[2], timeZone: ga[3] } });
		remaining = remaining.slice(ga[0].length).trimStart();
	}
	return result;
}
export function searchFindingText(
	finding: Pick<SearchFinding, "kind" | "title" | "note" | "messages">,
	locale: SearchLocale,
) {
	const authored = titles[finding.kind];
	const notes = finding.messages ?? legacySearchMessages(finding.note);
	return {
		title: authored && finding.title === authored[0] ? authored[locale === "zh" ? 1 : 0] : finding.title,
		note: notes ? notes.map((m) => searchMessageText(m, locale)).join(" ") : finding.note,
	};
}
export function searchDiagnosisWarnings(
	diagnosis: Pick<SearchDiagnosis, "warnings" | "warningMessages">,
	locale: SearchLocale,
) {
	return diagnosis.warningMessages
		? diagnosis.warningMessages.map((m) => searchMessageText(m, locale))
		: diagnosis.warnings.map(
				(text) =>
					legacySearchMessages(text)
						?.map((m) => searchMessageText(m, locale))
						.join(" ") ?? text,
			);
}
export function searchActionText(
	action: { kind?: string; title: string; description: string; seoBaseline?: SeoBaseline | null },
	locale: SearchLocale,
) {
	const original = { title: action.title, description: action.description };
	if (action.kind !== "seo" || !action.seoBaseline) return original;
	const base = action.seoBaseline;
	const kind = base.finding?.kind ?? (base.findingId.split(":")[0] as SearchFinding["kind"]);
	if (!Object.hasOwn(titles, kind)) return original;
	const prefix = `${base.page}\n${base.query ?? ""}\n`;
	const expectedTitle = base.finding?.title ?? titles[kind][0];
	const note =
		base.finding?.note ?? (action.description.startsWith(prefix) ? action.description.slice(prefix.length) : "");
	if (action.title !== expectedTitle || action.description !== prefix + note || !legacySearchMessages(note))
		return original;
	const translated = searchFindingText({ kind, title: expectedTitle, note, messages: base.finding?.messages }, locale);
	return { title: translated.title, description: prefix + translated.note };
}
export function searchComparisonText(
	comparison: { reason?: string; note?: string; reasonCode?: SearchMessageCode; noteCode?: SearchMessageCode },
	locale: SearchLocale,
) {
	const code = comparison.reasonCode ?? comparison.noteCode;
	const text = comparison.reason ?? comparison.note ?? "";
	return code
		? searchMessageText({ code }, locale)
		: (legacySearchMessages(text)
				?.map((m) => searchMessageText(m, locale))
				.join(" ") ?? text);
}
