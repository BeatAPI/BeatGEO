import type { CrawlSummary } from "@workspace/lib/traffic/crawls";
import type { GaSummary } from "@workspace/lib/traffic/ga";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useLocale, useT } from "@/lib/i18n";
import type { TrafficData } from "@/server/traffic-core";

type Props = {
	data: TrafficData;
	properties: Array<{ id: string; name: string }>;
	busy: boolean;
	error: string;
	onConnect: () => void;
	onSync: (propertyId?: string) => void;
	onDisconnect: () => void;
	onImport: (file: File, format: "auto" | "combined" | "json" | "jsonl") => void;
};
const selectClass = "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
export function TrafficPanel({ data, properties, busy, error, onConnect, onSync, onDisconnect, onImport }: Props) {
	const t = useT();
	const [file, setFile] = useState<File | null>(null);
	const [format, setFormat] = useState<"auto" | "combined" | "json" | "jsonl">("auto");
	const crawls = data.crawls?.snapshot as CrawlSummary | null;
	return (
		<div className="space-y-6 min-w-0">
			<PageHeader
				title={t("AI Traffic & Crawls")}
				subtitle={t(
					"See visits from AI assistants and crawler requests. These are separate from answer mentions and citations.",
				)}
			/>
			{error && (
				<p
					role="alert"
					className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
				>
					{t(error)}
				</p>
			)}
			<GaConnection
				data={data}
				properties={properties}
				busy={busy}
				onConnect={onConnect}
				onSync={onSync}
				onDisconnect={onDisconnect}
			/>
			<Card>
				<CardHeader>
					<CardTitle>{t("AI crawl observations")}</CardTitle>
					<p className="text-sm text-muted-foreground">
						{t("Import this site's server or CDN access log to see declared AI crawler activity.")}
					</p>
				</CardHeader>
				<CardContent className="space-y-5 min-w-0">
					<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] items-end">
						<div className="space-y-2 min-w-0">
							<Label htmlFor="crawl-file">{t("Access log · up to 10 MiB")}</Label>
							<Input
								id="crawl-file"
								type="file"
								disabled={busy || data.readOnly}
								onChange={(e) => setFile(e.target.files?.[0] ?? null)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="crawl-format">{t("Log format")}</Label>
							<select
								id="crawl-format"
								className={selectClass}
								value={format}
								onChange={(e) => setFormat(e.target.value as typeof format)}
								disabled={busy || data.readOnly}
							>
								<option value="auto">{t("Auto")}</option>
								<option value="combined">Combined</option>
								<option value="json">JSON</option>
								<option value="jsonl">JSONL</option>
							</select>
						</div>
						<Button
							variant="outline"
							disabled={busy || data.readOnly || !file}
							onClick={() => file && onImport(file, format)}
						>
							{t("Import log")}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						{t(
							"Use a single-site log for {site}. Combined, JSON and JSONL are supported; CDN-specific fields may need conversion. Each import replaces the previous snapshot.",
							{ site: data.site },
						)}
					</p>
					{crawls ? (
						<CrawlResults value={crawls} />
					) : (
						<p className="text-sm text-muted-foreground">
							{t("No log imported. This does not mean no AI crawler has visited.")}
						</p>
					)}
				</CardContent>
			</Card>
			<p className="text-xs text-muted-foreground">
				{t(
					"Refresh is manual. GA attribution does not prove an answer cited you, and a crawler request does not prove indexing or training.",
				)}
			</p>
			{busy && (
				<p role="status" className="text-sm text-muted-foreground">
					{t("Working...")}
				</p>
			)}
		</div>
	);
}
function defaultProperty(properties: Props["properties"]) {
	return properties.length === 1 ? properties[0]?.id : "";
}
function GaConnection({
	data,
	properties,
	busy,
	onConnect,
	onSync,
	onDisconnect,
}: Pick<Props, "data" | "properties" | "busy" | "onConnect" | "onSync" | "onDisconnect">) {
	const t = useT();
	const disabled = busy || data.readOnly;
	const [propertyId, setPropertyId] = useState("");
	const chosen = propertyId || defaultProperty(properties);
	const ga = data.ga?.snapshot as GaSummary | null;
	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("AI referral traffic")}</CardTitle>
				<p className="text-sm text-muted-foreground">
					{t("Use your existing Google Analytics. No extra tracking script.")}
				</p>
			</CardHeader>
			<CardContent className="space-y-5 min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<Button onClick={onConnect} disabled={disabled || !data.gaReady}>
						{t(data.ga?.connected ? "Reconnect Google Analytics" : "Connect Google Analytics")}
					</Button>
					{data.ga?.connected && (
						<Button variant="outline" onClick={onDisconnect} disabled={disabled}>
							{t("Disconnect")}
						</Button>
					)}
					{!data.gaReady && (
						<p className="text-sm text-muted-foreground">
							{t("The workspace owner needs to configure the Google Analytics connection first.")}
						</p>
					)}
				</div>
				{data.ga?.connected && !data.ga.config?.property && (
					<div className="max-w-xl space-y-3">
						<Label htmlFor="ga-property">{t("GA property")}</Label>
						<select
							id="ga-property"
							className={selectClass}
							value={chosen ?? ""}
							onChange={(e) => setPropertyId(e.target.value)}
							disabled={disabled || !properties.length}
						>
							{!chosen && <option value="">{t("Choose a GA property")}</option>}
							{properties.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name} · {p.id}
								</option>
							))}
						</select>
						<p className="text-xs text-muted-foreground">
							{t("Reads only this brand hostname: {site}", { site: data.site })}
						</p>
						<Button disabled={disabled || !chosen} onClick={() => onSync(chosen)}>
							{t(busy ? "Reading data..." : "Read GA data")}
						</Button>
					</div>
				)}
				{data.ga?.config?.property && (
					<div className="flex flex-wrap items-center gap-3 text-sm">
						<span className="break-all text-muted-foreground">
							{data.ga.config.property.name} · {data.ga.config.site}
						</span>
						<Button variant="outline" disabled={disabled} onClick={() => onSync()}>
							{t(busy ? "Reading data..." : "Refresh GA data")}
						</Button>
					</div>
				)}
				{ga ? (
					<GaResults value={ga} />
				) : (
					<p className="text-sm text-muted-foreground">
						{t(
							"Connect GA to see AI-attributed sessions, engagement and landing pages. A website URL alone cannot provide private traffic data.",
						)}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
function Metrics({ items }: { items: Array<[string, string | number]> }) {
	return (
		<dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{items.map(([label, value]) => (
				<div key={label} className="rounded-lg border p-4 min-w-0">
					<dt className="text-xs text-muted-foreground">{label}</dt>
					<dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
				</div>
			))}
		</dl>
	);
}
function EvidenceTable({ head, rows }: { head: string[]; rows: Array<Array<string | number | null>> }) {
	const t = useT();
	return (
		<section
			aria-label={head.join(" / ")}
			className="min-w-0 overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring"
		>
			<table className="w-full text-left text-sm">
				<thead className="bg-muted/30">
					<tr>
						{head.map((h) => (
							<th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.slice(0, 100).map((row) => (
						<tr key={JSON.stringify(row)} className="border-t">
							{row.map((cell, j) => (
								<td key={`${head[j]}`} className="px-3 py-2 max-w-xs break-words">
									{cell ?? "—"}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			{rows.length > 100 && (
				<p className="p-3 text-xs text-muted-foreground">
					{t("Showing the first 100 rows of {count}.", { count: rows.length })}
				</p>
			)}
		</section>
	);
}
function qualityLabel(warning: string) {
	const kind = warning.split(":").at(-1) ?? "";
	return (
		(
			{
				thresholded: "Privacy thresholds",
				otherRow: "High-cardinality grouping",
				sampled: "Sampled data",
				truncated: "Truncated data",
				restricted: "Restricted metrics",
				emptyReason: "GA returned no data",
				"timezone-unknown": "Unknown timezone",
				"unclassified-rows": "Unclassified sources",
			} as Record<string, string>
		)[kind] ?? "GA data restriction"
	);
}
function GaResults({ value: g }: { value: GaSummary }) {
	const t = useT();
	const { locale } = useLocale();
	const n = (v: number) => new Intl.NumberFormat(locale).format(v);
	return (
		<div className="space-y-4 min-w-0">
			{g.synthetic && (
				<p className="text-sm text-amber-700 dark:text-amber-400">
					{t("Synthetic demonstration data, not real site traffic.")}
				</p>
			)}
			<p className="text-xs text-muted-foreground">
				{g.dates.startDate} — {g.dates.endDate} · {g.timeZone} · {t("Read at")}:{" "}
				{g.fetchedAt ? new Date(g.fetchedAt).toLocaleString(locale) : "—"}
			</p>
			<Metrics
				items={[
					[t("AI-attributed sessions"), n(g.totals.sessions)],
					[t("Engaged sessions"), n(g.totals.engagedSessions)],
					[t("Configured key events"), n(g.totals.keyEvents)],
					[t("Platform groups"), g.platforms.length],
				]}
			/>
			{!!g.warnings.length && (
				<p role="status" className="rounded-md bg-muted p-3 text-sm">
					{t("GA reports data limits. Counts may be incomplete.")}{" "}
					{g.warnings.map((w) => t(qualityLabel(w))).join(" · ")}
				</p>
			)}
			{!g.sources.length && (
				<p className="text-sm text-muted-foreground">
					{t("No AI-attributed rows were returned for this hostname and period. This does not prove zero AI traffic.")}
				</p>
			)}
			<EvidenceTable
				head={[t("Platform"), t("Sessions"), t("Engaged sessions"), t("Key events")]}
				rows={g.platforms.map((r) => [t(r.platform), n(r.sessions), n(r.engagedSessions), n(r.keyEvents)])}
			/>
			<details className="space-y-3">
				<summary className="cursor-pointer text-sm font-medium">{t("Landing pages and source evidence")}</summary>
				<EvidenceTable
					head={[t("Landing page"), t("Source / medium"), t("Default channel"), t("Sessions")]}
					rows={g.pages.map((r) => [r.path ?? "—", `${r.source} / ${r.medium}`, r.channel, n(r.sessions)])}
				/>
				<EvidenceTable
					head={[t("Source / medium"), t("Default channel"), t("Classification"), t("Sessions")]}
					rows={g.sources.map((r) => [
						`${r.source} / ${r.medium}`,
						r.channel,
						`${t(r.platform)} · ${t(r.basis)}`,
						n(r.sessions),
					])}
				/>
			</details>
			<p className="text-xs text-muted-foreground">
				{t(
					"Sessions are not unique visitors. Key events depend on your GA configuration and are not verified purchases. Source and landing-page counts are separate views, not totals to add together.",
				)}
			</p>
		</div>
	);
}
function utcTime(value: string | null) {
	return value ? value.replace("T", " ").replace(/(?:\.\d+)?Z$/, "") : "—";
}
function CrawlResults({ value: c }: { value: CrawlSummary }) {
	const t = useT();
	const measured = (n: number) => (c.input.inWindow ? n : "—");
	return (
		<div className="space-y-4 min-w-0">
			{c.synthetic && (
				<p className="text-sm text-amber-700 dark:text-amber-400">
					{t("Synthetic demonstration data, not real site traffic.")}
				</p>
			)}
			<p className="text-xs text-muted-foreground">
				{c.site} · {t("Observed records · UTC")}: {utcTime(c.observation.observedFrom)} →{" "}
				{utcTime(c.observation.observedTo)}
			</p>
			<Metrics
				items={[
					[t("Declared crawler requests"), measured(c.totals.requests)],
					[t("Crawler identities"), measured(c.totals.identities)],
					[t("Requested paths"), measured(c.totals.pages)],
					[t("Rejected rows"), c.input.rejected],
				]}
			/>
			<p className="text-xs text-muted-foreground">
				{t(
					"Identity is based on User-Agent declarations and is unverified. Log coverage is unknown. IPs, full User-Agents, referrers and query strings are not stored.",
				)}
			</p>
			{!c.input.inWindow && (
				<p className="text-sm text-muted-foreground">
					{t("No valid records for this site were found in this import.")}
				</p>
			)}
			{!!c.observation.configuredHostRequests && (
				<p className="text-xs text-muted-foreground">
					{t("Some rows have no hostname and are attributed to the configured site. Use a single-site log.")}
				</p>
			)}
			<EvidenceTable
				head={[t("Crawler"), t("Purpose"), t("Requests"), t("Last seen · UTC")]}
				rows={c.crawlers.map((r) => [r.name, t(r.purpose), r.requests, utcTime(r.lastSeen)])}
			/>
			<details className="space-y-3">
				<summary className="cursor-pointer text-sm font-medium">{t("Requested pages and import details")}</summary>
				<EvidenceTable
					head={[t("Path"), t("Crawler"), t("Requests"), t("HTTP responses")]}
					rows={c.pages.map((r) => [
						r.path,
						r.name,
						r.requests,
						Object.entries(r.statuses)
							.map(([s, n]) => `${s} × ${n}`)
							.join(" · "),
					])}
				/>
				<p className="text-xs text-muted-foreground">
					{t("Up to 200 request evidence rows and the first 30 rejected-row codes are retained.")}
				</p>
				<EvidenceTable
					head={[t("Line"), t("Path"), t("HTTP response")]}
					rows={c.requests.map((r) => [r.line, r.path, `${r.method} ${r.status}`])}
				/>
				{!!c.input.errors.length && (
					<p className="text-xs text-muted-foreground">
						{c.input.errors.map((r) => `${r.line}: ${r.code}`).join(" · ")}
					</p>
				)}
			</details>
		</div>
	);
}
