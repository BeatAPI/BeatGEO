import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AiReportSource } from "@workspace/lib/ai-reports";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import { useBrandParams } from "@/hooks/use-route-params";
import { useT } from "@/lib/i18n";
import { disconnectAiConnectionFn, getAiConnectionsFn, readAiConnectionFn } from "@/server/ai-report-connections";

export function AiReportConnections({ brandId, onSynced }: { brandId: string; onSynced: () => Promise<unknown> }) {
	const params = useBrandParams();
	const t = useT(),
		client = useQueryClient();
	const queryKey = ["ai-report-connections", brandId];
	const query = useQuery({ queryKey, queryFn: () => getAiConnectionsFn({ data: { brandId } }) });
	const [busy, setBusy] = useState<string | null>(null),
		[message, setMessage] = useState("");
	const [selected, setSelected] = useState<Record<string, string>>({});
	async function run(source: AiReportSource, property: string, action: "connect" | "sync" | "disconnect") {
		setBusy(`${source}:${action}`);
		setMessage("");
		try {
			if (action === "disconnect") {
				await disconnectAiConnectionFn({ data: { brandId, source } });
				setMessage("Connection removed. Saved reports are kept.");
			} else {
				const result = await readAiConnectionFn({ data: { brandId, source, property, action } });
				setMessage(
					result.ok
						? action === "connect"
							? "Report access verified. Ready to sync."
							: "AI report synchronized."
						: result.error,
				);
			}
			await Promise.all([client.invalidateQueries({ queryKey }), onSynced()]);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Could not sync AI report.");
		} finally {
			setBusy(null);
		}
	}
	if (query.isPending) return <p role="status">{t("Loading…")}</p>;
	if (query.isError)
		return (
			<div role="alert">
				{t("Could not load connections.")} <Button onClick={() => void query.refetch()}>{t("Retry")}</Button>
			</div>
		);
	return (
		<div className="space-y-4">
			<div className="rounded-xl bg-muted/40 p-4 text-sm space-y-1">
				<p className="font-medium">{t("Connect → Choose website → Sync AI data")}</p>
				<p className="text-muted-foreground">
					{t(
						"AI reports are read from your signed-in Chrome through BeatBrowser. Keep Chrome and BeatGEO open. Connecting does not start question monitoring.",
					)}
				</p>
				<p className="text-muted-foreground">
					{t(
						"Google search performance continues to use your existing Google authorization. AI report access is checked separately.",
					)}
				</p>
				<Link
					to="/app/org/$org/brand/$brand/settings/brand"
					params={params}
					hash="browser"
					className="inline-block pt-2 underline"
				>
					{t("Choose Chrome workspace")}
				</Link>
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				{(["bing", "google"] as const).map((source) => (
					<SourceCard
						key={source}
						source={source}
						websites={query.data.websites}
						stored={query.data.connections.find((c) => c.source === source)}
						selected={selected[source]}
						onSelect={(value) => setSelected((v) => ({ ...v, [source]: value }))}
						busy={busy}
						run={run}
					/>
				))}
			</div>
			{message && (
				<p role="status" className="text-sm">
					{t(message)}
				</p>
			)}
		</div>
	);
}

function statusLabel(ready: boolean, state: string) {
	if (ready) return "Access verified";
	return state === "needs-attention" ? "Connection needs attention" : "Not connected";
}
function connectLabel(source: AiReportSource, busy: string | null, ready: boolean) {
	if (busy === `${source}:connect`) return "Checking connection…";
	if (ready) return "Check connection";
	return source === "bing" ? "Connect Bing" : "Connect Google AI";
}
function connectionFields(stored?: Record<string, unknown>) {
	const text = (key: string) => (typeof stored?.[key] === "string" ? (stored[key] as string) : "");
	return {
		property: text("property"),
		state: text("state"),
		error: text("error"),
		lastSyncedAt: text("lastSyncedAt"),
		checkedAt: text("checkedAt"),
	};
}
function SourceCard({
	source,
	websites,
	stored,
	selected,
	onSelect,
	busy,
	run,
}: {
	source: AiReportSource;
	websites: string[];
	stored?: Record<string, unknown>;
	selected?: string;
	onSelect: (value: string) => void;
	busy: string | null;
	run: (source: AiReportSource, property: string, action: "connect" | "sync" | "disconnect") => Promise<void>;
}) {
	const t = useT();
	const connection = connectionFields(stored);
	const properties = reportProperties(source, websites);
	const saved = properties.includes(connection.property) ? connection.property : "";
	const property = selected ?? (saved || properties[0] || "");
	const ready = connection.state === "ready" && saved === property;
	const official =
		source === "bing"
			? `https://www.bing.com/webmasters/aiperformance?siteUrl=${encodeURIComponent(property)}`
			: `https://search.google.com/search-console/performance/search-analytics/ai?resource_id=${encodeURIComponent(property)}`;
	return (
		<section className="rounded-xl border bg-card p-5 space-y-4">
			<div className="space-y-1">
				<h3 className="font-semibold">{source === "bing" ? "Bing Webmaster Tools" : "Google Search Console"}</h3>
				<p className="text-sm text-muted-foreground">
					{t(source === "bing" ? "AI citations · Pages · Grounding queries" : "AI impressions · Pages · Daily history")}
				</p>
			</div>
			<label className="block text-sm space-y-2">
				{t("Website")}
				<select
					className="h-10 w-full min-w-0 rounded-md border bg-background px-3"
					value={property}
					disabled={!!busy}
					onChange={(e) => onSelect(e.target.value)}
				>
					{properties.map((p) => (
						<option key={p} value={p}>
							{p.startsWith("sc-domain:")
								? `${p.slice(10)} · ${t("Domain property")}`
								: `${p} · ${t("Website property")}`}
						</option>
					))}
				</select>
			</label>
			<p className="text-sm font-medium">{t(statusLabel(ready, connection.state))}</p>
			{connection.error && (
				<p className="text-sm text-destructive" role="alert">
					{t(connection.error)}
				</p>
			)}
			{connection.lastSyncedAt && (
				<p className="text-sm text-muted-foreground">
					{t("Last synchronized")}: {new Date(connection.lastSyncedAt).toLocaleString()}
				</p>
			)}
			{connection.checkedAt && (
				<p className="text-xs text-muted-foreground">
					{t("Access last checked")}: {new Date(connection.checkedAt).toLocaleString()}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={!!busy || !property}
					variant={ready ? "outline" : "default"}
					onClick={() => void run(source, property, "connect")}
				>
					{t(connectLabel(source, busy, ready))}
				</Button>
				<Button disabled={!!busy || !ready} onClick={() => void run(source, property, "sync")}>
					{t(busy === `${source}:sync` ? "Syncing report…" : "Sync now")}
				</Button>
				{connection.state && (
					<Button disabled={!!busy} variant="ghost" onClick={() => void run(source, property, "disconnect")}>
						{t("Disconnect")}
					</Button>
				)}
			</div>
			<a className="text-sm underline block" href={official} target="_blank" rel="noreferrer">
				{t("Open official dashboard / sign in")}
			</a>
			<p className="text-xs text-muted-foreground">
				{t(
					"Reads the official default three-month report. Actual dates and available rows are saved with each snapshot. Sync runs when you click; no background schedule is enabled.",
				)}
			</p>
		</section>
	);
}

function reportProperties(source: AiReportSource, websites: string[]) {
	return source === "bing"
		? websites
		: [...new Set(websites.flatMap((site) => [`sc-domain:${new URL(site).hostname}`, site]))];
}
