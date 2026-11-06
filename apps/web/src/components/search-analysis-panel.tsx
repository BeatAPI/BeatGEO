import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { searchDiagnosisWarnings, searchFindingText } from "@workspace/lib/search-analysis";
import { Button } from "@workspace/ui/components/button";
import { Spinner } from "@workspace/ui/components/spinner";
import { useState } from "react";
import { v4 as uuid } from "uuid";
import { FormSelect } from "@/components/form-select";
import { SearchEvidenceView } from "@/components/search-evidence-view";
import { useBrandParams } from "@/hooks/use-route-params";
import { useLocale, useT } from "@/lib/i18n";
import {
	analysisCommandFn,
	getAnalysisFn,
	getAnalysisHistoryFn,
	getAnalysisReadinessFn,
	readAnalysisRowsFn,
	refreshAnalysisFn,
} from "@/server/analysis-fn";

const SOURCE_NAMES: Record<string, string> = {
	gsc: "Google Search Console",
	ga: "Google Analytics",
	seo: "SEO workbench",
	saved_seo: "SEO workbench",
	page: "Page content",
	diagnosis: "Search diagnosis",
};
const STATE_LABELS: Record<string, string> = {
	disconnected: "Connect this source in Brand settings.",
	select_property: "Select a property in Brand settings.",
	first_refresh: "Connected. Refresh to collect the first analysis evidence.",
	legacy_snapshot: "Existing summary available. Refresh once to add detailed analysis evidence.",
	stale: "Saved analysis is more than seven days old. Refresh when you need current evidence.",
	ready: "Ready to use.",
	no_saved_result: "No completed SEO research is saved. Open the workbench to run research or view its history.",
	unavailable: "The saved SEO result could not be read. Check the workbench history.",
	wrong_site: "The saved SEO result belongs to a different website. Run research for this brand.",
};
export function SearchAnalysisPanel({
	brandId,
	onActionCreated,
}: {
	brandId: string;
	onActionCreated?: (id: string) => void;
}) {
	const t = useT(),
		{ locale } = useLocale(),
		params = useBrandParams(),
		client = useQueryClient();
	const [busy, setBusy] = useState<string | null>(null),
		[message, setMessage] = useState<{ key: string; error?: boolean } | null>(null),
		[createdAction, setCreatedAction] = useState<string | null>(null);
	const query = useQuery({
		queryKey: ["search-analysis", brandId],
		queryFn: () => getAnalysisFn({ data: { brandId } }),
	});
	const readiness = useQuery({
		queryKey: ["analysis-readiness", brandId],
		queryFn: () => getAnalysisReadinessFn({ data: { brandId } }),
	});
	async function act(label: string, work: () => Promise<string | undefined>) {
		setBusy(label);
		setMessage(null);
		try {
			const key = await work();
			setMessage({ key: key ?? "Saved. Review the updated evidence or action." });
		} catch {
			setMessage({
				key: "Could not complete this operation. Review source status and saved evidence before retrying.",
				error: true,
			});
		} finally {
			await Promise.all(
				["search-analysis", "analysis-history", "analysis-readiness", "monitoring", "traffic"].map((key) =>
					client.invalidateQueries({ queryKey: [key, brandId] }),
				),
			);
			setBusy(null);
		}
	}
	const sourceName = (kind: string) => t(SOURCE_NAMES[kind] ?? kind);
	const formatDate = (date: string | Date) => new Date(date).toLocaleString(locale);
	const data = query.data;
	const warnings = data ? searchDiagnosisWarnings(data.diagnosis, locale) : [];
	return (
		<section className="space-y-5 min-w-0" aria-busy={Boolean(busy)}>
			<div>
				<h2 className="text-lg font-semibold">{t("Search diagnosis")}</h2>
				<p className="text-sm text-muted-foreground">
					{t(
						"Review observed search opportunities, capture page content, then create an evidence-backed action. No paid model call is made here.",
					)}
				</p>
			</div>
			<div className="space-y-3">
				<h3 className="font-medium">{t("Data sources")}</h3>
				{readiness.isPending && <p role="status">{t("Checking source connections…")}</p>}
				{readiness.isError && (
					<div role="alert">
						<p>{t("Could not check source connections.")}</p>
						<Button variant="outline" onClick={() => void readiness.refetch()}>
							{t("Retry")}
						</Button>
					</div>
				)}
				{readiness.data && (
					<div className="grid gap-3 lg:grid-cols-3">
						{(["gsc", "ga", "saved_seo"] as const).map((source) => {
							const status =
								source === "saved_seo"
									? readiness.data.seo
									: readiness.data.sources.find((item) => item.kind === source);
							const label =
								source === "gsc"
									? "Refresh search data"
									: source === "ga"
										? "Refresh acquisition data"
										: "Use latest SEO workbench result";
							return (
								<div className="space-y-3 rounded-lg border p-3 min-w-0" key={source}>
									<h4 className="text-sm font-medium">{sourceName(source)}</h4>
									<p className="text-sm text-muted-foreground">{t(STATE_LABELS[status?.status ?? "unavailable"])}</p>
									<Button
										className="whitespace-normal h-auto min-h-9 max-w-full"
										variant="outline"
										disabled={Boolean(busy) || !status?.canRefresh}
										onClick={() =>
											void act(label, async () => {
												await refreshAnalysisFn({
													data: { brandId, plan: { source, pages: [] }, idempotencyKey: uuid() },
												});
											})
										}
									>
										{t(label)}
									</Button>
									{source === "saved_seo" ? (
										<Link
											to="/app/org/$org/brand/$brand/seo"
											params={params}
											className="block text-sm underline underline-offset-4"
										>
											{t("Open SEO workbench")}
										</Link>
									) : (
										<Link
											to="/app/org/$org/brand/$brand/settings/brand"
											params={params}
											className="block text-sm underline underline-offset-4"
										>
											{t("Manage Google connection")}
										</Link>
									)}
								</div>
							);
						})}
					</div>
				)}
				{readiness.data?.lastRefresh?.status === "failed" && (
					<p className="text-sm text-muted-foreground">
						{t("The last analysis refresh failed. Existing evidence is retained; check sources before retrying.")}
					</p>
				)}
				{readiness.data?.lastRefresh?.status === "running" && (
					<p className="text-sm text-muted-foreground">
						{t(
							"An analysis refresh is running or was interrupted. Check the latest evidence before starting another refresh.",
						)}
					</p>
				)}
			</div>
			{busy && (
				<p role="status" className="flex items-center gap-2">
					<Spinner />
					{t("Working…")} {t(busy)}
				</p>
			)}
			{message && (
				<div role={message.error ? "alert" : "status"} className="space-y-2">
					<p>{t(message.key)}</p>
					{createdAction && onActionCreated && (
						<Button onClick={() => onActionCreated(createdAction)}>{t("View saved SEO action")}</Button>
					)}
				</div>
			)}
			{query.isPending && <p>{t("Loading...")}</p>}
			{query.isError && (
				<div role="alert">
					<p>{t("Could not load analysis evidence.")}</p>
					<Button variant="outline" onClick={() => void query.refetch()}>
						{t("Retry")}
					</Button>
				</div>
			)}
			{data && (
				<>
					<p className="text-sm">
						{t("Sources without analysis evidence")}: {data.missing.map(sourceName).join(", ") || t("None")}
					</p>
					<details className="text-sm text-muted-foreground">
						<summary className="cursor-pointer">{t("How to interpret these candidates")}</summary>
						<ul className="list-disc pl-5 space-y-1 mt-2">
							{warnings.map((warning) => (
								<li key={warning}>{warning}</li>
							))}
						</ul>
					</details>
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
										{t("Observed at")}: {source.observedAt ? formatDate(source.observedAt) : t("Unknown")}
									</p>
									{source.ageDays !== null && <p>{t("Observed {days} days ago", { days: source.ageDays })}</p>}
								</div>
							))}
					</div>
					{data.diagnosis.findings.length === 0 && (
						<p>{t("No candidates in the available evidence. Refresh sources to improve coverage.")}</p>
					)}
					{data.diagnosis.findings.slice(0, 20).map((finding) => {
						const copy = searchFindingText(finding, locale);
						const searchMetrics = Object.entries(finding.metrics).filter(([key]) => !key.startsWith("gaPage")),
							pageMetrics = Object.entries(finding.metrics).filter(([key]) => key.startsWith("gaPage"));
						return (
							<article key={finding.id} className="space-y-3 rounded-lg border p-4 min-w-0">
								<h3 className="font-medium">{copy.title}</h3>
								<p className="break-all text-sm">{finding.page}</p>
								<p className="text-sm break-words">{finding.query}</p>
								<p className="text-sm text-muted-foreground whitespace-pre-line">{copy.note}</p>
								<MetricList entries={searchMetrics} />
								{pageMetrics.length > 0 && (
									<div className="space-y-2 rounded-md bg-muted/40 p-3">
										<h4 className="text-sm font-medium">{t("Google organic landing page context")}</h4>
										<p className="text-xs text-muted-foreground">
											{t(
												"These GA metrics describe the whole landing page, not conversions from this search query. Periods may differ.",
											)}
										</p>
										<MetricList entries={pageMetrics} />
									</div>
								)}
								<details className="text-xs text-muted-foreground">
									<summary className="cursor-pointer">{t("Technical details")}</summary>
									<p className="break-all mt-2">
										{t("Evidence IDs")}: {finding.evidenceIds.join(", ")}
									</p>
								</details>
								<div className="flex flex-wrap gap-2">
									<Button
										variant="outline"
										className="max-w-full whitespace-normal h-auto min-h-9"
										disabled={Boolean(busy)}
										onClick={() =>
											void act("Read candidate page", async () => {
												const result = await refreshAnalysisFn({
													data: { brandId, plan: { source: "pages", pages: [finding.page] }, idempotencyKey: uuid() },
												});
												const pages = JSON.parse(result.dataJson) as { status: string }[];
												if (pages.some((page) => page.status !== "completed"))
													throw new Error("Page capture unavailable");
											})
										}
									>
										{t("Read candidate page")}
									</Button>
									<Button
										className="max-w-full whitespace-normal h-auto min-h-9"
										disabled={Boolean(busy)}
										onClick={() =>
											void act("Create SEO action", async () => {
												const saved = await analysisCommandFn({
													data: {
														brandId,
														idempotencyKey: uuid(),
														command: { type: "save_diagnosis", evidenceIds: data.diagnosis.evidenceIds },
													},
												});
												const diagnosis = JSON.parse(saved.dataJson) as { id: string };
												const created = await analysisCommandFn({
													data: {
														brandId,
														idempotencyKey: uuid(),
														command: { type: "create_seo_action", diagnosisId: diagnosis.id, findingId: finding.id },
													},
												});
												setCreatedAction((JSON.parse(created.dataJson) as { id: string }).id);
												return "SEO action saved. Open it to review the draft and record your changes.";
											})
										}
									>
										{t("Create SEO action")}
									</Button>
								</div>
							</article>
						);
					})}
				</>
			)}
			<AnalysisHistory brandId={brandId} />
		</section>
	);
}
const METRIC_LABELS: Record<string, string> = {
	clicks: "Clicks",
	impressions: "Impressions",
	ctr: "CTR",
	position: "Average position",
	previousClicks: "Previous clicks",
	pages: "Observed pages",
	gaPageSessions: "Page sessions",
	gaPageKeyEvents: "Page key events",
	gaPageSessionKeyEventRate: "Page session key event rate",
};
function MetricList({ entries }: { entries: [string, number | null][] }) {
	const t = useT(),
		{ locale } = useLocale();
	return (
		<dl className="flex flex-wrap gap-4 text-sm">
			{entries.map(([key, value]) => (
				<div key={key}>
					<dt className="text-muted-foreground">{t(METRIC_LABELS[key] ?? key)}</dt>
					<dd>
						{value === null
							? t("Unknown")
							: key === "ctr" || key === "gaPageSessionKeyEventRate"
								? value.toLocaleString(locale, { style: "percent", maximumFractionDigits: 2, minimumFractionDigits: 2 })
								: value.toLocaleString(locale, { maximumFractionDigits: 2 })}
					</dd>
				</div>
			))}
		</dl>
	);
}

