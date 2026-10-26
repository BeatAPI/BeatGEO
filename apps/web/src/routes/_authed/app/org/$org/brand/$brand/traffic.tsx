import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TrafficPanel } from "@/components/traffic-panel";
import { useBrandId } from "@/hooks/use-brand-id";
import { useT } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";
import {
	connectGaFn,
	disconnectGaFn,
	getGaPropertiesFn,
	getTrafficFn,
	importCrawlsFn,
	syncGaFn,
} from "@/server/traffic-fn";
export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/traffic")({
	staticData: { crumb: "AI Traffic & Crawls" },
	validateSearch: (s: Record<string, unknown>) => ({
		ga: ["connected", "error", "denied"].includes(String(s.ga)) ? String(s.ga) : undefined,
	}),
	head: pageHead({ title: "AI Traffic & Crawls", description: "AI referral visits and crawler observations." }),
	component: TrafficPage,
});
function TrafficPage() {
	const brandId = useBrandId(),
		t = useT(),
		client = useQueryClient();
	const [ignoreCallback, setIgnoreCallback] = useState(false);
	const [busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const { ga: result } = Route.useSearch();
	const key = ["traffic", brandId];
	const query = useQuery({ queryKey: key, queryFn: () => getTrafficFn({ data: { brandId } }) });
	const properties = useQuery({
		queryKey: ["ga-properties", brandId],
		queryFn: () => getGaPropertiesFn({ data: { brandId } }),
		enabled: Boolean(query.data?.ga?.connected && !query.data.ga.config?.property),
		retry: false,
	});
	async function act(work: () => Promise<unknown>) {
		setBusy(true);
		setIgnoreCallback(true);
		setError("");
		try {
			await work();
			await client.invalidateQueries({ queryKey: key });
			await client.invalidateQueries({ queryKey: ["ga-properties", brandId] });
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not update this data source. Try again.");
		} finally {
			setBusy(false);
		}
	}
	if (query.isPending) return <p>{t("Loading...")}</p>;
	if (!query.data)
		return (
			<p role="alert" className="text-destructive">
				{t("Could not load traffic sources. Refresh and try again.")}
			</p>
		);
	const callbackError =
		result === "error"
			? "Google authorization could not be completed. Connect again."
			: result === "denied"
				? "Google authorization was cancelled. No connection was changed."
				: "";
	return (
		<TrafficPanel
			data={query.data}
			properties={properties.data ?? []}
			busy={busy}
			error={error || properties.error?.message || (ignoreCallback ? "" : callbackError)}
			onConnect={() =>
				act(async () => {
					const { url } = await connectGaFn({ data: { brandId } });
					window.location.assign(url);
				})
			}
			onSync={(propertyId) => act(() => syncGaFn({ data: { brandId, propertyId } }))}
			onDisconnect={() => act(() => disconnectGaFn({ data: { brandId } }))}
			onImport={(file, format) =>
				act(async () => {
					if (file.size > 10 * 1024 * 1024) throw new Error("Log input limit is 10 MiB.");
					const resolved = format === "auto" && /\.(jsonl|ndjson)$/i.test(file.name) ? "jsonl" : format;
					await importCrawlsFn({ data: { brandId, content: await file.text(), format: resolved } });
				})
			}
		/>
	);
}
