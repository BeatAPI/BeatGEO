import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CollectionCheck } from "@/components/collection-check";
import { ContentDraft } from "@/components/content-draft";
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
		<section className="space-y-6" aria-label={t("Optimization and retesting")}>
			<p className="max-w-3xl text-[13px] text-muted-foreground">
				{t(
					"Save an opportunity, implement it, then compare matching questions and model versions. Changes in mention rate do not prove causation.",
				)}
			</p>
			{isPending && <p>{t("Loading monitoring history…")}</p>}
			{error && <p role="alert">{t("Monitoring history unavailable. Check the database migration and connection.")}</p>}
			{mutation.error && <p role="alert">{t(mutation.error.message)}</p>}
			{notice && (
				<p role="status" className="text-sm">
					{t(notice.message, notice.values)}
				</p>
			)}
			{data && <CollectionCheck brandId={brandId} ready={data.runtime.worker === "ready"} questions={data.questions} />}
			{data && data.attempts.length > 0 && (
				<div className="border-l-2 border-border pl-4 py-1" role="status">
					<p className="text-sm font-medium">{t("Latest collection")}</p>
					<div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
						<span>
							{data.attempts[0].model} · {data.attempts[0].provider}
						</span>
						<strong
							className={
								data.attempts[0].status === "completed"
									? "text-emerald-400"
									: data.attempts[0].status === "running"
										? "text-muted-foreground"
										: "text-amber-300"
							}
						>
							{t(COLLECTION_STATUS[data.attempts[0].status] || "Failed")}
						</strong>
					</div>
					<p className="mt-2 break-words text-sm text-muted-foreground">{data.attempts[0].promptValue}</p>
					<p className="mt-1 text-xs text-muted-foreground">
						<time dateTime={new Date(data.attempts[0].startedAt).toISOString()}>
							{new Date(data.attempts[0].startedAt).toLocaleString()}
						</time>
					</p>
				</div>
			)}
			{data?.actions.length === 0 && (
				<p className="text-sm text-muted-foreground">
					{t("No saved actions yet. Collect a baseline, then save a recommendation.")}
				</p>
			)}
			{data?.actions.map((action) => (
				<article key={action.id} className="space-y-3 border-t pt-6">
					<div className="flex items-center justify-between gap-4">
						<h3 className="font-medium">{action.title}</h3>
						<span className="text-xs text-muted-foreground">
							{action.status === "planned" ? t("Planned") : t("Applied")}
						</span>
					</div>
					<p className="text-sm text-muted-foreground">{action.description}</p>
					<ContentDraft brandId={brandId} action={action} />
					{action.status === "planned" ? (
						<div className="flex flex-wrap gap-2">
							<input
								aria-label={t("Implementation note for {title}", { title: action.title })}
								placeholder={t("What changed? Add a page URL or a short note.")}
								className="min-w-64 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
								maxLength={2000}
								value={notes[action.id] || ""}
								onChange={(event) => setNotes({ ...notes, [action.id]: event.target.value })}
							/>
							<button
								className={button}
								type="button"
								disabled={
									mutation.isPending ||
									!notes[action.id]?.trim() ||
									Boolean(action.contentDraft && action.reviewedRevision !== action.draftRevision)
								}
								onClick={() => mutation.mutate({ id: action.id, operation: "apply" })}
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
							<button
								className={button}
								type="button"
								disabled={mutation.isPending}
								onClick={() => mutation.mutate({ id: action.id, operation: "retest" })}
							>
								{t("Retest · uses configured providers")}
							</button>
						</>
					)}
				</article>
			))}

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
