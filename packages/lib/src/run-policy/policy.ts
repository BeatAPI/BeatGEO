/**
 * Schedule-time run policy: which targets a prompt should run, at what
 * per-target cadence, with what replication — resolved fresh on every firing
 * so platform-pick and cadence edits apply without touching queued jobs.
 *
 * Two halves, both pure:
 *  - resolvePromptRunPlan: the prompt's target set + intervals.
 *  - selectDueTargets: which of those targets are actually due, metered
 *    against real prompt_runs history. Metering against history (rather than
 *    trusting the job cadence) is what makes per-target cadence work with the
 *    existing one-job-per-prompt scheduler, keeps in-flight jobs from before
 *    an upgrade valid, and structurally prevents duplicate-fire oversampling
 *    (a maintenance expedite re-runs only what is due).
 *
 * Every brand-selected target runs at the brand cadence, replicated
 * RUNS_PER_PROMPT times.
 */

import type { ModelConfig } from "@workspace/config/scrape-targets";
import { getRunsPerPrompt } from "../constants";
import { selectTargetsForBrand } from "../providers/runner";

export interface TargetPlan {
	config: ModelConfig;
	intervalHours: number;
	replication: number;
}

export function slowestIntervalHours(targets: readonly TargetPlan[]): number {
	return targets.length > 0 ? Math.max(...targets.map((target) => target.intervalHours)) : 0;
}

export interface PromptRunPlan {
	targets: TargetPlan[];
	/**
	 * Hours until the prompt next runs. Null means queue nothing: the brand
	 * picked no platforms. schedule-maintenance starts the prompt again within
	 * one pass of the plan producing targets.
	 */
	rescheduleHours: number | null;
}

export interface ResolveRunPlanInput {
	scrapeTargets: ModelConfig[];
	brand: { enabledModels: string[] | null; delayOverrideHours: number | null };
	defaultDelayHours: number;
}

/** Every target the brand selects runs at the brand cadence. */
export function resolvePromptRunPlan(input: ResolveRunPlanInput): PromptRunPlan {
	const interval = input.brand.delayOverrideHours ?? input.defaultDelayHours;
	const targets = selectTargetsForBrand(input.scrapeTargets, input.brand.enabledModels).map((config) => ({
		config,
		intervalHours: interval,
		replication: getRunsPerPrompt(),
	}));
	return { targets, rescheduleHours: targets.length > 0 ? interval : null };
}

/**
 * Key for per-target run history.
 *
 * The provider is part of the identity, not just the model and its web-search
 * flag: a brand can track ChatGPT scraped off the consumer product *and*
 * grounded through an API, and both are `chatgpt` with web search on. Keyed on
 * model alone the two shared a cadence slot, so the scraped target's four runs
 * a day kept the premium one looking fresh and it never came due.
 *
 * Changing this shape costs no reprocessing, because keys are never stored:
 * both sides compute one from (model, provider, web_search_enabled), and
 * prompt_runs has recorded all three since the run was written. A deploy
 * therefore matches existing history rather than treating every target as
 * never-run. The one case that does re-fire once is an operator pointing a
 * model at a different provider — which is a different data source, so
 * restarting its cadence is the right answer.
 */
export function targetKey(config: Pick<ModelConfig, "model" | "provider" | "webSearch">): string {
	return `${config.model}::${config.provider}::${config.webSearch ? "web" : "base"}`;
}

export interface LastRunRow {
	model: string;
	/** Nullable on the column: a row without one predates target keying. */
	provider: string | null;
	webSearchEnabled: boolean;
	lastRunAt: Date | string;
}

export function lastRunsByTargetKey(rows: readonly LastRunRow[]): Map<string, Date> {
	const byKey = new Map<string, Date>();
	for (const row of rows) {
		if (!row.provider) continue;
		byKey.set(
			targetKey({ model: row.model, provider: row.provider, webSearch: row.webSearchEnabled }),
			new Date(row.lastRunAt),
		);
	}
	return byKey;
}

/**
 * Tolerance for cadence jitter: a job that fires slightly early still runs
 * its targets instead of skipping a whole cycle. Capped so long cadences
 * don't open a wide double-run window.
 */
export function dueToleranceMs(intervalHours: number): number {
	return Math.min(30 * 60 * 1000, intervalHours * 3600 * 1000 * 0.25);
}

export function isTargetDue(plan: TargetPlan, lastRunAt: Date | undefined, now: Date): boolean {
	if (!lastRunAt) return true;
	const intervalMs = plan.intervalHours * 3600 * 1000;
	return now.getTime() - lastRunAt.getTime() >= intervalMs - dueToleranceMs(plan.intervalHours);
}

export interface TargetOverdueStatus {
	isOverdue: boolean;
	/** How far past cadence the last run is, in ms; null when never run or on schedule. */
	overdueByMs: number | null;
}

/**
 * Whether a target has missed its cadence — the single definition of "overdue",
 * shared by the maintenance sweep, the overdue warning, and the admin dashboard.
 *
 * Distinct from `isTargetDue`, which asks whether to run now (and so leans
 * early, with jitter tolerance). This asks whether something is wrong, and so
 * leans late: a target is overdue only once it is a whole interval past its last
 * run, plus whatever grace the caller wants. A target that has never run is
 * overdue once the prompt itself is past the grace window — failed runs record
 * no row, so a target broken on one provider shows up even while its siblings
 * stay fresh.
 */
export function targetOverdueStatus(input: {
	intervalHours: number;
	lastRunAt: Date | null | undefined;
	promptCreatedAt: Date;
	now: number;
	graceMs?: number;
}): TargetOverdueStatus {
	const graceMs = input.graceMs ?? 0;
	if (!input.lastRunAt) {
		return { isOverdue: input.now - input.promptCreatedAt.getTime() > graceMs, overdueByMs: null };
	}
	const intervalMs = input.intervalHours * 3600 * 1000;
	const sinceRun = input.now - input.lastRunAt.getTime();
	if (sinceRun > intervalMs + graceMs) return { isOverdue: true, overdueByMs: sinceRun - intervalMs };
	return { isOverdue: false, overdueByMs: null };
}

export function selectDueTargets(targets: TargetPlan[], lastRunAtByKey: Map<string, Date>, now: Date): TargetPlan[] {
	return targets.filter((plan) => isTargetDue(plan, lastRunAtByKey.get(targetKey(plan.config)), now));
}
