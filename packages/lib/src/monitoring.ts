export const PROMPT_JOB_OPTIONS = { retryLimit: 0, expireInSeconds: 90 * 60 } as const;

export const COLLECTION_FAILURES = [
	"timeout",
	"blocked",
	"needs_login",
	"runner_busy",
	"runner_offline",
	"empty_answer",
	"needs_attention",
	"page_busy",
	"failed",
] as const;
export type CollectionFailure = (typeof COLLECTION_FAILURES)[number];

export class CollectionError extends Error {
	constructor(public readonly code: CollectionFailure) {
		super(`Collection did not complete (${code}); no visibility observation was recorded.`);
	}
}

export function collectionFailure(error: unknown): CollectionFailure {
	if (error instanceof CollectionError) return error.code;
	if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return "timeout";
	return "failed";
}

export interface Observation {
	runId: string;
	promptId: string;
	promptValue: string;
	targetKey: string;
	definitionKey: string;
	brandMentioned: boolean;
	citationCount: number;
	createdAt: string;
}

export function cohortKey(row: Observation): string {
	return JSON.stringify([row.promptId, row.promptValue, row.targetKey, row.definitionKey]);
}

export function latestObservations(rows: Observation[]): Observation[] {
	const latest = new Map<string, Observation>();
	for (const row of rows) {
		const key = cohortKey(row);
		const previous = latest.get(key);
		if (!previous || Date.parse(row.createdAt) > Date.parse(previous.createdAt)) latest.set(key, row);
	}
	return [...latest.values()];
}

/** Compare only identical questions, model versions and brand definitions. Missing is never zero. */
export function compareObservations(baseline: Observation[], later: Observation[], appliedAt: string) {
	const baselineRows = latestObservations(baseline);
	const after = new Map(
		latestObservations(later.filter((r) => Date.parse(r.createdAt) > Date.parse(appliedAt))).map((r) => [
			cohortKey(r),
			r,
		]),
	);
	const pairs = baselineRows.flatMap((before) => {
		const result = after.get(cohortKey(before));
		return result ? [{ before, after: result }] : [];
	});
	const beforeRate = pairs.length ? (pairs.filter((p) => p.before.brandMentioned).length / pairs.length) * 100 : null;
	const afterRate = pairs.length ? (pairs.filter((p) => p.after.brandMentioned).length / pairs.length) * 100 : null;
	return {
		expected: baselineRows.length,
		matched: pairs.length,
		missing: baselineRows.length - pairs.length,
		beforeRate,
		afterRate,
		deltaPoints: beforeRate === null || afterRate === null ? null : afterRate - beforeRate,
		pairs,
	};
}
