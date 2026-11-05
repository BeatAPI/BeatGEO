import type { GscSummary } from "@workspace/lib/traffic/gsc";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { useState } from "react";
import { FormSelect } from "@/components/form-select";
import { gscPropertyLabel } from "@/lib/gsc-property-label";
import { useT } from "@/lib/i18n";
import type { TrafficData } from "@/server/traffic-core";
import { GscRelationships } from "./search-performance";

type Props = {
	settingsOnly?: boolean;
	showConnect?: boolean;
	data: TrafficData;
	properties: Array<{ siteUrl: string }>;
	propertiesLoading: boolean;
	propertiesFailed: boolean;
	busy: boolean;
	onConnect: () => void;
	onSync: (property?: string) => void;
	onDisconnect: () => void;
};
export function GscPanel({
	showConnect = true,
	settingsOnly = false,
	data,
	properties,
	propertiesLoading,
	propertiesFailed,
	busy,
	onConnect,
	onSync,
	onDisconnect,
}: Props) {
	const t = useT();
	const [property, setProperty] = useState("");
	const [filter, setFilter] = useState("");
	const [page, setPage] = useState(0);
	const chosen = property || savedOrDefaultProperty(data, properties);
	const result = data.gsc?.snapshot as GscSummary | null;
	const queries = (result?.queries ?? []).filter((row) =>
		(row.keys?.[0] ?? "").toLowerCase().includes(filter.toLowerCase()),
	);
	const disabled = busy;
	return (
		<Card className="mb-6">
			<CardHeader>
				<CardTitle>{t("Google Search Console")}</CardTitle>
				<p className="text-sm text-muted-foreground">
					{t("Connect your Google Search Console to view your site's search queries.")}
				</p>
			</CardHeader>
			<CardContent className="space-y-4 min-w-0">
				<div className="flex flex-wrap gap-2">
					{showConnect && (
						<Button disabled={disabled || !data.gaReady} onClick={onConnect}>
							{t(data.gsc?.connected ? "Reconnect Search Console" : "Connect Search Console")}
						</Button>
					)}
					{settingsOnly && data.gsc?.connected && (
						<Button variant="outline" disabled={disabled} onClick={onDisconnect}>
							{t("Disconnect")}
						</Button>
					)}
				</div>
				{showConnect && !data.gaReady && (
					<p className="text-sm text-muted-foreground">
						{t("The workspace owner needs to configure Google authorization first.")}
					</p>
				)}
				{settingsOnly && data.gsc?.connected && (
					<div className="space-y-2 max-w-xl">
						<label htmlFor="gsc-property" className="text-sm">
							{t("Search Console property")}
						</label>
						<FormSelect
							id="gsc-property"
							value={chosen}
							disabled={disabled || !properties.length}
							onValueChange={setProperty}
							placeholder={t("Choose a Search Console property")}
							options={propertyOptions(properties, chosen)}
						/>
						<PropertyStatus loading={propertiesLoading} failed={propertiesFailed} count={properties.length} />
						<Button disabled={disabled || !chosen} onClick={() => onSync(chosen)}>
							{t(data.gsc.config?.property ? "Refresh search data" : "Read search data")}
						</Button>
					</div>
				)}
				{!settingsOnly && (
					<SearchSite property={data.gsc?.config?.property?.id} disabled={disabled} onRefresh={() => onSync()} />
				)}
				{!settingsOnly && result && (
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							{result.startDate} – {result.endDate} · {t("Google Search, web results")}
						</p>
						{result.totals && (
							<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
								{[
									[t("Clicks"), result.totals.clicks],
									[t("Impressions"), result.totals.impressions],
									[t("CTR"), `${(result.totals.ctr * 100).toFixed(2)}%`],
									[t("Average position"), result.totals.position.toFixed(1)],
								].map(([label, value]) => (
									<div key={label} className="rounded-lg border p-3">
										<div className="text-xs text-muted-foreground">{label}</div>
										<div className="text-xl">{value}</div>
									</div>
								))}
							</div>
						)}
						{result.analysis && <GscRelationships analysis={result.analysis} />}
						<label htmlFor="gsc-filter" className="text-sm">
							{t("Filter search queries")}
						</label>
						<input
							id="gsc-filter"
							className="h-9 w-full rounded-md border bg-background px-3 text-sm"
							value={filter}
							onChange={(event) => {
								setFilter(event.target.value);
								setPage(0);
							}}
						/>
						<div className="overflow-x-auto">
							<table className="w-full text-left text-sm">
								<thead>
									<tr>
										{["Search query", "Clicks", "Impressions", "CTR", "Average position"].map((name) => (
											<th key={name} className="p-2">
												{t(name)}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{queries.slice(page * 50, (page + 1) * 50).map((row) => (
										<tr className="border-t" key={row.keys?.join("|")}>
											<td className="p-2 break-all">{row.keys?.[0]}</td>
											<td className="p-2">{row.clicks}</td>
											<td className="p-2">{row.impressions}</td>
											<td className="p-2">{(row.ctr * 100).toFixed(2)}%</td>
											<td className="p-2">{row.position.toFixed(1)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div className="flex items-center gap-3 text-sm">
							<Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
								{t("Previous page")}
							</Button>
							<span>
								{queries.length} {t("queries")}
							</span>
							<Button variant="outline" disabled={(page + 1) * 50 >= queries.length} onClick={() => setPage(page + 1)}>
								{t("Next page")}
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							{t(
								"Google may omit queries or return only top rows. Up to 10,000 rows are stored per view; these results are not a complete list of every keyword.",
							)}
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
function defaultProperty(properties: Props["properties"]) {
	return properties.length === 1 ? properties[0].siteUrl : "";
}
function PropertyStatus({ loading, failed, count }: { loading: boolean; failed: boolean; count: number }) {
	const t = useT();
	if (loading) return <p className="text-sm text-muted-foreground">{t("Loading...")}</p>;
	if (failed || count) return null;
	return (
		<p className="text-sm text-muted-foreground">{t("No accessible properties were found in this Google account.")}</p>
	);
}

function propertyOptions(properties: Props["properties"], chosen: string) {
	const all = [...properties];
	if (chosen && !all.some((item) => item.siteUrl === chosen)) all.push({ siteUrl: chosen });
	return all.map((item) => ({ value: item.siteUrl, label: gscPropertyLabel(item.siteUrl) }));
}

function savedOrDefaultProperty(data: TrafficData, properties: Props["properties"]) {
	return data.gsc?.config?.property?.id || defaultProperty(properties);
}

function SearchSite({
	property,
	disabled,
	onRefresh,
}: {
	property?: string;
	disabled: boolean;
	onRefresh: () => void;
}) {
	const t = useT();
	if (!property)
		return (
			<p className="text-sm text-muted-foreground">
				{t("Choose your Search Console site in Brand to see search performance here.")}
			</p>
		);
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
			<span className="text-sm">{gscPropertyLabel(property)}</span>
			<Button variant="outline" disabled={disabled} onClick={onRefresh}>
				{t("Refresh search data")}
			</Button>
		</div>
	);
}
