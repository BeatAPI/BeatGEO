import { type SearchFinding, searchFindingText } from "@workspace/lib/search-analysis";
import { useLocale, useT } from "@/lib/i18n";
import type { readAnalysisRowsFn } from "@/server/analysis-fn";

type Detail = Awaited<ReturnType<typeof readAnalysisRowsFn>>;
function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function display(value: unknown, locale: string): string {
	if (value == null) return "—";
	if (typeof value === "number") return value.toLocaleString(locale);
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}
export function SearchEvidenceView({ data }: { data: Detail }) {
	const t = useT(),
		{ locale } = useLocale();
	const rows: unknown[] = JSON.parse(data.rows),
		coverage = record(JSON.parse(data.coverage));
	const dimensions: Record<string, string[]> = {
		queryPages: ["query", "page"],
		dailyPages: ["date", "page"],
		daily: ["date"],
		pages: ["page"],
		queries: ["query"],
	};
	const dims = dimensions[data.dataset.split(".").pop() ?? ""] ?? [];
	const flatRows = rows.map((raw) => {
		if (data.kind === "diagnosis") {
			const finding = raw as SearchFinding;
			const copy = searchFindingText(finding, locale);
			return { page: finding.page, query: finding.query, title: copy.title, note: copy.note, ...finding.metrics };
		}
		return flattenRow(raw, dims);
	});
	const columns = [...new Set(flatRows.flatMap((row) => Object.keys(row)))].filter(
		(key) => !["id", "evidenceIds", "messages", "response", "text"].includes(key),
	);
	const labels: Record<string, string> = {
		title: "Title",
		fetchedAt: "Captured at",
		tool: "Research type",
		input: "Query parameters",
		clicks: "Clicks",
		impressions: "Impressions",
		ctr: "CTR",
		position: "Average position",
		previousClicks: "Previous clicks",
		pages: "Observed pages",
		gaPageSessions: "Page sessions",
		gaPageKeyEvents: "Page key events",
		gaPageSessionKeyEventRate: "Page session key event rate",
		description: "Description",
		url: "Page",
		note: "Notes",
		status: "Status",
		kind: "Source",
		sessions: "Sessions",
		engagedSessions: "Engaged sessions",
		keyEvents: "Key events",
		sessionKeyEventRate: "Session key event rate",
	};
	return (
		<div className="space-y-3 min-w-0">
			<p className="text-sm">
				{t("Stored rows")}: {data.totalStoredRows.toLocaleString(locale)}
			</p>
			{typeof coverage.startDate === "string" && typeof coverage.endDate === "string" && (
				<p className="text-sm text-muted-foreground">
					{coverage.startDate} – {coverage.endDate}
					{typeof coverage.timeZone === "string" ? ` · ${coverage.timeZone}` : ""}
				</p>
			)}
			{coverage.limitReached === true && <p role="status">{t("Row limit reached. This view is incomplete.")}</p>}
			{coverage.providerLimited === true && (
				<p className="text-sm text-muted-foreground">
					{t("Google may omit some rows. Stored evidence is not a complete list.")}
				</p>
			)}
			{rows.length === 0 ? (
				<p>{t("No rows in this evidence view. Missing data is unknown, not zero.")}</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr>
								{columns.map((key) => (
									<th className="p-2" key={key}>
										{t(labels[key] ?? key)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{flatRows.map((row) => (
								<tr className="border-t" key={JSON.stringify(row)}>
									{columns.map((key) => (
										<td key={key} className="p-2 align-top max-w-sm break-words">
											{typeof row[key] === "number" &&
											["ctr", "sessionKeyEventRate", "gaPageSessionKeyEventRate"].includes(key)
												? (row[key] as number).toLocaleString(locale, {
														style: "percent",
														minimumFractionDigits: 2,
														maximumFractionDigits: 2,
													})
												: display(row[key], locale)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<details className="text-xs text-muted-foreground">
				<summary className="cursor-pointer">{t("Technical details")}</summary>
				<pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">
					{JSON.stringify({ ...data, rows, coverage }, null, 2)}
				</pre>
			</details>
		</div>
	);
}

function flattenRow(raw: unknown, dims: string[]) {
	const row = record(raw);
	if (Array.isArray(row.keys))
		return {
			...Object.fromEntries(row.keys.map((value, i) => [dims[i] ?? String(i), value])),
			...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "keys")),
		};
	if (row.dimensions) return { ...record(row.dimensions), ...record(row.metrics) };
	return row;
}
