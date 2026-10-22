import { CITATION_CATEGORIES, type CitationCategory } from "@workspace/lib/citations/domain-categories";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { daysInRange, type LookbackPeriod, parseCustomLookback } from "@/lib/lookback";
import type { PerPromptDailyCitationStats, PerPromptVisibilityPoint } from "@/lib/postgres-read";

/** Charts key a series by id and label it by name; nothing else about a brand is read. */
export interface ChartSubject {
	id: string;
	name: string;
}

/** Use a stable one-month default while history loads, then shorten it for brands with less than a week of data. */
export function getDefaultLookbackPeriod(earliestDataDate: string | null | undefined): LookbackPeriod {
	if (!earliestDataDate) {
		return "1m";
	}

	const earliestDate = new Date(earliestDataDate);
	const now = new Date();
	const diffInMs = now.getTime() - earliestDate.getTime();
	const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

	return diffInDays > 7 ? "1m" : "1w";
}

export function getDaysFromLookback(lookback: LookbackPeriod): number {
	const custom = parseCustomLookback(lookback);
	if (custom?.from) return daysInRange({ from: custom.from, to: getLookbackEndDate(lookback) });
	switch (lookback) {
		case "1w":
			return 7;
		case "1m":
			return 30;
		case "3m":
			return 90;
		case "6m":
			return 180;
		case "1y":
			return 365;
		default:
			// Bound the nominally unbounded "all" (and open-start ranges) so chart queries remain predictable.
			return 365 * 2;
	}
}

/** Last calendar day a lookback covers (YYYY-MM-DD): a custom range's end,
 *  otherwise today in `timezone`. */
export function getLookbackEndDate(
	lookback: LookbackPeriod,
	timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
	return parseCustomLookback(lookback)?.to ?? new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

/** The `days`-long window ending on `getLookbackEndDate`, as midnight-UTC dates
 *  (the convention `generateDateRange` and the chart date keys share). */
function lookbackChartWindow(lookback: LookbackPeriod, timezone: string): { startDate: Date; endDate: Date } {
	const endDate = new Date(getLookbackEndDate(lookback, timezone));
	const startDate = new Date(endDate);
	startDate.setDate(startDate.getDate() - (getDaysFromLookback(lookback) - 1));
	return { startDate, endDate };
}

export function generateDateRange(startDate: Date, endDate: Date): string[] {
	const dates: string[] = [];
	const current = new Date(startDate);

	while (current <= endDate) {
		dates.push(current.toISOString().split("T")[0]);
		current.setDate(current.getDate() + 1);
	}

	return dates;
}

/**
 * Citation comparison window for a lookback of `days` days — computed entirely in
 * UTC so it's independent of server timezone. The current window is `days` calendar
 * days ending on `today` (inclusive): [today-(days-1), today]. The previous window
 * is the contiguous equal-length window ending the day before the current one
 * starts. `dateRange` is the current window as one YYYY-MM-DD per day (what the
 * trend charts iterate) so totals and charts cover exactly the same span.
 */
export function citationDateWindow(
	today: Date,
	days: number,
): { fromDateStr: string; toDateStr: string; prevFromDateStr: string; prevToDateStr: string; dateRange: string[] } {
	const iso = (d: Date) => d.toISOString().split("T")[0];
	const shift = (base: Date, deltaDays: number) => {
		const d = new Date(base);
		d.setUTCDate(d.getUTCDate() + deltaDays);
		return d;
	};
	const span = Math.max(1, days);
	const from = shift(today, -(span - 1));
	const prevTo = shift(from, -1);
	const prevFrom = shift(prevTo, -(span - 1));
	const dateRange: string[] = [];
	for (let i = 0; i < span; i++) dateRange.push(iso(shift(from, i)));
	return {
		fromDateStr: iso(from),
		toDateStr: iso(today),
		prevFromDateStr: iso(prevFrom),
		prevToDateStr: iso(prevTo),
		dateRange,
	};
}

export interface DailyVisibilityBucket {
	branded: { total: number; mentioned: number };
	nonBranded: { total: number; mentioned: number };
}

/**
 * Walk each prompt's series across `dateRange`, carrying its last observation
 * forward over the days it didn't run. Pre-seeded with the prompt's earliest
 * observation so days before its first run still contribute — otherwise a
 * staggered schedule reads as a ramp-up rather than steady coverage.
 *
 * Seeding stops at `observedFrom`, the brand's first observed day (by default
 * the earliest day in `byPrompt`): before any collection there is nothing to
 * smooth, and back-filling it would draw weeks of answers that were never seen.
 */
function carryForward<V>(
	byPrompt: Map<string, Map<string, V>>,
	dateRange: string[],
	visit: (promptId: string, date: string, carried: V, actual: V | undefined) => void,
	observedFrom?: string,
): void {
	const start = observedFrom ?? firstObservedDate(byPrompt);
	for (const [promptId, byDate] of byPrompt) {
		const earliest = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))[0]?.[1];
		let carried = earliest;
		for (const date of dateRange) {
			if (start && date < start) continue;
			const actual = byDate.get(date);
			if (actual !== undefined) carried = actual;
			if (carried === undefined) continue;
			visit(promptId, date, carried, actual);
		}
	}
}

