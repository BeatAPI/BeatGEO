import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { collectOneQuestionFn } from "@/server/monitoring-fn";
export function CollectionCheck({
	brandId,
	ready,
	questions,
}: {
	brandId: string;
	ready: boolean;
	questions: { id: string; value: string }[];
}) {
	const t = useT();
	const client = useQueryClient();
	const [selected, setSelected] = useState("");
	const promptId = questions.some((q) => q.id === selected) ? selected : questions[0]?.id;
	const mutation = useMutation({
		mutationFn: () => collectOneQuestionFn({ data: { brandId, promptId: promptId! } }),
		onSuccess: () => client.invalidateQueries({ queryKey: ["monitoring", brandId] }),
	});
	return (
		<div className="space-y-3 rounded-lg border p-4">
			<p className="text-sm font-medium">{t(ready ? "Worker ready" : "Worker not ready")}</p>
			{!ready && (
				<p className="text-sm text-muted-foreground">
					{t("Collection is not ready. Start pnpm local:start and refresh; queued questions are preserved.")}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<select
					aria-label={t("Question to collect")}
					className="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm"
					value={promptId || ""}
					onChange={(e) => setSelected(e.target.value)}
					disabled={!questions.length}
				>
					{!questions.length && <option value="">{t("No enabled questions")}</option>}
					{questions.map((q) => (
						<option key={q.id} value={q.id}>
							{q.value}
						</option>
					))}
				</select>
				<button
					type="button"
					className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
					disabled={!ready || !promptId || mutation.isPending}
					onClick={() => mutation.mutate()}
				>
					{t("Collect this question")}
				</button>
			</div>
			<p className="text-xs text-muted-foreground">
				{t(
					"Runs this question on configured targets. Existing scheduled jobs remain queued. API targets may incur charges; duplicate clicks are limited for 5 minutes.",
				)}
			</p>
			{mutation.data && (
				<p role="status" className="text-sm">
					{t(
						mutation.data.queued
							? "Question queued. Follow the collection history below."
							: "This question is already queued or was requested recently.",
					)}
				</p>
			)}
			{mutation.error && <p role="alert">{t(mutation.error.message)}</p>}
		</div>
	);
}
