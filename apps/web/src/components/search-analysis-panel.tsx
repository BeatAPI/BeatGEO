import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useT } from "@/lib/i18n";
import {
	analysisCommandFn,
	getAnalysisFn,
	getAnalysisHistoryFn,
	readAnalysisRowsFn,
	refreshAnalysisFn,
} from "@/server/analysis-fn";

export function SearchAnalysisPanel({ brandId }: { brandId: string }) {
	const t = useT(),
		client = useQueryClient();
	const [busy, setBusy] = useState(false),
		[message, setMessage] = useState("");
	const [historyOffset, setHistoryOffset] = useState(0);
	const [selected, setSelected] = useState<{ id: string; dataset: string } | null>(null);
	const [rowOffset, setRowOffset] = useState(0);
	const query = useQuery({
		queryKey: ["search-analysis", brandId],
		queryFn: () => getAnalysisFn({ data: { brandId } }),
	});
	const history = useQuery({
		queryKey: ["analysis-history", brandId, historyOffset],
		queryFn: () => getAnalysisHistoryFn({ data: { brandId, offset: historyOffset } }),
	});
	const detail = useQuery({
		queryKey: ["analysis-rows", brandId, selected, rowOffset],
		queryFn: () =>
			readAnalysisRowsFn({
				data: { brandId, evidenceId: selected?.id ?? "", dataset: selected?.dataset ?? "records", offset: rowOffset },
			}),
		enabled: Boolean(selected),
	});
	async function act(work: () => Promise<unknown>) {
		setBusy(true);
		setMessage("");
		try {
			await work();
			setMessage(t("Saved. Review the updated evidence or action."));
			await Promise.all([
				client.invalidateQueries({ queryKey: ["search-analysis", brandId] }),
				client.invalidateQueries({ queryKey: ["analysis-history", brandId] }),
				client.invalidateQueries({ queryKey: ["monitoring", brandId] }),
				client.invalidateQueries({ queryKey: ["traffic", brandId] }),
			]);
		} catch {
			setMessage(t("Could not complete analysis. Check source connections and try again."));
		} finally {
			setBusy(false);
		}
	}
	const data = query.data;
	return (
		<section className="space-y-5">
			<div>
				<h2 className="text-lg font-semibold">{t("Search diagnosis")}</h2>
				<p className="text-sm text-muted-foreground">
					{t(
						"Review observed search opportunities, capture page content, then create an evidence-backed action. No paid model call is made here.",
					)}
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{(["gsc", "ga", "saved_seo"] as const).map((source) => (
					<Button
						key={source}
						variant="outline"
						disabled={busy}
						onClick={() =>
							void act(() =>
								refreshAnalysisFn({
									data: { brandId, plan: { source, pages: [] }, idempotencyKey: uuid() },
								}),
							)
						}
					>
						{t(
							{
								gsc: "Refresh search data",
								ga: "Refresh acquisition data",
								saved_seo: "Use latest SEO workbench result",
							}[source],
						)}
					</Button>
				))}
			</div>
			{message && (
				<p role="status" className="text-sm">
					{message}
				</p>
			)}
			{query.isPending && <p>{t("Loading...")}</p>}
			{query.isError && <p role="alert">{t("Could not load analysis evidence.")}</p>}
			{data && (
				<>
					<p className="text-sm">
						{t("Missing sources")}: {data.missing.map((kind) => sourceName(kind)).join(", ") || t("None")}
					</p>
					<p className="text-xs text-muted-foreground">
						{t(
							"Candidates are heuristics, not confirmed problems. Missing rows are unknown; changes do not prove causation.",
						)}
					</p>
					<div className="grid gap-3 md:grid-cols-2">
						{data.sources
							.filter((source) => source.kind !== "page")
							.map((source) => (
								<div key={source.id} className="rounded-lg border p-3 text-xs text-muted-foreground">
									<strong className="text-foreground">{sourceName(source.kind)}</strong>
									{source.summary.site && <p className="break-all">{source.summary.site}</p>}
									{source.summary.current && (
										<p>
											{t("Current period")}: {source.summary.current.join(" – ")}
										</p>
									)}
									<p>
										{t("Observed at")}:{" "}
										{source.observedAt ? new Date(source.observedAt).toLocaleString() : t("Unknown")}
									</p>
									{source.ageDays !== null && <p>{t("Observed {days} days ago", { days: source.ageDays })}</p>}
								</div>
							))}
					</div>
					{data.diagnosis.findings.length === 0 && (
						<p>{t("No candidates in the available evidence. Refresh sources to improve coverage.")}</p>
					)}
					{data.diagnosis.findings.slice(0, 20).map((finding) => (
						<article key={finding.id} className="space-y-2 rounded-lg border p-4">
							<h3 className="font-medium">{t(finding.title)}</h3>
							<p className="break-all text-sm">{finding.page}</p>
							<p className="text-sm">{finding.query}</p>
							<dl className="flex flex-wrap gap-4 text-sm">
								{Object.entries(finding.metrics).map(([key, value]) => (
									<div key={key}>
										<dt className="text-muted-foreground">{t(key)}</dt>
										<dd>
											{value === null
												? t("Unknown")
												: key === "ctr" || key === "gaPageSessionKeyEventRate"
													? `${(value * 100).toFixed(2)}%`
													: value}
										</dd>
									</div>
								))}
							</dl>
							<p className="text-xs text-muted-foreground">
								{t("Evidence IDs")}: {finding.evidenceIds.join(", ")}
							</p>
							<div className="flex gap-2">
								<Button
									variant="outline"
									disabled={busy}
									onClick={() =>
										void act(() =>
											refreshAnalysisFn({
												data: {
													brandId,
													plan: { source: "pages", pages: [finding.page] },
													idempotencyKey: uuid(),
												},
											}),
										)
									}
								>
									{t("Read candidate page")}
								</Button>
								<Button
									disabled={busy}
									onClick={() =>
										void act(async () => {
											const saved = await analysisCommandFn({
												data: {
													brandId,
													idempotencyKey: uuid(),
													command: { type: "save_diagnosis", evidenceIds: data.diagnosis.evidenceIds },
												},
											});
											const result = JSON.parse(saved.dataJson) as { id: string };
											await analysisCommandFn({
												data: {
													brandId,
													idempotencyKey: uuid(),
													command: { type: "create_seo_action", diagnosisId: result.id, findingId: finding.id },
												},
											});
										})
									}
								>
									{t("Create SEO action")}
								</Button>
							</div>
						</article>
					))}
				</>
			)}
			<h3 className="font-medium">{t("Evidence history")}</h3>
			<div className="flex flex-wrap gap-2">
				{history.data?.items.map((item) => (
					<Button
						key={item.id}
						variant="outline"
						onClick={() => {
							setSelected({
								id: item.id,
								dataset:
									item.kind === "gsc" ? "current.queryPages" : item.kind === "ga" ? "current.channels" : "records",
							});
							setRowOffset(0);
						}}
					>
						{item.kind} · {new Date(item.capturedAt).toLocaleString()}
					</Button>
				))}
			</div>
			<div className="flex gap-2">
				<Button
					variant="outline"
					disabled={!historyOffset}
					onClick={() => setHistoryOffset(Math.max(0, historyOffset - 20))}
				>
					{t("Previous page")}
				</Button>
				<Button
					variant="outline"
					disabled={history.data?.nextOffset == null}
					onClick={() => setHistoryOffset(history.data?.nextOffset ?? 0)}
				>
					{t("Next page")}
				</Button>
			</div>
			{selected && (
				<div className="space-y-2 rounded-lg border p-4">
					<p className="text-xs break-all">
						{t("Evidence IDs")}: {selected.id}
					</p>
					{detail.isPending && <p>{t("Loading...")}</p>}
					{detail.isError && <p role="alert">{t("Could not load analysis evidence.")}</p>}
					<pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
						{detail.data
							? JSON.stringify(
									{ ...detail.data, rows: JSON.parse(detail.data.rows), coverage: JSON.parse(detail.data.coverage) },
									null,
									2,
								)
							: ""}
					</pre>
					<div className="flex gap-2">
						<Button variant="outline" disabled={!rowOffset} onClick={() => setRowOffset(Math.max(0, rowOffset - 50))}>
							{t("Previous page")}
						</Button>
						<Button
							variant="outline"
							disabled={detail.data?.nextOffset == null}
							onClick={() => setRowOffset(detail.data?.nextOffset ?? 0)}
						>
							{t("Next page")}
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}

function sourceName(kind: string) {
	return (
		({ gsc: "Google Search Console", ga: "Google Analytics", seo: "SEO workbench" } as Record<string, string>)[kind] ??
		kind
	);
}
