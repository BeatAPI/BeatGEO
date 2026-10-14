import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { applyOptimizationActionFn, getMonitoringFn, retestOptimizationActionFn } from "@/server/monitoring-fn";

const STATUS: Record<string, string> = {
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
const button = "rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50";

export function MonitoringLoop({ brandId }: { brandId: string }) {
	const client = useQueryClient();
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [notice, setNotice] = useState("");
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
				return "Change recorded. Compare the same questions after the next collection.";
			}
			const result = await retestOptimizationActionFn({ data: { brandId, id } });
			return `${result.queued} questions queued; ${result.skipped} changed or disabled. Retesting uses your configured providers and may incur charges.`;
		},
		onSuccess: (message) => {
			setNotice(message);
			void client.invalidateQueries({ queryKey });
		},
	});
	return (
		<section className="space-y-4 rounded-xl border p-5" aria-label="Optimization and retesting">
			<h2 className="font-semibold">Optimize & retest</h2>
			<p className="text-sm text-muted-foreground">
				Save an opportunity, implement it, then compare matching questions and model versions. Changes in mention rate
				do not prove causation.
			</p>
			{isPending && <p>Loading monitoring history…</p>}
			{error && <p role="alert">Monitoring history unavailable. Check the database migration and connection.</p>}
			{mutation.error && <p role="alert">{mutation.error.message}</p>}
			{notice && (
				<p role="status" className="text-sm">
					{notice}
				</p>
			)}
			{data?.actions.length === 0 && (
				<p className="text-sm text-muted-foreground">
					No actions yet. Save an opportunity below after collecting a baseline.
				</p>
			)}
			{data?.actions.map((action) => (
				<article key={action.id} className="space-y-3 rounded-lg border p-4">
					<div className="flex items-center justify-between gap-4">
						<h3 className="font-medium">{action.title}</h3>
						<span className="text-xs text-muted-foreground">{action.status === "planned" ? "Planned" : "Applied"}</span>
					</div>
					<p className="text-sm text-muted-foreground">{action.description}</p>
					{action.status === "planned" ? (
						<div className="flex flex-wrap gap-2">
							<input
								aria-label={`Implementation note for ${action.title}`}
								placeholder="What changed? Add a page URL or a short note."
								className="min-w-64 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
								maxLength={2000}
								value={notes[action.id] || ""}
								onChange={(event) => setNotes({ ...notes, [action.id]: event.target.value })}
							/>
							<button
								className={button}
								type="button"
								disabled={mutation.isPending || !notes[action.id]?.trim()}
								onClick={() => mutation.mutate({ id: action.id, operation: "apply" })}
							>
								Mark implemented
							</button>
						</div>
					) : (
						<>
							<p className="text-sm">{action.implementationNote}</p>
							{action.comparison && (
								<p className="text-sm">
									Matched retests: {action.comparison.matched}/{action.comparison.expected} ·{" "}
									{action.comparison.missing} missing.{" "}
									{action.comparison.deltaPoints === null
										? "Awaiting comparable results."
										: `Mention rate: ${action.comparison.beforeRate?.toFixed(1)}% → ${action.comparison.afterRate?.toFixed(1)}% (${action.comparison.deltaPoints > 0 ? "+" : ""}${action.comparison.deltaPoints.toFixed(1)} percentage points).`}
								</p>
							)}
							<button
								className={button}
								type="button"
								disabled={mutation.isPending}
								onClick={() => mutation.mutate({ id: action.id, operation: "retest" })}
							>
								Retest · uses configured providers
							</button>
						</>
					)}
				</article>
			))}
			<details>
				<summary className="cursor-pointer text-sm font-medium">
					Recent collection attempts ({data?.attempts.length ?? 0})
				</summary>
				<p className="my-2 text-xs text-muted-foreground">
					Latest 50 attempts. Failures are excluded from visibility. Comparisons use up to 2,000 recent completed
					observations.
				</p>
				<div className="divide-y">
					{data?.attempts.map((attempt) => (
						<div key={attempt.id} className="py-3 text-sm">
							<div className="flex justify-between gap-3">
								<span>
									{attempt.model} · {attempt.provider}
								</span>
								<strong>{STATUS[attempt.status] || "Failed"}</strong>
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
