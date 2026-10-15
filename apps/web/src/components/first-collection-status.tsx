import { useQuery } from "@tanstack/react-query";
import { COLLECTION_STATUS } from "@/components/monitoring-loop";
import { useBrandId } from "@/hooks/use-brand-id";
import { getMonitoringFn } from "@/server/monitoring-fn";

export function FirstCollectionStatus() {
	const brandId = useBrandId();
	const { data, error, isPending } = useQuery({
		queryKey: ["monitoring", brandId],
		queryFn: () => getMonitoringFn({ data: { brandId: brandId! } }),
		enabled: Boolean(brandId),
		refetchInterval: 15000,
	});
	return (
		<section className="mt-6 w-full space-y-3 text-left text-sm" aria-label="First collection status">
			{isPending && <p role="status">Checking collection status…</p>}
			{error && <p role="alert">Could not load collection status. Check your local services.</p>}
			{data?.attempts.length === 0 && (
				<p role="status">No collection has started yet. Keep the local worker running.</p>
			)}
			{data?.attempts.slice(0, 5).map((attempt) => (
				<div key={attempt.id} className="rounded-lg border p-3">
					<p className="font-medium">
						{attempt.model} · {COLLECTION_STATUS[attempt.status] || "Failed"}
					</p>
					<p className="text-muted-foreground">{attempt.promptValue}</p>
				</div>
			))}
			{Boolean(data?.attempts.length) && (
				<p className="text-muted-foreground">
					Failed or incomplete answers do not count as zero visibility. Status updates every 15 seconds.
				</p>
			)}
		</section>
	);
}
