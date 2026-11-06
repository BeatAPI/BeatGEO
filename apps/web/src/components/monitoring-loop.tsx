import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { searchActionText, searchComparisonText } from "@workspace/lib/search-analysis";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { useEffect, useState } from "react";
import { CollectionCheck } from "@/components/collection-check";
import { ContentDraft } from "@/components/content-draft";
import { WorkspaceControl } from "@/components/workspace-control";
import { useLocale, useT } from "@/lib/i18n";
import { applyOptimizationActionFn, getMonitoringFn, retestOptimizationActionFn } from "@/server/monitoring-fn";

export const COLLECTION_STATUS: Record<string, string> = {
	completed: "Completed",
	running: "Collecting",
	timeout: "Timed out",
	needs_login: "Sign-in required",
	blocked: "Blocked",
	runner_busy: "Browser busy",
	runner_offline: "Browser offline",
	empty_answer: "Empty answer",
	failed: "Failed",
	needs_attention: "Review browser",
	page_busy: "Page not ready",
	interrupted: "Interrupted — inspect collector",
};
const formatRate = (rate: number | null) => rate?.toFixed(1) ?? "—";
const button = "rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50";

type Attempt = Awaited<ReturnType<typeof getMonitoringFn>>["attempts"][number];

/** Agent-written descriptions quote full run ids; the first block is enough to find one. */
function shortenIds(text: string) {
	return text.replace(/\b([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "$1…");
}

function LatestAttempt({ attempt }: { attempt: Attempt }) {
	const t = useT();
	const { locale } = useLocale();
	const tone =
		attempt.status === "completed"
			? "text-emerald-400"
			: attempt.status === "running"
				? "text-muted-foreground"
				: "text-amber-300";
	return (
		<div className="rounded-md border bg-muted/30 px-4 py-3" role="status">
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
				<span className="text-muted-foreground">
					{t("Latest collection")} · {attempt.model} · {attempt.provider}
				</span>
				<strong className={tone}>{t(COLLECTION_STATUS[attempt.status] || "Failed")}</strong>
			</div>
			<p className="mt-2 line-clamp-2 break-words text-sm">{attempt.promptValue}</p>
			<p className="mt-1 text-xs text-muted-foreground">
				<time dateTime={new Date(attempt.startedAt).toISOString()}>
					{new Date(attempt.startedAt).toLocaleString(locale)}
				</time>
			</p>
		</div>
	);
}

type Action = Awaited<ReturnType<typeof getMonitoringFn>>["actions"][number];
export type ActionKindFilter = "all" | "seo" | "geo";
const actionFilterLabels: Record<ActionKindFilter, string> = {
	all: "All actions",
	seo: "SEO actions",
	geo: "GEO actions",
};
const emptyActionMessages: Record<ActionKindFilter, string> = {
	all: "No saved actions yet. Save a search diagnosis or an AI visibility recommendation.",
	seo: "No SEO actions yet. Review search diagnosis and save a candidate.",
	geo: "No GEO actions yet. Collect a baseline, then save a recommendation.",
};

type MonitoringLoopProps = {
	brandId: string;
	initialKind?: ActionKindFilter;
	onKindChange?: (kind: ActionKindFilter) => void;
	onOpenSearch?: () => void;
	focusActionId?: string;
};

function OpenSearch({ onOpenSearch }: { onOpenSearch?: () => void }) {
	const t = useT();
	return onOpenSearch ? (
		<Button variant="outline" onClick={onOpenSearch}>
			{t("Open search diagnosis")}
		</Button>
	) : (
		<a className={button} href="/opportunities#search">
			{t("Open search diagnosis")}
		</a>
	);
}

function SeoComparison({
	comparison,
	onOpenSearch,
}: {
	comparison: Action["seoComparison"];
	onOpenSearch?: () => void;
}) {
	const t = useT();
	const { locale } = useLocale();
	return (
		<div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
			<p className="font-medium">
				{t("SEO comparison")}: {t(comparison?.status ?? "waiting")}
			</p>
			<p>{searchComparisonText(comparison ?? {}, locale)}</p>
			{comparison && "windows" in comparison && comparison.windows && (
				<dl className="grid gap-1">
					<div>
						<dt className="inline text-muted-foreground">{t("Baseline period")}: </dt>
						<dd className="inline">
							{comparison.windows.baseline.startDate} – {comparison.windows.baseline.endDate}
						</dd>
					</div>
					<div>
						<dt className="inline text-muted-foreground">{t("Comparison period")}: </dt>
						<dd className="inline">
							{comparison.windows.current.startDate} – {comparison.windows.current.endDate}
						</dd>
					</div>
				</dl>
			)}
			<p className="text-muted-foreground">
				{t(
					"Compare equal, non-overlapping full periods after implementation, using the Search Console timezone (America/Los_Angeles).",
				)}
			</p>
			{comparison?.status === "comparable" && "clicksDelta" in comparison && (
				<p>
					{t("Change in clicks")}: {comparison.clicksDelta}
				</p>
			)}
			<p className="text-muted-foreground">
				{t("Refresh search data after a full comparison period. Movement is not proof of causation.")}
			</p>
			<OpenSearch onOpenSearch={onOpenSearch} />
		</div>
	);
}

function ActionCard({
	brandId,
	action,
	note,
	onNoteChange,
	busy,
	onApply,
	onRetest,
	onOpenSearch,
}: {
	brandId: string;
	action: Action;
	note: string;
	onNoteChange: (note: string) => void;
	busy: boolean;
	onApply: () => void;
	onRetest: () => void;
	onOpenSearch?: () => void;
}) {
	const t = useT();
	const { locale } = useLocale();
	const text = searchActionText(action, locale);
	return (
		<Card id={`optimization-action-${action.id}`} tabIndex={-1} className="scroll-mt-6 gap-3 py-5 shadow-none">
			<CardHeader className="flex flex-row items-start justify-between gap-4 px-5">
				<div className="min-w-0 space-y-1">
					<span className="text-xs font-medium text-muted-foreground">{action.kind === "seo" ? "SEO" : "GEO"}</span>
					<CardTitle className="break-words text-sm font-medium leading-snug">{t(text.title)}</CardTitle>
				</div>
				<span
					className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${action.status === "planned" ? "text-muted-foreground" : "border-emerald-500/40 text-emerald-400"}`}
				>
					{action.status === "planned" ? t("Planned") : t("Applied")}
				</span>
			</CardHeader>
			<CardContent className="space-y-3 px-5">
				<p className="whitespace-pre-line break-words text-sm text-muted-foreground">{shortenIds(text.description)}</p>
				<ContentDraft brandId={brandId} action={action} />
				{action.status === "planned" ? (
					<div className="flex flex-wrap gap-2">
						<input
							aria-label={t("Implementation note for {title}", { title: text.title })}
							placeholder={t("What changed? Add a page URL or a short note.")}
							className="min-w-0 w-full flex-1 rounded-md border bg-background px-3 py-2 text-sm sm:w-auto sm:min-w-64"
							maxLength={2000}
							value={note}
							onChange={(event) => onNoteChange(event.target.value)}
						/>
						<button
							className={button}
							type="button"
							disabled={
								busy || !note.trim() || Boolean(action.contentDraft && action.reviewedRevision !== action.draftRevision)
							}
							onClick={onApply}
						>
							{t("Mark implemented")}
						</button>
					</div>
				) : (
					<>
						<p className="break-words text-sm">{action.implementationNote}</p>
						{action.comparison && (
							<p className="text-sm">
								{t("Matched retests: ")}
								{action.comparison.matched}/{action.comparison.expected} · {action.comparison.missing}
								{t(" missing.")}{" "}
								{action.comparison.deltaPoints === null
									? t("Awaiting comparable results.")
									: t("Mention rate: {before}% → {after}% ({delta} percentage points).", {
											before: formatRate(action.comparison.beforeRate),
											after: formatRate(action.comparison.afterRate),
											delta: `${action.comparison.deltaPoints > 0 ? "+" : ""}${action.comparison.deltaPoints.toFixed(1)}`,
										})}
							</p>
						)}
						{action.kind === "seo" && <SeoComparison comparison={action.seoComparison} onOpenSearch={onOpenSearch} />}
						{action.kind !== "seo" && (
							<button className={button} type="button" disabled={busy} onClick={onRetest}>
								{t("Retest · uses configured providers")}
							</button>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}

export function MonitoringLoop({
	brandId,
	initialKind = "all",
	onKindChange,
	onOpenSearch,
	focusActionId,
}: MonitoringLoopProps) {
	const t = useT();
	const { locale } = useLocale();
	const client = useQueryClient();
	const [kind, setKind] = useState<ActionKindFilter>(initialKind);
	useEffect(() => setKind(initialKind), [initialKind]);
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [notice, setNotice] = useState<{ message: string; values?: Record<string, number> } | null>(null);
	const queryKey = ["monitoring", brandId];
	const { data, isPending, error } = useQuery({
		queryKey,
		queryFn: () => getMonitoringFn({ data: { brandId } }),
		refetchInterval: 15_000,
	});
	const actions = data?.actions.filter((action) => kind === "all" || (action.kind === "seo" ? "seo" : "geo") === kind);
	const canFocusAction = Boolean(focusActionId && actions?.some((action) => action.id === focusActionId));
	useEffect(() => {
		if (!focusActionId || !canFocusAction) return;
		const card = document.getElementById(`optimization-action-${focusActionId}`);
		card?.scrollIntoView({ block: "nearest" });
		card?.focus({ preventScroll: true });
	}, [focusActionId, canFocusAction]);
	const mutation = useMutation({
		mutationFn: async ({ id, operation }: { id: string; operation: "apply" | "retest" }) => {
			if (operation === "apply") {
				await applyOptimizationActionFn({ data: { brandId, id, implementationNote: notes[id] || "" } });
				return {
					message:
						data?.actions.find((action) => action.id === id)?.kind === "seo"
							? "Change recorded. After a full comparison period, refresh Search Console in Search diagnosis."
							: "Change recorded. Compare the same questions after the next collection.",
				};
			}
			const result = await retestOptimizationActionFn({ data: { brandId, id } });
			return {
				message:
					"{queued} questions queued; {skipped} changed or disabled. Retesting uses your configured providers and may incur charges.",
				values: { queued: result.queued, skipped: result.skipped },
			};
		},
		onSuccess: (message) => {
			setNotice(message);
			void client.invalidateQueries({ queryKey });
		},
	});
	return (
		<section className="space-y-8" aria-label={t("Optimization and retesting")}>
			<fieldset className="flex flex-wrap gap-2" aria-label={t("Filter actions by type")}>
				{(["all", "seo", "geo"] as const).map((value) => (
					<Button
						key={value}
						variant={kind === value ? "default" : "outline"}
						aria-pressed={kind === value}
						onClick={() => {
							setKind(value);
							onKindChange?.(value);
						}}
					>
						{t(actionFilterLabels[value])}
					</Button>
				))}
			</fieldset>
			{isPending && <p className="text-sm text-muted-foreground">{t("Loading monitoring history…")}</p>}
			{error && <p role="alert">{t("Monitoring history unavailable. Check the database migration and connection.")}</p>}
			{kind !== "seo" && (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
					<Card className="gap-4 py-5 shadow-none">
						<CardHeader className="px-5">
							<CardTitle className="text-sm font-medium">{t("Collect a question")}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-5 px-5">
							{data && (
								<CollectionCheck brandId={brandId} ready={data.runtime.worker === "ready"} questions={data.questions} />
							)}
							{data && data.attempts.length > 0 && <LatestAttempt attempt={data.attempts[0]} />}
						</CardContent>
					</Card>
					<Card className="gap-4 py-5 shadow-none">
						<CardContent className="px-5">
							<WorkspaceControl brandId={brandId} />
						</CardContent>
					</Card>
				</div>
			)}

			<section className="space-y-4" aria-label={t("Saved actions")}>
				<div className="space-y-1">
					<h3 className="text-base font-semibold">
						{t("Saved actions")}
						{actions && actions.length > 0 && (
							<span className="ml-2 text-sm font-normal text-muted-foreground">{actions.length}</span>
						)}
					</h3>
					<p className="max-w-3xl text-[13px] text-muted-foreground">
						{t(
							"Save an opportunity, implement it, then compare matching search periods or AI questions. Observed changes do not prove causation.",
						)}
					</p>
				</div>
				{mutation.error && <p role="alert">{t(mutation.error.message)}</p>}
				{notice && (
					<p role="status" className="text-sm">
						{t(notice.message, notice.values)}
					</p>
				)}
				{actions?.length === 0 && (
					<div className="space-y-3 text-sm text-muted-foreground">
						<p>{t(emptyActionMessages[kind])}</p>
						{kind === "seo" && <OpenSearch onOpenSearch={onOpenSearch} />}
					</div>
				)}
				{actions?.map((action) => (
					<ActionCard
						key={action.id}
						brandId={brandId}
						action={action}
						note={notes[action.id] || ""}
						onNoteChange={(note) => setNotes({ ...notes, [action.id]: note })}
						onOpenSearch={onOpenSearch}
						busy={mutation.isPending}
						onApply={() => mutation.mutate({ id: action.id, operation: "apply" })}
						onRetest={() => mutation.mutate({ id: action.id, operation: "retest" })}
					/>
				))}
			</section>

			{kind !== "seo" && (
				<details className="border-t pt-5">
					<summary className="cursor-pointer text-sm font-medium">
						{t("Recent collections ({count})", { count: data?.attempts.length ?? 0 })}
					</summary>
					<p className="my-2 text-xs text-muted-foreground">
						{t(
							"Latest 50 attempts. Failures are excluded from visibility. Comparisons use up to 2,000 recent completed observations.",
						)}
					</p>
					<div className="divide-y">
						{data?.attempts.map((attempt) => (
							<div key={attempt.id} className="py-3 text-sm">
								<div className="flex justify-between gap-3">
									<span>
										{attempt.model} · {attempt.provider}
									</span>
									<strong>{t(COLLECTION_STATUS[attempt.status] || "Failed")}</strong>
								</div>
								<p className="truncate text-muted-foreground">{attempt.promptValue}</p>
								<p className="text-xs text-muted-foreground">{new Date(attempt.startedAt).toLocaleString(locale)}</p>
							</div>
						))}
					</div>
				</details>
			)}
		</section>
	);
}
