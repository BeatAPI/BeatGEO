import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type AiReport, compareAiReports } from "@workspace/lib/ai-reports";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useState } from "react";
import { useBrandId } from "@/hooks/use-brand-id";
import { useT } from "@/lib/i18n";
import { deleteAiReportFn, listAiReportsFn } from "@/server/ai-reports";

import { AiReportConnections } from "./ai-report-connections";
import { TrendChart } from "./trend-chart";

const fieldClass = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
export function AiPlatformReports() {
	const brandId = useBrandId();
	return <ReportWorkspace key={brandId} brandId={brandId} />;
}
function ReportWorkspace({ brandId }: { brandId: string }) {
	const t = useT(),
		client = useQueryClient();
	const queryKey = ["ai-platform-reports", brandId];
	const query = useQuery({ queryKey, queryFn: () => listAiReportsFn({ data: { brandId } }) });
	const [busy, setBusy] = useState(false),
		[message, setMessage] = useState("");
	const [selected, setSelected] = useState(""),
		[previous, setPrevious] = useState(""),
		[filter, setFilter] = useState(""),
		[offset, setOffset] = useState(0);
	const reports = query.data ?? [];
	const { report, comparison, rows } = reportView(reports, selected, previous, filter);
	return (
		<div className="space-y-6 p-4 md:p-6 min-w-0">
			<div>
				<h2 className="text-xl font-semibold">{t("AI platform reports")}</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					{t("Connect your website accounts and sync AI visibility directly. No files to download or upload.")}
				</p>
			</div>
			<AiReportConnections brandId={brandId} onSynced={() => client.invalidateQueries({ queryKey })} />
			{query.isError && (
				<p role="alert">
					{t("Could not load AI reports.")}{" "}
					<Button variant="outline" onClick={() => void query.refetch()}>
						{t("Retry")}
					</Button>
				</p>
			)}
			{message && (
				<p role="status" className="text-sm">
					{t(message)}
				</p>
			)}
			{!query.isPending && !query.isError && !report && (
				<p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
					{t("No AI data synchronized yet. Connect an account above, then choose Sync now.")}
				</p>
			)}
			{report && (
				<section className="rounded-xl border p-4 space-y-4">
					<h3 className="font-medium">{t("Saved AI observations")}</h3>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="rounded-lg bg-muted/40 p-4">
							<p className="text-sm text-muted-foreground">
								{t("Official report total")} · {t(report.source === "bing" ? "Citations" : "Impressions")}
							</p>
							<p className="mt-1 text-2xl font-semibold">{report.total?.toLocaleString() ?? "—"}</p>
						</div>
						<div className="rounded-lg bg-muted/40 p-4">
							<p className="text-sm text-muted-foreground">{t("Returned observations")}</p>
							<p className="mt-1 text-2xl font-semibold">{report.rows.length.toLocaleString()}</p>
						</div>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<label className="text-sm space-y-1">
							{t("Saved report")}
							<select
								className={fieldClass}
								value={report.id}
								onChange={(e) => {
									setSelected(e.target.value);
									setPrevious("");
									setOffset(0);
									setFilter("");
								}}
							>
								{reports.map((r) => (
									<option key={r.id} value={r.id}>
										{r.source} · {t(r.dimension)} · {r.startDate} – {r.endDate}
									</option>
								))}
							</select>
						</label>
						<label className="text-sm space-y-1">
							{t("Compare with earlier report")}
							<select className={fieldClass} value={previous} onChange={(e) => setPrevious(e.target.value)}>
								<option value="">{t("No comparison")}</option>
								{reports
									.filter((r) => compareAiReports(report, r) !== null)
									.map((r) => (
										<option key={r.id} value={r.id}>
											{r.startDate} – {r.endDate} · {t(r.scope)}
										</option>
									))}
							</select>
						</label>
					</div>
					<p className="text-sm text-muted-foreground">
						{report.site} · {report.startDate} – {report.endDate} · {t(report.scope)}
						<br />
						{report.coverage && (
							<>
								{t(report.coverage)}
								<br />
							</>
						)}
						{t("Saved at")}: {new Date(report.importedAt).toLocaleString()}
					</p>
					<p className="text-sm text-muted-foreground">
						{t(
							"Compare only equal-length, non-overlapping periods from the same source, dimension, website and filters. Missing rows are unknown, not zero. Daily reports remain separate observations. Row sums are not site totals; different platforms are never added together.",
						)}
					</p>
					{report.dimension === "date" && report.rows.length > 0 && (
						<TrendChart
							data={report.rows.map((row) => ({ date: row.key, value: row.value }))}
							label={t(report.source === "bing" ? "Citations" : "Impressions")}
							color="var(--primary)"
							className="aspect-auto h-64 w-full"
							unit="count"
						/>
					)}
					<Input
						aria-label={t("Filter observations")}
						placeholder={t("Filter observations")}
						value={filter}
						onChange={(e) => {
							setFilter(e.target.value);
							setOffset(0);
						}}
					/>
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead>
								<tr>
									<th className="p-2">{t(report.dimension)}</th>
									<th className="p-2">{t(report.source === "bing" ? "Citations" : "Impressions")}</th>
									{comparison && (
										<>
											<th className="p-2">{t("Previous period")}</th>
											<th className="p-2">{t("Change")}</th>
										</>
									)}
								</tr>
							</thead>
							<tbody>
								{rows.slice(offset, offset + 50).map((row) => (
									<tr key={row.key} className="border-t">
										<td className="p-2 max-w-xl break-all">
											{report.dimension === "page" ? (
												<a className="underline" href={row.key} target="_blank" rel="noreferrer">
													{row.key}
												</a>
											) : (
												row.key
											)}
										</td>
										<td className="p-2">{row.value?.toLocaleString() ?? "—"}</td>
										{comparison && (
											<>
												<td className="p-2">{"previous" in row ? (row.previous?.toLocaleString() ?? "—") : "—"}</td>
												<td className="p-2">{"delta" in row ? (row.delta?.toLocaleString() ?? "—") : "—"}</td>
											</>
										)}
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{!rows.length && <p>{t("No matching observations.")}</p>}
					<div className="flex flex-wrap items-center gap-3">
						<Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
							{t("Previous page")}
						</Button>
						<span className="text-sm">
							{rows.length ? offset + 1 : 0}–{Math.min(offset + 50, rows.length)} / {rows.length}
						</span>
						<Button variant="outline" disabled={offset + 50 >= rows.length} onClick={() => setOffset(offset + 50)}>
							{t("Next page")}
						</Button>
						<Button
							variant="outline"
							disabled={busy}
							onClick={async () => {
								if (!window.confirm(t("Remove this saved snapshot? The official report is unchanged."))) return;
								setBusy(true);
								try {
									await deleteAiReportFn({ data: { brandId, id: report.id } });
									setSelected("");
									setPrevious("");
									setOffset(0);
									await client.invalidateQueries({ queryKey });
								} catch {
									setMessage("Could not remove AI report.");
								} finally {
									setBusy(false);
								}
							}}
						>
							{t("Remove snapshot")}
						</Button>
					</div>
				</section>
			)}
		</div>
	);
}

function reportView(reports: AiReport[], selected: string, previous: string, filter: string) {
	const report = reports.find((r) => r.id === selected) ?? reports[0];
	const baseline = reports.find((r) => r.id === previous);
	const comparison = report && baseline ? compareAiReports(report, baseline) : null;
	const rows = (comparison ?? report?.rows ?? []).filter((r) => r.key.toLowerCase().includes(filter.toLowerCase()));
	return { report, comparison, rows };
}