/** Earliest observed day across every prompt, or undefined when nothing was observed. */
export function firstObservedDate(byPrompt: Map<string, Map<string, unknown>>): string | undefined {
	let first: string | undefined;
	for (const byDate of byPrompt.values()) {
		for (const date of byDate.keys()) if (first === undefined || date < first) first = date;
	}
	return first;
}

/**
 * Per-prompt Last Value Carried Forward (LVCF) for visibility data.
 *
 * For each prompt, carries forward its last known (total_runs, brand_mentioned_count)
 * to fill gap days when it didn't run. Then aggregates across all prompts per day,
 * split by branded/non-branded status.
 *
 * This eliminates periodic artifacts caused by staggered prompt schedules:
 * every prompt contributes to every day's aggregate via its last observation.
 */
export function applyPerPromptLVCF(
	perPromptData: PerPromptVisibilityPoint[],
	dateRange: string[],
	brandedPromptIds: string[],
	observedFrom?: string,
): {
	dailyVisibilityMap: Map<string, DailyVisibilityBucket>;
	totalBrandedRuns: number;
	totalBrandedMentioned: number;
	totalNonBrandedRuns: number;
	totalNonBrandedMentioned: number;
} {
	const brandedSet = new Set(brandedPromptIds);

	const byPrompt = new Map<string, Map<string, { total: number; mentioned: number }>>();
	for (const row of perPromptData) {
		const byDate = byPrompt.get(row.prompt_id) ?? new Map<string, { total: number; mentioned: number }>();
		byDate.set(String(row.date), { total: Number(row.total_runs), mentioned: Number(row.brand_mentioned_count) });
		byPrompt.set(row.prompt_id, byDate);
	}

	const dailyVisibilityMap = new Map<string, DailyVisibilityBucket>();
	const observed = {
		branded: { runs: 0, mentioned: 0 },
		nonBranded: { runs: 0, mentioned: 0 },
	};

	carryForward(
		byPrompt,
		dateRange,
		(promptId, date, carried, actual) => {
			const isBranded = brandedSet.has(promptId);
			const bucket = dailyVisibilityMap.get(date) ?? {
				branded: { total: 0, mentioned: 0 },
				nonBranded: { total: 0, mentioned: 0 },
			};
			dailyVisibilityMap.set(date, bucket);

			const day = isBranded ? bucket.branded : bucket.nonBranded;
			day.total += carried.total;
			day.mentioned += carried.mentioned;

			// Period totals measure observations, not the synthetic daily series.
			if (!actual) return;
			const period = isBranded ? observed.branded : observed.nonBranded;
			period.runs += actual.total;
			period.mentioned += actual.mentioned;
		},
		observedFrom,
	);

	return {
		dailyVisibilityMap,
		totalBrandedRuns: observed.branded.runs,
		totalBrandedMentioned: observed.branded.mentioned,
		totalNonBrandedRuns: observed.nonBranded.runs,
		totalNonBrandedMentioned: observed.nonBranded.mentioned,
	};
}

export type CitationCategories = Record<CitationCategory, number>;

/**
 * Generalized per-prompt LVCF with cadence normalization over arbitrary string
 * keys (citation category, page type, …). For each prompt, carries forward its
 * last known per-key counts, normalized by the brand's cadence so daily totals
 * reflect a steady rate rather than spiking on run days. Pre-seeds each prompt
 * with its earliest observation to avoid ramp-up artifacts.
 */
