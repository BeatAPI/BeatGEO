import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { GoogleConnection } from "@/components/google-connection";
import { GscPanel } from "@/components/gsc-panel";
import { TrafficPanel } from "@/components/traffic-panel";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrandParams } from "@/hooks/use-route-params";
import { useT } from "@/lib/i18n";
import {
	connectGoogleFn,
	disconnectGaFn,
	disconnectGscFn,
	getGaPropertiesFn,
	getGscPropertiesFn,
	getTrafficFn,
	importCrawlsFn,
	syncGaFn,
	syncGscFn,
} from "@/server/traffic-fn";

function authorizationError(status?: string) {
	if (status === "error") return "Google authorization could not be completed. Connect again.";
	if (status === "denied") return "Google authorization was cancelled. No connection was changed.";
	return "";
}
function retryGoogleProperties(failureCount: number, error: Error) {
	// GSC and GA share a credential lock while their property lists load together.
	return failureCount < 3 && error.message === "This connection is busy. Try again shortly.";
}
export function TrafficSources({
	settingsOnly = false,
	view = "traffic",
	result,
	gscResult,
	googleResult,
}: {
	settingsOnly?: boolean;
	view?: "traffic" | "gsc";
	result?: string;
	gscResult?: string;
	googleResult?: string;
}) {
	const params = useBrandParams();
	const { showGsc, showGa } = sourceViews(settingsOnly, view);
	const brandId = useBrandId(),
		t = useT(),
		client = useQueryClient();
	const [ignoreCallback, setIgnoreCallback] = useState(false);
	const [busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const key = ["traffic", brandId];
	const query = useQuery({ queryKey: key, queryFn: () => getTrafficFn({ data: { brandId } }) });
	const properties = useQuery({
		queryKey: ["ga-properties", brandId],
		queryFn: () => getGaPropertiesFn({ data: { brandId } }),
		enabled: Boolean(settingsOnly && needsGaProperty(query.data)),
		retry: retryGoogleProperties,
		retryDelay: (attempt) => 1000 * 2 ** attempt,
	});
	const gscProperties = useQuery({
		queryKey: ["gsc-properties", brandId],
		queryFn: () => getGscPropertiesFn({ data: { brandId } }),
		enabled: Boolean(settingsOnly && query.data?.gsc?.connected),
		retry: retryGoogleProperties,
		retryDelay: (attempt) => 1000 * 2 ** attempt,
	});
	async function act(work: () => Promise<unknown>) {
		setBusy(true);
		setIgnoreCallback(true);
		setError("");
		try {
			await work();
			await client.invalidateQueries({ queryKey: key });
			await client.invalidateQueries({ queryKey: ["ga-properties", brandId] });
			await client.invalidateQueries({ queryKey: ["gsc-properties", brandId] });
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
	const callbackError = authorizationErrors(googleResult, result, gscResult);
	const connect = () =>
		act(async () => {
			const { url } = await connectGoogleFn({ data: { brandId, destination: settingsOnly ? "brand" : "traffic" } });
			window.location.assign(url);
		});
	const displayError = connectionError(
		error,
		showGa ? properties.error : null,
		showGsc ? gscProperties.error : null,
		ignoreCallback ? "" : callbackError,
	);
	return (
		<>
			{settingsOnly ? (
				<GoogleConnection
					data={query.data}
					busy={busy}
					onConnect={connect}
					partial={!ignoreCallback && googleResult === "partial"}
				/>
			) : (
				<div className="mb-5 flex justify-end">
					<Link
						to="/app/org/$org/brand/$brand/settings/brand"
						params={params}
						className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
					>
						{t("Manage Google connection")}
					</Link>
				</div>
			)}
			{displayError && (
				<p role="alert" className="mb-4 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
					{t(displayError)}
				</p>
			)}
			{shouldShowGsc(showGsc, settingsOnly, query.data) && (
				<GscPanel
					settingsOnly={settingsOnly}
					showConnect={false}
					data={query.data}
					properties={gscProperties.data ?? []}
					propertiesLoading={gscProperties.isLoading}
					propertiesFailed={gscProperties.isError}
					busy={busy}
					onConnect={connect}
					onSync={(property) => act(() => syncGscFn({ data: { brandId, property } }))}
					onDisconnect={() => act(() => disconnectGscFn({ data: { brandId } }))}
				/>
			)}
			{showGa && (
				<TrafficPanel
					settingsOnly={settingsOnly}
					showConnect={false}
					data={query.data}
					properties={properties.data ?? []}
					busy={busy}
					error=""
					onConnect={connect}
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
			)}
			{settingsOnly && (
				<div className="mt-4 flex flex-wrap gap-4 text-sm">
					<Link className="underline underline-offset-4" to="/app/org/$org/brand/$brand/search-console" params={params}>
						{t("View search performance")}
					</Link>
					<Link
						className="underline underline-offset-4"
						to="/app/org/$org/brand/$brand/traffic"
						search={{}}
						params={params}
					>
						{t("View AI traffic")}
					</Link>
				</div>
			)}
		</>
	);
}

function needsGaProperty(data: Awaited<ReturnType<typeof getTrafficFn>> | undefined) {
	return data?.ga?.connected && !data.ga.config?.property;
}
function connectionError(error: string, ga: Error | null, gsc: Error | null, callback: string) {
	return error || ga?.message || gsc?.message || callback;
}

function sourceViews(settingsOnly: boolean, view: "traffic" | "gsc") {
	return { showGsc: settingsOnly || view === "gsc", showGa: settingsOnly || view === "traffic" };
}
function shouldShowGsc(show: boolean, settingsOnly: boolean, data: Awaited<ReturnType<typeof getTrafficFn>>) {
	return show && (!settingsOnly || data.gsc?.connected);
}

function authorizationErrors(...statuses: Array<string | undefined>) {
	return statuses.map(authorizationError).find(Boolean) ?? "";
}