function AnalysisHistory({ brandId }: { brandId: string }) {
	const t = useT(),
		{ locale } = useLocale();
	const sourceName = (kind: string) => t(SOURCE_NAMES[kind] ?? kind);
	const formatDate = (date: string | Date) => new Date(date).toLocaleString(locale);
	const [historyOffset, setHistoryOffset] = useState(0),
		[rowOffset, setRowOffset] = useState(0);
	const [selected, setSelected] = useState<{ id: string; kind: string; dataset: string } | null>(null);
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

	return (
		<div className="space-y-3 min-w-0">
			{" "}
			<h3 className="font-medium">{t("Evidence history")}</h3>
			{history.isPending && <p role="status">{t("Loading...")}</p>}
			{history.isError && (
				<div role="alert">
					<p>{t("Could not load evidence history. This does not mean no evidence exists.")}</p>
					<Button variant="outline" onClick={() => void history.refetch()}>
						{t("Retry")}
					</Button>
				</div>
			)}
			{history.data?.items.length === 0 && (
				<p className="text-sm text-muted-foreground">
					{t("No analysis evidence has been saved yet. Refresh a connected source to begin.")}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				{history.data?.items.map((item) => (
					<Button
						key={item.id}
						variant="outline"
						className="max-w-full h-auto min-h-9 whitespace-normal text-left"
						onClick={() => {
							setSelected({
								id: item.id,
								kind: item.kind,
								dataset:
									item.kind === "gsc" ? "current.queryPages" : item.kind === "ga" ? "current.channels" : "records",
							});
							setRowOffset(0);
						}}
					>
						{sourceName(item.kind)} · {formatDate(item.capturedAt)}
					</Button>
				))}
			</div>
			{history.data && history.data.items.length > 0 && (
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						disabled={!historyOffset}
						onClick={() => setHistoryOffset(Math.max(0, historyOffset - 20))}
					>
						{t("Previous page")}
					</Button>
					<Button
						variant="outline"
						disabled={history.data.nextOffset == null}
						onClick={() => setHistoryOffset(history.data.nextOffset ?? 0)}
					>
						{t("Next page")}
					</Button>
				</div>
			)}
			{selected && (
				<div className="space-y-3 rounded-lg border p-4 min-w-0">
					<h4 className="font-medium">{sourceName(selected.kind)}</h4>
					{["gsc", "ga"].includes(selected.kind) && (
						<FormSelect
							aria-label={t("Evidence view")}
							value={selected.dataset}
							onValueChange={(dataset) => {
								setSelected({ ...selected, dataset });
								setRowOffset(0);
							}}
							options={(["current", "previous"] as const).flatMap((period) =>
								(selected.kind === "gsc"
									? [
											["queryPages", "Query × page"],
											["daily", "Daily totals"],
											["dailyPages", "Date × page"],
										]
									: [
											["channels", "All channels"],
											["organicPages", "Organic search landing pages"],
											["googleOrganicPages", "Google organic landing pages"],
										]
								).map(([name, label]) => ({
									value: `${period}.${name}`,
									label: `${t(period === "current" ? "Current period" : "Previous period")} · ${t(label)}`,
								})),
							)}
						/>
					)}{" "}
					{detail.isPending && <p>{t("Loading...")}</p>}
					{detail.isError && (
						<div role="alert">
							<p>{t("Could not load analysis evidence.")}</p>
							<Button variant="outline" onClick={() => void detail.refetch()}>
								{t("Retry")}
							</Button>
						</div>
					)}
					{detail.data && (
						<>
							<SearchEvidenceView data={detail.data} />
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									disabled={!rowOffset}
									onClick={() => setRowOffset(Math.max(0, rowOffset - 50))}
								>
									{t("Previous page")}
								</Button>
								<Button
									variant="outline"
									disabled={detail.data.nextOffset == null}
									onClick={() => setRowOffset(detail.data.nextOffset ?? 0)}
								>
									{t("Next page")}
								</Button>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}
