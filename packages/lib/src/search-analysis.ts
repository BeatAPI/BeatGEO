import {
	legacySearchMessages,
	type SearchMessage,
	type SearchMessageCode,
	searchMessageText,
} from "./search-analysis-display";

export {
	searchActionText,
	searchComparisonText,
	searchDiagnosisWarnings,
	searchFindingText,
	searchMessageText,
} from "./search-analysis-display";

import type { GaPerformance } from "./traffic/ga.mjs";
import type { GscRow, GscSummary } from "./traffic/gsc.mjs";

export type PageEvidence = { url: string; title: string; description: string; text: string; fetchedAt: string };
export type SearchFinding = {
	id: string;
	kind: "low_ctr" | "near_page_one" | "click_decline" | "query_overlap" | "page_content";
	page: string;
	query: string | null;
	title: string;
	evidenceIds: string[];
	metrics: Record<string, number | null>;
	note: string;
	messages?: SearchMessage[];
};
export type SearchDiagnosis = {
	schema: "beat-geo/search-diagnosis@1";
	evidenceIds: string[];
	findings: SearchFinding[];
	warnings: string[];
	warningMessages?: SearchMessage[];
};
export type SeoBaseline = {
	evidenceIds: string[];
	page: string;
	query: string | null;
	findingId: string;
	finding?: Pick<SearchFinding, "kind" | "title" | "note" | "messages">;
};
export type AnalysisPayload =
	| { kind: "gsc"; data: GscSummary }
	| { kind: "ga"; data: GaPerformance }
	| { kind: "page"; data: PageEvidence }
	| { kind: "seo"; data: { runId: string; snapshot: Record<string, unknown> } }
	| { kind: "diagnosis"; data: SearchDiagnosis };
export type Evidence = { id: string; capturedAt: string; payload: AnalysisPayload };

export function samePage(a: string, b: string) {
	try {
		const left = new URL(a),
			right = new URL(b);
		left.hash = "";
		right.hash = "";
		return left.href === right.href;
	} catch {
		return false;
	}
}

export function diagnoseSearch(evidence: Evidence[]): SearchDiagnosis {
	const gsc = evidence.find((e) => e.payload.kind === "gsc");
	const report: SearchDiagnosis = {
		schema: "beat-geo/search-diagnosis@1",
		evidenceIds: evidence.map((e) => e.id),
		findings: [],
		warnings: [],
		warningMessages: [],
	};
	appendWarning(report, "descriptive_only");
	appendWarning(report, "distinct_metrics");
	if (!gsc || gsc.payload.kind !== "gsc" || !gsc.payload.data.analysis) {
		appendWarning(report, "refresh_gsc");
		return report;
	}
	const { current, previous } = gsc.payload.data.analysis;
	if (current.queryPages.limitReached || previous.queryPages.limitReached) appendWarning(report, "row_limit");
	appendWarning(report, "google_coverage");
	const prior = new Map(previous.queryPages.rows.map((row) => [JSON.stringify(row.keys), row]));
	const queries = new Map<string, Set<string>>();
	for (const row of current.queryPages.rows)
		appendRowFindings(report, row, prior.get(JSON.stringify(row.keys)), gsc.id, queries);
	appendOverlapFindings(report, queries, gsc.id);
	report.findings.sort((a, b) => (b.metrics.impressions ?? 0) - (a.metrics.impressions ?? 0));
	report.findings = report.findings.slice(0, 50);
	for (const finding of report.findings) enrichFinding(finding, evidence);
	return report;
}

function enrichFinding(finding: SearchFinding, evidence: Evidence[]) {
	for (const item of evidence) {
		supportingAcquisition(finding, item);
		supportingKeywords(finding, item);
		if (item.payload.kind !== "page" || !samePage(item.payload.data.url, finding.page)) continue;
		finding.evidenceIds.push(item.id);
		const page = item.payload.data;
		appendMessage(finding, { code: !page.title || !page.description ? "page_missing_metadata" : "page_available" });
	}
}

export function compareSearchBaseline(base: GscSummary, head: GscSummary, target: SeoBaseline, appliedAt: string) {
	if (!base.analysis || !head.analysis || base.siteUrl !== head.siteUrl)
		return {
			status: "incompatible",
			reasonCode: "incompatible" as const,
			reason: "Matching Search Console properties and analysis windows are required.",
		};
	const a = base.analysis.current,
		b = head.analysis.current;
	const windows = {
		baseline: { startDate: a.startDate, endDate: a.endDate },
		current: { startDate: b.startDate, endDate: b.endDate },
	};
	const duration = (p: { startDate: string; endDate: string }) => Date.parse(p.endDate) - Date.parse(p.startDate);
	const implementedDate = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Los_Angeles",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(appliedAt));
	if (duration(a) !== duration(b) || b.startDate <= a.endDate || b.startDate <= implementedDate)
		return {
			status: "waiting",
			windows,
			reasonCode: "waiting_period" as const,
			reason: "Wait for an equally long, non-overlapping full period after implementation (Search Console timezone).",
		};
	const lookup = (p: typeof a) =>
		p.queryPages.rows.find((r) => r.keys?.[0] === target.query && samePage(r.keys?.[1] ?? "", target.page));
	const first = lookup(a),
		last = lookup(b);
	if (!first || !last)
		return {
			status: "insufficient_data",
			windows,
			reasonCode: "missing_query_page" as const,
			reason: "The exact query × page row is missing in a comparison window; it is not zero.",
		};
	return {
		status: "comparable",
		windows,
		noteCode: "comparison_observed" as const,
		baseline: first,
		current: last,
		clicksDelta: last.clicks - first.clicks,
		note: "Observed movement only; no causal attribution. Provider-limited rows and anonymized queries remain excluded.",
	};
}