export function applyPerPromptKeyedLVCF<K extends string>(
	rows: { prompt_id: string; date: string | Date; key: K; count: number }[],
	dateRange: string[],
	cadenceHours: number | null | undefined,
	allKeys: readonly K[],
	observedFrom?: string,
): Map<string, Record<K, number>> {
	const cadenceDays = Math.max(1, Math.ceil((cadenceHours ?? getDefaultDelayHours()) / 24));
	const empty = (): Record<K, number> => Object.fromEntries(allKeys.map((k) => [k, 0])) as Record<K, number>;

	const byPrompt = new Map<string, Map<string, Record<K, number>>>();
	for (const row of rows) {
		const byDate = byPrompt.get(row.prompt_id) ?? new Map<string, Record<K, number>>();
		const date = String(row.date);
		const counts = byDate.get(date) ?? empty();
		counts[row.key] += Number(row.count);
		byDate.set(date, counts);
		byPrompt.set(row.prompt_id, byDate);
	}

	const daily = new Map<string, Record<K, number>>();
	carryForward(
		byPrompt,
		dateRange,
		(_promptId, date, carried) => {
			const day = daily.get(date) ?? empty();
			for (const key of allKeys) day[key] += carried[key] / cadenceDays;
			daily.set(date, day);
		},
		observedFrom,
	);

	// Values are intentionally left fractional: both consumers
	// convert to percentages via toRoundedPercentages, where the 1/cadenceDays factor
	// cancels exactly — so cadence can't shift the chart, and a tiny category isn't
	// rounded to zero before the percentage is taken.
	return daily;
}

/** Dashboard wrapper that converts citation domains to category keys before smoothing. */
export function applyPerPromptCitationLVCF(
	perPromptData: PerPromptDailyCitationStats[],
	dateRange: string[],
	cadenceHours: number | null | undefined,
	categorizeDomain: (domain: string) => CitationCategory,
	observedFrom?: string,
): Map<string, CitationCategories> {
	return applyPerPromptKeyedLVCF(
		perPromptData.map((r) => ({
			prompt_id: r.prompt_id,
			date: r.date,
			key: categorizeDomain(r.domain),
			count: Number(r.count),
		})),
		dateRange,
		cadenceHours,
		CITATION_CATEGORIES,
		observedFrom,
	);
}

export interface ChartDataPoint {
	date: string;
	[key: string]: number | string | boolean | null;
}

/**
 * Below this many answers a visibility percentage is an early read, not a score:
 * one or two samples swing between 0% and 100%, so it is shown without the
 * red/amber/green verdict until then.
 */
export const EARLY_SIGNAL_RUNS = 10;

export function isEarlySignal(runs: number): boolean {
	return runs < EARLY_SIGNAL_RUNS;
}

export function visibilityBadgeProps(
	value: number,
	runs?: number,
): {
	variant: "default" | "secondary" | "destructive" | "outline";
	className: string;
} {
	if (runs !== undefined && isEarlySignal(runs)) return { variant: "outline", className: "text-foreground" };
	if (value > 75) return { variant: "default", className: "bg-emerald-600 hover:bg-emerald-600 text-white" };
	if (value > 45) return { variant: "secondary", className: "bg-amber-500 hover:bg-amber-500 text-white" };
	return { variant: "destructive", className: "bg-rose-500 hover:bg-rose-500 text-white" };
}

export function latestObservedPoint(chartData: ChartDataPoint[], ids: string[]): ChartDataPoint | undefined {
	return chartData.filter((point) => ids.some((id) => point[id] !== null && point[id] !== undefined)).pop();
}

export function latestVisibility(chartData: ChartDataPoint[], id: string): number | null {
	const point = latestObservedPoint(chartData, [id]);
	return point ? (point[id] as number) : null;
}

import type { Competitor, PromptRun } from "@workspace/lib/db/schema";

