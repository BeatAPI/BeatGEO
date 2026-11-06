import type { GaPerformance } from "@workspace/lib/traffic/ga";
import type { GscAnalysis } from "@workspace/lib/traffic/gsc";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useState } from "react";
import { FormSelect } from "@/components/form-select";
import { useT } from "@/lib/i18n";

export function GscRelationships({ analysis }: { analysis: GscAnalysis }) {
	const t = useT();
	const [period, setPeriod] = useState<"current" | "previous">("current");
	const [dataset, setDataset] = useState<"queryPages" | "daily" | "dailyPages">("queryPages");
	const [offset, setOffset] = useState(0),
		[filter, setFilter] = useState("");
	const window = analysis[period],
		data = window[dataset];
	const rows = data.rows.filter((row) => row.keys?.some((key) => key.toLowerCase().includes(filter.toLowerCase())));
	return (
		<section className="space-y-3 rounded-lg border p-4">
			<h3 className="font-medium">{t("Queries, pages and daily history")}</h3>
			<div className="flex flex-wrap gap-3">
				<FormSelect
					aria-label={t("Comparison period")}
					className="w-full sm:w-auto sm:min-w-44"
					value={period}
					onValueChange={(value) => {
						setPeriod(value);
						setOffset(0);
					}}
					options={[
						{ value: "current", label: t("Current period") },
						{ value: "previous", label: t("Previous period") },
					]}
				/>
				<FormSelect
					aria-label={t("Search evidence view")}
					className="w-full sm:w-auto sm:min-w-44"
					value={dataset}
					onValueChange={(value) => {
						setDataset(value);
						setOffset(0);
					}}
					options={[
						{ value: "queryPages", label: t("Query × page") },
						{ value: "daily", label: t("Daily totals") },
						{ value: "dailyPages", label: t("Date × page") },
					]}
				/>
				<Input
					aria-label={t("Filter search evidence")}
					placeholder={t("Filter search evidence")}
					className="w-full sm:max-w-xs"
					value={filter}
					onChange={(e) => {
						setFilter(e.target.value);
						setOffset(0);
					}}
				/>
			</div>
			<p className="text-xs text-muted-foreground">
				{window.startDate} – {window.endDate} · {analysis.timezone} ·{" "}
				{t("Missing dates or rows are unknown, not zero.")}
			</p>
			{data.limitReached && <p role="status">{t("Row limit reached. This view is incomplete.")}</p>}
			<div className="overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead>
						<tr>
							{[...data.dimensions, "Clicks", "Impressions", "CTR", "Average position"].map((label) => (
								<th key={label} className="p-2">
									{t(label)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.slice(offset, offset + 50).map((row) => (
							<tr key={JSON.stringify(row.keys)} className="border-t">
								{row.keys?.map((key, i) => (
									<td className="p-2 break-all" key={data.dimensions[i]}>
										{key}
									</td>
								))}
								<td className="p-2">{row.clicks}</td>
								<td className="p-2">{row.impressions}</td>
								<td className="p-2">{(row.ctr * 100).toFixed(2)}%</td>
								<td className="p-2">{row.position.toFixed(1)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<Paging offset={offset} total={rows.length} setOffset={setOffset} />
		</section>
	);
}
export function GaPerformancePanel({ data }: { data: GaPerformance }) {
	const t = useT();
	const [period, setPeriod] = useState<"current" | "previous">("current");
	const [preset, setPreset] = useState<"channels" | "organicPages" | "googleOrganicPages">("channels");
	const [offset, setOffset] = useState(0);
	const window = data[period],
		report = window[preset];
	return (
		<section className="space-y-3 rounded-lg border p-4">
			<h3 className="font-medium">{t("Acquisition and organic search")}</h3>
			<div className="flex flex-wrap gap-3">
				<FormSelect
					aria-label={t("Comparison period")}
					className="w-full sm:w-auto sm:min-w-44"
					value={period}
					onValueChange={(value) => {
						setPeriod(value);
						setOffset(0);
					}}
					options={[
						{ value: "current", label: t("Current period") },
						{ value: "previous", label: t("Previous period") },
					]}
				/>
				<FormSelect
					aria-label={t("Acquisition view")}
					className="w-full sm:w-auto sm:min-w-44"
					value={preset}
					onValueChange={(value) => {
						setPreset(value);
						setOffset(0);
					}}
					options={[
						{ value: "channels", label: t("All channels") },
						{ value: "organicPages", label: t("Organic search landing pages") },
						{ value: "googleOrganicPages", label: t("Google organic landing pages") },
					]}
				/>
			</div>
			<p className="text-xs text-muted-foreground">
				{data.site} · {window.startDate} – {window.endDate} · {data.timeZone}
			</p>
			<p className="text-xs text-muted-foreground">
				{t(
					"Key events are counts; session key event rate is supplied by GA. Do not infer conversions for individual search queries.",
				)}
			</p>
			{report.limitReached && <p role="status">{t("Row limit reached. This view is incomplete.")}</p>}
			{report.metadata.some((m) => m.subjectToThresholding || m.dataLossFromOtherRow || m.sampled || m.restricted) && (
				<p role="status">
					{t("Google reports thresholding, sampling or grouped rows. Interpret this view with caution.")}
				</p>
			)}
			<div className="overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead>
						<tr>
							{[...report.dimensions, "Sessions", "Engaged sessions", "Key events", "Session key event rate"].map(
								(label) => (
									<th key={label} className="p-2">
										{t(label)}
									</th>
								),
							)}
						</tr>
					</thead>
					<tbody>
						{report.rows.slice(offset, offset + 50).map((row) => (
							<tr key={JSON.stringify(row.dimensions)} className="border-t">
								{report.dimensions.map((key) => (
									<td key={key} className="p-2 break-all">
										{row.dimensions[key]}
									</td>
								))}
								<td className="p-2">{row.metrics.sessions}</td>
								<td className="p-2">{row.metrics.engagedSessions}</td>
								<td className="p-2">{row.metrics.keyEvents}</td>
								<td className="p-2">{(row.metrics.sessionKeyEventRate * 100).toFixed(2)}%</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<Paging offset={offset} total={report.rows.length} setOffset={setOffset} />
		</section>
	);
}
function Paging({ offset, total, setOffset }: { offset: number; total: number; setOffset: (n: number) => void }) {
	const t = useT();
	return (
		<div className="flex flex-wrap items-center gap-3 text-sm">
			<Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
				{t("Previous page")}
			</Button>
			<span>
				{Math.min(offset + 50, total)} / {total}
			</span>
			<Button variant="outline" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>
				{t("Next page")}
			</Button>
		</div>
	);
}