function appendRowFindings(
	report: SearchDiagnosis,
	row: GscRow,
	old: GscRow | undefined,
	gscId: string,
	queries: Map<string, Set<string>>,
) {
	const [query, page] = row.keys ?? [];
	if (!query || !page) return;
	if (row.impressions >= 50) queries.set(query, new Set([...(queries.get(query) ?? []), page]));

	const metrics = {
		clicks: row.clicks,
		impressions: row.impressions,
		ctr: row.ctr,
		position: row.position,
		previousClicks: old?.clicks ?? null,
	};
	const add = (kind: SearchFinding["kind"], title: string, code: SearchMessageCode) =>
		report.findings.push({
			id: `${kind}:${report.findings.length}`,
			kind,
			page,
			query,
			title,
			metrics,
			evidenceIds: [gscId],
			note: searchMessageText({ code }, "en"),
			messages: [{ code }],
		});
	if (row.impressions >= 100 && row.position <= 10 && row.ctr < 0.02)
		add("low_ctr", "Review search snippet and intent", "low_ctr_v1");
	if (row.impressions >= 100 && row.position > 10 && row.position <= 20)
		add("near_page_one", "Review a query near page one", "near_page_one_v1");
	if (old && old.clicks >= 20 && row.clicks < old.clicks * 0.7)
		add("click_decline", "Investigate declining clicks", "click_decline_v1");
}

function appendOverlapFindings(report: SearchDiagnosis, queries: Map<string, Set<string>>, gscId: string) {
	for (const [query, pages] of queries) {
		if (pages.size < 2) continue;
		for (const page of pages)
			report.findings.push({
				id: `query_overlap:${report.findings.length}`,
				kind: "query_overlap",
				page,
				query,
				title: "Check multiple pages appearing for one query",
				metrics: { pages: pages.size },
				evidenceIds: [gscId],
				messages: [{ code: "query_overlap_v1" }],
				note: searchMessageText({ code: "query_overlap_v1" }, "en"),
			});
	}
}

function supportingAcquisition(finding: SearchFinding, evidence: Evidence) {
	if (evidence.payload.kind !== "ga") return;
	const data = evidence.payload.data;
	let url: URL;
	try {
		url = new URL(finding.page);
	} catch {
		return;
	}
	// GA landingPage omits query parameters. Do not attribute path totals to one parameterized URL.
	if (url.hostname !== data.site || url.search) return;
	const report = data.current.googleOrganicPages;
	if (report.metadata.some((m) => m.restricted || m.emptyReason)) return;
	const row = report.rows.find((r) => r.dimensions.landingPage === url.pathname);
	if (!row) return;
	finding.evidenceIds.push(evidence.id);
	finding.metrics.gaPageSessions = row.metrics.sessions;
	finding.metrics.gaPageKeyEvents = row.metrics.keyEvents;
	finding.metrics.gaPageSessionKeyEventRate = row.metrics.sessionKeyEventRate;
	appendMessage(finding, {
		code: "ga_page_context",
		params: { startDate: data.current.startDate, endDate: data.current.endDate, timeZone: data.timeZone },
	});
}
function recordObject(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function supportingKeywords(finding: SearchFinding, evidence: Evidence) {
	if (evidence.payload.kind !== "seo") return;
	const records = evidence.payload.data.snapshot.records;
	if (!Array.isArray(records)) return;
	const matched = records.filter((raw) => {
		const record = recordObject(raw),
			response = recordObject(record.response);
		if (record.status !== "ok" || !Array.isArray(response.results)) return false;
		return response.results.some((raw) => recordObject(raw).keyword === finding.query);
	});
	if (!matched.length) return;
	finding.evidenceIds.push(evidence.id);
	appendMessage(finding, { code: "keyword_context" });
}

function appendMessage(finding: SearchFinding, message: SearchMessage) {
	finding.messages ??= legacySearchMessages(finding.note) ?? [];
	finding.messages.push(message);
	finding.note += ` ${searchMessageText(message, "en")}`;
}

function appendWarning(report: SearchDiagnosis, code: SearchMessageCode) {
	report.warningMessages ??= [];
	report.warningMessages.push({ code });
	report.warnings.push(searchMessageText({ code }, "en"));
}
