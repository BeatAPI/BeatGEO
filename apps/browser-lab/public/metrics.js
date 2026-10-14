/** BeatGeo metrics v1. Each completed answer is one observation, never one retry. */
export function deduplicateObservations(runs) {
	const unique = new Map();
	for (const [index, run] of runs.entries()) unique.set(run.id || `unidentified-${index}`, run);
	return [...unique.values()];
}

export function summarize(runs) {
	const observations = deduplicateObservations(runs);
	const statusCounts = {};
	for (const run of observations) statusCounts[run.status] = (statusCounts[run.status] || 0) + 1;
	const completed = observations.filter((run) => run.status === "completed");
	const scored = completed.filter((run) => typeof run.brandMentioned === "boolean");
	const mentions = scored.filter((run) => run.brandMentioned).length;
	return {
		total: observations.length,
		completed: completed.length,
		scored: scored.length,
		failed: ["timeout", "needs_attention", "failed"].reduce((sum, status) => sum + (statusCounts[status] || 0), 0),
		timeout: statusCounts.timeout || 0,
		statusCounts,
		mentions,
		mentionRate: scored.length ? mentions / scored.length : null,
		completionRate: observations.length ? completed.length / observations.length : null,
		metric: "literal-brand-mention-rate-over-completed-runs",
		metricVersion: "beatgeo-v1",
	};
}

/** Same ratio as the inherited computeShareOfVoice; inputs are deduplicated answer-level mentions. */
export function shareOfVoice(brandMentions, competitorMentions) {
	const total = brandMentions + competitorMentions.reduce((sum, count) => sum + count, 0);
	return total ? brandMentions / total : null;
}
