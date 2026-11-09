/**
 * Rough per-run cost estimates in USD, by provider, used to stamp
 * usage_events.estimated_cost_usd.
 *
 * These are deliberately coarse placeholders for internal attribution and
 * anomaly spotting — tune them against real provider invoices (that
 * comparison is the point of collecting usage_events, not something these
 * numbers replace). Missing provider → null cost, event still recorded.
 *
 * NOTE: These numbers live in the public repository. They are coarse
 * placeholders for internal attribution — if they ever approach public
 * list prices, move them to config/env so they remain internal.
 */

const PROVIDER_COST_ESTIMATES_USD: Record<string, number> = {
	// Browser collection runs in the user's own account: no API charge.
	"beat-browser": 0,
	// One ungrounded BeatAPI chat completion of typical answer length.
	beatapi: 0.005,
	stub: 0,
};

export function estimateRunCostUsd(provider: string | null): number | null {
	if (!provider) return null;
	return PROVIDER_COST_ESTIMATES_USD[provider] ?? null;
}

/** Days per month used for cost projections — a flat 30, not a calendar month. */
export const PROJECTION_DAYS_PER_MONTH = 30;

/**
 * What one target costs to keep running for a month, at a brand's current
 * prompt count and cadence: every enabled prompt fires the target `runsPerDay`
 * times, each firing making `replication` provider calls.
 *
 * Self-hosted only. It exists to answer "what does adding this platform cost
 * me", so it inherits the coarseness of the per-provider estimates above and
 * should be presented as an estimate.
 */
export function projectMonthlyTargetCostUsd(input: {
	costPerRunUsd: number | null;
	enabledPrompts: number;
	runsPerDay: number;
	replication: number;
}): number | null {
	if (input.costPerRunUsd === null) return null;
	const runs = input.enabledPrompts * input.runsPerDay * input.replication * PROJECTION_DAYS_PER_MONTH;
	return input.costPerRunUsd * runs;
}
