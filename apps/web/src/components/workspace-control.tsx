import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useT } from "@/lib/i18n";
import { applyWorkspaceOperationFn, getWorkspaceControlFn } from "@/server/workspace-fn";

export function WorkspaceControl({ brandId }: { brandId: string }) {
	const t = useT();
	const client = useQueryClient();
	const [hours, setHours] = useState<number | null>(null);
	const queryKey = ["workspace-control", brandId];
	const { data, error } = useQuery({
		queryKey,
		queryFn: () => getWorkspaceControlFn({ data: { brandId } }),
		refetchInterval: 10000,
	});
	const cadence = hours ?? data?.brand.delayOverrideHours ?? 24;
	const mutation = useMutation({
		mutationFn: (enabled: boolean) => {
			if (!data) throw new Error("Workspace unavailable");
			return applyWorkspaceOperationFn({
				data: {
					brandId,
					idempotencyKey: uuid(),
					command: {
						type: "configure_monitoring",
						enabled,
						intervalHours: enabled ? cadence : (data.brand.delayOverrideHours ?? 24),
						expectedUpdatedAt: new Date(data.brand.updatedAt).toISOString(),
					},
				},
			});
		},
		onSuccess: () => {
			setHours(null);
			return client.invalidateQueries({ queryKey });
		},
	});
	if (error) return <p role="alert">{t("Workspace history unavailable. Check local storage.")}</p>;
	if (!data) return null;
	return (
		<section className="space-y-3 border-t pt-5" aria-label={t("Agent and manual workspace")}>
			<h3 className="text-sm font-medium">{t("Agent and manual workspace")}</h3>
			<p className="text-sm text-muted-foreground">
				{t(data.brand.enabled ? "Recurring monitoring enabled" : "Recurring monitoring paused")}
			</p>
			<p className="text-xs text-muted-foreground">
				{t("One-shot collections do not enable monitoring. Keep BeatGEO and Chrome online for scheduled work.")}
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<label className="text-sm">
					{t("Interval in hours")}{" "}
					<input
						className="w-20 rounded border bg-background p-1"
						type="number"
						min={1}
						max={720}
						value={cadence}
						onChange={(event) => setHours(Number(event.target.value))}
					/>
				</label>
				<button
					type="button"
					className="rounded border px-3 py-1 text-sm disabled:opacity-50"
					disabled={mutation.isPending || !Number.isInteger(cadence) || cadence < 1 || cadence > 720}
					onClick={() => mutation.mutate(true)}
				>
					{t("Enable or update monitoring")}
				</button>
				<button
					type="button"
					className="rounded border px-3 py-1 text-sm disabled:opacity-50"
					disabled={mutation.isPending || !data.brand.enabled}
					onClick={() => mutation.mutate(false)}
				>
					{t("Pause monitoring")}
				</button>
			</div>
			{mutation.error && (
				<p role="alert" className="text-sm">
					{mutation.error.message}
				</p>
			)}
			<details>
				<summary className="cursor-pointer text-sm">
					{t("Workspace operation history")} · {data.history.length}
				</summary>
				<div className="divide-y">
					{data.history.map((entry) => (
						<div key={entry.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs">
							<span>
								{entry.operation} · {entry.status}
							</span>
							<time dateTime={new Date(entry.createdAt).toISOString()}>
								{new Date(entry.createdAt).toLocaleString()}
							</time>
						</div>
					))}
				</div>
			</details>
		</section>
	);
}
