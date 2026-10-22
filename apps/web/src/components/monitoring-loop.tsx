import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { useState } from "react";
import { CollectionCheck } from "@/components/collection-check";
import { ContentDraft } from "@/components/content-draft";
import { WorkspaceControl } from "@/components/workspace-control";
import { useT } from "@/lib/i18n";
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
				<time dateTime={new Date(attempt.startedAt).toISOString()}>{new Date(attempt.startedAt).toLocaleString()}</time>
			</p>
		</div>
	);
}

type Action = Awaited<ReturnType<typeof getMonitoringFn>>["actions"][number];

function ActionCard({
	brandId,
	action,
	note,
	onNoteChange,
	busy,
	onApply,
	onRetest,
}: {
	brandId: string;
	action: Action;
	note: string;
	onNoteChange: (note: string) => void;
	busy: boolean;
	onApply: () => void;
	onRetest: () => void;
}) {
	const t = useT();
	return (
		<Card className="gap-3 py-5 shadow-none">
			<CardHeader className="flex flex-row items-start justify-between gap-4 px-5">
				<CardTitle className="text-sm font-medium leading-snug">{action.title}</CardTitle>
				<span
					className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${action.status === "planned" ? "text-muted-foreground" : "border-emerald-500/40 text-emerald-400"}`}
				>
					{action.status === "planned" ? t("Planned") : t("Applied")}
				</span>
			</CardHeader>
			<CardContent className="space-y-3 px-5">
				<p className="text-sm text-muted-foreground">{shortenIds(action.description)}</p>
				<ContentDraft brandId={brandId} action={action} />
				{action.status === "planned" ? (
					<div className="flex flex-wrap gap-2">
						<input
							aria-label={t("Implementation note for {title}", { title: action.title })}
							placeholder={t("What changed? Add a page URL or a short note.")}
							className="min-w-64 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
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
						<p className="text-sm">{action.implementationNote}</p>
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
						<button className={button} type="button" disabled={busy} onClick={onRetest}>
							{t("Retest · uses configured providers")}
						</button>
					</>
				)}
			</CardContent>
		</Card>
	);
}

export function MonitoringLoop({ brandId }: { brandId: string }) {
	const t = useT();
	const client = useQueryClient();
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [notice, setNotice] = useState<{ message: string; values?: Record<string, number> } | null>(null);
	const queryKey = ["monitoring", brandId];
	const { data, isPending, error } = useQuery({
		queryKey,
		queryFn: () => getMonitoringFn({ data: { brandId } }),
		refetchInterval: 15_000,
	});
	const mutation = useMutation({
		mutationFn: async ({ id, operation }: { id: string; operation: "apply" | "retest" }) => {
			if (operation === "apply") {
				await applyOptimizationActionFn({ data: { brandId, id, implementationNote: notes[id] || "" } });
				return { message: "Change recorded. Compare the same questions after the next collection." };
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
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<Card className="gap-4 py-5 shadow-none">
					<CardHeader className="px-5">
						<CardTitle className="text-sm font-medium">{t("Collect a question")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-5 px-5">
						{isPending && <p className="text-sm text-muted-foreground">{t("Loading monitoring history…")}</p>}
						{error && (
							<p role="alert">{t("Monitoring history unavailable. Check the database migration and connection.")}</p>
						)}
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

			<section className="space-y-4" aria-label={t("Saved actions")}>
				<div className="space-y-1">
					<h3 className="text-base font-semibold">
						{t("Saved actions")}
						{data && data.actions.length > 0 && (
							<span className="ml-2 text-sm font-normal text-muted-foreground">{data.actions.length}</span>
						)}
					</h3>
					<p className="max-w-3xl text-[13px] text-muted-foreground">
						{t(
							"Save an opportunity, implement it, then compare matching questions and model versions. Changes in mention rate do not prove causation.",
						)}
					</p>
				</div>
				{mutation.error && <p role="alert">{t(mutation.error.message)}</p>}
				{notice && (
					<p role="status" className="text-sm">
						{t(notice.message, notice.values)}
					</p>
				)}
				{data?.actions.length === 0 && (
					<p className="text-sm text-muted-foreground">
						{t("No saved actions yet. Collect a baseline, then save a recommendation.")}
					</p>
				)}
				{data?.actions.map((action) => (
					<ActionCard
						key={action.id}
						brandId={brandId}
						action={action}
						note={notes[action.id] || ""}
						onNoteChange={(note) => setNotes({ ...notes, [action.id]: note })}
						busy={mutation.isPending}
						onApply={() => mutation.mutate({ id: action.id, operation: "apply" })}
						onRetest={() => mutation.mutate({ id: action.id, operation: "retest" })}
					/>
				))}
			</section>

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
							<p className="text-xs text-muted-foreground">{new Date(attempt.startedAt).toLocaleString()}</p>
						</div>
					))}
				</div>
			</details>
		</section>
	);
}