export function calculateVisibilityPercentages(
	promptRuns: PromptRun[],
	brand: ChartSubject,
	competitors: Competitor[],
	lookback: LookbackPeriod,
	userTimezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): ChartDataPoint[] {
	let startDate: Date;
	let endDate: Date;
	const custom = parseCustomLookback(lookback);
	// An open-start range spans the runs themselves, the way "all" does.
	const spansRuns = lookback === "all" || (custom !== null && custom.from === null);

	if (spansRuns && promptRuns.length > 0) {
		const sortedRuns = [...promptRuns].sort(
			(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);
		const firstRun = sortedRuns[0];
		const lastRun = sortedRuns[sortedRuns.length - 1];

		startDate = new Date(firstRun.createdAt);
		endDate = new Date(lastRun.createdAt);

		// Use local-day bounds so late UTC runs do not spill into the wrong day.
		const startDateString = startDate.toLocaleDateString("en-CA", { timeZone: userTimezone });
		const endDateString = endDate.toLocaleDateString("en-CA", { timeZone: userTimezone });
		startDate = new Date(startDateString);
		endDate = new Date(custom?.to ?? endDateString);
	} else {
		// Today is resolved in the viewer's timezone: UTC may already be on tomorrow.
		({ startDate, endDate } = lookbackChartWindow(lookback, userTimezone));
	}

	const dateRange = generateDateRange(startDate, endDate);

	// Alphabetical order keeps colors stable when mention ranks change.
	const sortedCompetitors = [...competitors].sort((a, b) => a.name.localeCompare(b.name));

	const runsByDate = promptRuns.reduce(
		(acc, run) => {
			const runDate = new Date(run.createdAt);
			const dateKey = runDate.toLocaleDateString("en-CA", { timeZone: userTimezone });

			if (!acc[dateKey]) {
				acc[dateKey] = [];
			}
			acc[dateKey].push(run);
			return acc;
		},
		{} as Record<string, PromptRun[]>,
	);

	return dateRange.map((date) => {
		const runsForDate = runsByDate[date] || [];
		const totalRuns = runsForDate.length;

		const dataPoint: ChartDataPoint = { date };

		if (totalRuns === 0) {
			dataPoint[brand.id] = null;
			sortedCompetitors.forEach((competitor) => {
				dataPoint[competitor.id] = null;
			});
			return dataPoint;
		}

		const brandMentions = runsForDate.filter((run) => run.brandMentioned).length;
		const brandVisibility = Math.round((brandMentions / totalRuns) * 100);
		dataPoint[brand.id] = brandVisibility;

		sortedCompetitors.forEach((competitor) => {
			const competitorMentions = runsForDate.filter(
				(run) => run.competitorsMentioned && run.competitorsMentioned.includes(competitor.name),
			).length;
			const competitorVisibility = Math.round((competitorMentions / totalRuns) * 100);
			dataPoint[competitor.id] = competitorVisibility;
		});

		return dataPoint;
	});
}
function calculateAverageVisibility(data: ChartDataPoint[], competitorId: string): number {
	const validValues = data
		.map((point) => point[competitorId] as number | null)
		.filter((value) => value !== null && value !== undefined) as number[];

	if (validValues.length === 0) return 0;
	return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

export function selectCompetitorsToDisplay(
	competitors: Competitor[],
	data: ChartDataPoint[],
	maxCompetitors: number = 3,
): Competitor[] {
	const competitorsWithAvgVisibility = competitors.map((competitor) => ({
		competitor,
		avgVisibility: calculateAverageVisibility(data, competitor.id),
	}));

	const sortedByVisibility = competitorsWithAvgVisibility.sort((a, b) => b.avgVisibility - a.avgVisibility);

	const topCompetitors = sortedByVisibility.slice(0, maxCompetitors).map((item) => item.competitor);

	if (topCompetitors.length < maxCompetitors) {
		const selectedIds = new Set(topCompetitors.map((c) => c.id));
		const remaining = competitors
			.filter((c) => !selectedIds.has(c.id))
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, maxCompetitors - topCompetitors.length);

		topCompetitors.push(...remaining);
	}

	return topCompetitors;
}

export function filterAndCompleteChartData(chartData: ChartDataPoint[], lookback: LookbackPeriod): ChartDataPoint[] {
	if (lookback === "all") {
		return chartData;
	}
	const custom = parseCustomLookback(lookback);
	if (custom?.to && !custom.from) {
		const to = custom.to;
		return chartData.filter((item) => item.date <= to);
	}

	const { startDate, endDate: referenceDate } = lookbackChartWindow(
		lookback,
		Intl.DateTimeFormat().resolvedOptions().timeZone,
	);

	const dateRange = generateDateRange(startDate, referenceDate);

	const filteredData = chartData.filter((item) => {
		const date = new Date(item.date);
		return date >= startDate && date <= referenceDate;
	});

	return dateRange.map((date) => {
		const existingData = filteredData.find((item) => item.date === date);
		return (
			existingData || {
				date,
			}
		);
	});
}

/**
 * Extends each line forward from its last observation to the end of the time
 * frame, so a series that hasn't been collected yet for recent dates doesn't
 * stop short. Lines are never extended backward: a dashed line before the
 * first observation would show weeks of results that were never collected.
 *
 * Extended points are marked with `_extended_{key}: true` so the chart can:
 * - Skip rendering dots for extended points
 * - Skip showing extended values in tooltips
 */
export function extendLinesToChartEdges(chartData: ChartDataPoint[], dataKeys: string[]): ChartDataPoint[] {
	if (chartData.length === 0) return chartData;

	// Extension flags belong to the rendered copy, not the query cache.
	const extendedData = chartData.map((point) => ({ ...point }));

	for (const key of dataKeys) {
		let lastIndex = -1;
		extendedData.forEach((point, index) => {
			if (point[key] !== null && point[key] !== undefined) lastIndex = index;
		});
		if (lastIndex < 0) continue;
		const lastValue = extendedData[lastIndex][key];

		for (let i = lastIndex + 1; i < extendedData.length; i++) {
			extendedData[i][key] = lastValue;
			extendedData[i][`_extended_${key}`] = true;
		}
	}

	return extendedData;
}

export function isExtendedDataPoint(dataPoint: ChartDataPoint, key: string): boolean {
	return dataPoint[`_extended_${key}`] === true;
}
