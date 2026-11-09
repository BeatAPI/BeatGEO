import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type AiReport,
	type AiReportDimension,
	type AiReportInput,
	type AiReportSource,
	compareAiReports,
	parseAiReport,
} from "@workspace/lib/ai-reports";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useMemo, useState } from "react";
import { useBrandId } from "@/hooks/use-brand-id";
import { useT } from "@/lib/i18n";
import { deleteAiReportFn, importAiReportFn, listAiReportsFn } from "@/server/ai-reports";

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
	const [input, setInput] = useState<AiReportInput>({
		source: "bing",
		dimension: "page",
		site: "",
		startDate: "",
		endDate: "",
		scope: "",
		content: "",
	});
	const [confirmed, setConfirmed] = useState(false),
		[busy, setBusy] = useState(false),
		[message, setMessage] = useState("");
	const [selected, setSelected] = useState(""),
		[previous, setPrevious] = useState(""),
		[filter, setFilter] = useState(""),
		[offset, setOffset] = useState(0);
	const reports = query.data ?? [];
	const { report, comparison, rows } = reportView(reports, selected, previous, filter);
	const preview = useMemo(() => {
		if (!input.content) return { data: null, error: "" };
		try {
			return { data: parseAiReport(input), error: "" };
		} catch (error) {
			return { data: null, error: error instanceof Error ? error.message : "Invalid report." };
		}
	}, [input]);
	function update(patch: Partial<AiReportInput>) {
		setInput((v) => ({ ...v, ...patch }));
		setConfirmed(false);
		setMessage("");
	}
	async function save() {
		if (!preview.data || !confirmed || busy) return;
		setBusy(true);
		setMessage("");
		try {
			const result = await importAiReportFn({ data: { ...input, brandId } });
			await client.invalidateQueries({ queryKey });
			setSelected(result.id);
			setPrevious("");
			setOffset(0);
			setMessage(result.duplicate ? "This report is already saved; no counts were added." : "AI report saved.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Could not save AI report.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="space-y-6 p-4 md:p-6 min-w-0">
			<div>
				<h2 className="text-xl font-semibold">{t("AI platform reports")}</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					{t(
						"Import platform observations separately from your monitored questions. Imports do not enable automatic synchronization.",
					)}
				</p>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				{(["bing", "google"] as const).map((source) => {
					const latest = reports.find((r) => r.source === source);
					return (
						<section key={source} className="rounded-xl border p-4 space-y-2">
							<h3 className="font-medium">
								{source === "bing" ? "Bing AI Performance" : "Google Search Console · AI"}
							</h3>
							<p className="text-sm text-muted-foreground">
								{t(
									source === "bing"
										? "Citations · Microsoft and supported partners"
										: "Impressions · Google AI Overviews and AI Mode",
								)}
							</p>
							<p className="text-sm">
								{query.isPending
									? t("Loading…")
									: query.isError
										? t("Could not load AI reports.")
										: latest
											? `${latest.startDate} – ${latest.endDate} · ${latest.site}`
											: t("No AI report imported")}
							</p>
							<a
								className="text-sm underline"
								href={
									source === "bing" ? "https://www.bing.com/webmasters/" : "https://search.google.com/search-console"
								}
								target="_blank"
								rel="noreferrer"
							>
								{t("Open official dashboard")}
							</a>
						</section>
					);
				})}
			</div>
			{query.isError && (
				<p role="alert">
					{t("Could not load AI reports.")}{" "}
					<Button variant="outline" onClick={() => void query.refetch()}>
						{t("Retry")}
					</Button>
				</p>
			)}
			<details className="rounded-xl border p-4" open={!reports.length}>
				<summary className="cursor-pointer font-medium">{t("Import AI report CSV")}</summary>
				<p className="my-3 text-sm text-muted-foreground">
					{t(
						"Export one table from the AI report, then provide its website, dates and filters. Supported: page, daily history, and Bing grounding queries. Use exact counts, not Topic Portfolio opportunity ranges. CSV only; extract ZIP exports first. Maximum 2 MB / 2,000 rows.",
					)}
				</p>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<label className="space-y-1 text-sm">
						{t("Report source")}
						<select
							className={fieldClass}
							value={input.source}
							onChange={(e) => update({ source: e.target.value as AiReportSource, dimension: "page" })}
						>
							<option value="bing">Bing AI Performance</option>
							<option value="google">Google Search Console · AI</option>
						</select>
					</label>
					<label className="space-y-1 text-sm">
						{t("Report dimension")}
						<select
							className={fieldClass}
							value={input.dimension}
							onChange={(e) => update({ dimension: e.target.value as AiReportDimension })}
						>
							<option value="page">{t("Pages")}</option>
							<option value="date">{t("Daily history")}</option>
							{input.source === "bing" && <option value="query">{t("Grounding queries")}</option>}
						</select>
					</label>
					<label htmlFor="ai-report-site" className="space-y-1 text-sm">
						{t("Report website")}
						<Input
							id="ai-report-site"
							value={input.site}
							placeholder="example.com"
							onChange={(e) => update({ site: e.target.value })}
						/>
					</label>
					<label htmlFor="ai-report-startDate" className="space-y-1 text-sm">
						{t("Report start date")}
						<Input
							id="ai-report-startDate"
							type="date"
							value={input.startDate}
							onChange={(e) => update({ startDate: e.target.value })}
						/>
					</label>
					<label htmlFor="ai-report-endDate" className="space-y-1 text-sm">
						{t("Report end date")}
						<Input
							id="ai-report-endDate"
							type="date"
							value={input.endDate}
							onChange={(e) => update({ endDate: e.target.value })}
						/>
					</label>
					<label htmlFor="ai-report-scope" className="space-y-1 text-sm">
						{t("Filters and coverage")}
						<Input
							id="ai-report-scope"
							maxLength={500}
							value={input.scope}
							placeholder={t("For example: all countries, text search, no page filter")}
							onChange={(e) => update({ scope: e.target.value })}
						/>
					</label>
					<label htmlFor="ai-report-file" className="space-y-1 text-sm sm:col-span-2">
						{t("AI report CSV")}
						<Input
							id="ai-report-file"
							type="file"
							accept=".csv,text/csv"
							disabled={busy}
							onChange={async (e) => {
								const file = e.target.files?.[0];
								update({ content: "" });
								if (!file) return;
								if (file.size > 2_000_000) {
									setMessage("CSV is too large (maximum 2 MB).");
									return;
								}
								try {
									update({ content: await file.text() });
								} catch {
									setMessage("Could not read CSV.");
								}
							}}
						/>
					</label>
				</div>
				{preview.error && (
					<p role="alert" className="mt-3 text-sm text-destructive">
						{t(preview.error)}
					</p>
				)}
				{preview.data && (
					<div className="mt-4 space-y-3">
						<p className="text-sm">
							{t("Import preview")} · {preview.data.rows.length} {t("rows")} ·{" "}
							{t(input.source === "bing" ? "Citations" : "Impressions")}
						</p>
						<div className="overflow-x-auto">
							<table className="w-full text-sm text-left">
								<tbody>
									{preview.data.rows.slice(0, 5).map((r) => (
										<tr key={r.key}>
											<td className="p-2 break-all">{r.key}</td>
											<td className="p-2">{r.value ?? "—"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<label className="flex gap-2 items-start text-sm">
							<input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
							{t(
								"I confirm this file comes from the selected AI report, and the website, dates and filters match the export. Ordinary search impressions are not AI impressions.",
							)}
						</label>
					</div>
				)}
				<Button className="mt-4" disabled={!preview.data || !confirmed || busy} onClick={() => void save()}>
					{t(busy ? "Saving…" : "Save AI report")}
				</Button>
			</details>
			{message && (
				<p role="status" className="text-sm">
					{t(message)}
				</p>
			)}
			{report && (
				<section className="rounded-xl border p-4 space-y-4">
					<h3 className="font-medium">{t("Saved AI observations")}</h3>
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
										{r.source} · {t(r.dimension)} · {r.startDate} – {r.endDate} · {r.scope}
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
											{r.startDate} – {r.endDate} · {r.scope}
										</option>
									))}
							</select>
						</label>
					</div>
					<p className="text-sm text-muted-foreground">
						{report.site} · {report.startDate} – {report.endDate} · {report.scope}
						<br />
						{t("Imported at")}: {new Date(report.importedAt).toLocaleString()}
					</p>
					<p className="text-sm text-muted-foreground">
						{t(
							"Compare only equal-length, non-overlapping periods from the same source, dimension, website and filters. Missing rows are unknown, not zero. Daily reports remain separate observations. Row sums are not site totals; different platforms are never added together.",
						)}
					</p>
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
								if (!window.confirm(t("Remove this imported report? The original file is unchanged."))) return;
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
							{t("Remove import")}
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
