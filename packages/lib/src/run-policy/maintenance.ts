/**
 * Pure decision core for the worker's schedule-maintenance job. The worker
 * gathers state (prompts, resolved run plans, last runs, pending pg-boss
 * jobs); this decides which chains to revive, which future jobs to expedite,
 * and how many prompts are overdue enough to alert on. Keeping it pure makes
 * the scheduler's self-healing behavior exhaustively unit-testable.
 */

import { shouldExpediteJob } from "../expedite";
import { dueToleranceMs, type PromptRunPlan, targetKey, targetOverdueStatus } from "./policy";

/** Floor on how often maintenance may drag a prompt's next job forward. */
export const EXPEDITE_MIN_INTERVAL_MS = 60 * 60 * 1000;

/** Grace before an overdue prompt counts toward the overdue warning. */
export const OVERDUE_ALERT_GRACE_MS = 30 * 60 * 1000;

export interface MaintenancePromptState {
	promptId: string;
	promptCreatedAt: Date;
	plan: PromptRunPlan;
	/** Last successful run per targetKey (failed runs write no row). */
	lastRunAtByKey: Map<string, Date>;
	pendingJob: {
		jobId: string;
		state: "created" | "active" | "retry";
		/** Failure streak it carries, so a deliberate backoff is distinguishable. */
		consecutiveFailures: number;
	} | null;
}

export interface MaintenanceDecisions {
	toSchedule: { promptId: string; cadenceHours: number }[];
	toExpedite: { promptId: string; jobId: string }[];
	/** Prompts overdue beyond the alert grace — the overdue warning. */
	alertOverdueCount: number;
}

function isPromptOverdue(state: MaintenancePromptState, now: number, graceMs: number): boolean {
	return state.plan.targets.some(
		(target) =>
			targetOverdueStatus({
				intervalHours: target.intervalHours,
				lastRunAt: state.lastRunAtByKey.get(targetKey(target.config)),
				promptCreatedAt: state.promptCreatedAt,
				now,
				graceMs,
			}).isOverdue,
	);
}

type MaintenanceAction =
	| { kind: "none" }
	| { kind: "schedule"; cadenceHours: number }
	| { kind: "expedite"; jobId: string };

function actionForPrompt(state: MaintenancePromptState, nowMs: number): MaintenanceAction {
	// A job that is running or retrying is already being handled.
	if (state.pendingJob && state.pendingJob.state !== "created") return { kind: "none" };

	// A prompt with no recorded runs is inherently overdue: there is nothing
	// fresh. This covers brand-new prompts and revived chains whose history
	// (shifted or cleaned) fell outside the maintenance query window — the
	// isPromptOverdue path alone would compare against promptCreatedAt and
	// wrongly deem a just-created prompt "not overdue".
	const hasAnyRun = state.lastRunAtByKey.size > 0;
	if (hasAnyRun && !isPromptOverdue(state, nowMs, 0)) return { kind: "none" };

	if (!state.pendingJob) {
		// rescheduleHours is non-null for every state that reaches here.
		return { kind: "schedule", cadenceHours: state.plan.rescheduleHours as number };
	}

	// A future job exists — drag it forward only if the prompt has genuinely
	// stalled. `rescheduleHours` is how often the prompt runs (its fastest
	// target), which is the interval the pending job was scheduled against.
	const runTimes = [...state.lastRunAtByKey.values()].map((d) => d.getTime());
	const expedite = shouldExpediteJob({
		jobConsecutiveFailures: state.pendingJob.consecutiveFailures,
		lastRunAt: runTimes.length > 0 ? new Date(Math.max(...runTimes)) : null,
		runFrequencyMs: (state.plan.rescheduleHours as number) * 3600 * 1000,
		now: nowMs,
		minIntervalMs: EXPEDITE_MIN_INTERVAL_MS,
	});
	return expedite ? { kind: "expedite", jobId: state.pendingJob.jobId } : { kind: "none" };
}

export function computeMaintenanceDecisions(promptStates: MaintenancePromptState[], now: Date): MaintenanceDecisions {
	const nowMs = now.getTime();
	const decisions: MaintenanceDecisions = { toSchedule: [], toExpedite: [], alertOverdueCount: 0 };

	for (const state of promptStates) {
		// No targets (the brand picked no platforms): the prompt is
		// meant to be stopped. Not overdue, nothing to start, no alert noise.
		if (state.plan.targets.length === 0 || state.plan.rescheduleHours === null) continue;
		if (isPromptOverdue(state, nowMs, OVERDUE_ALERT_GRACE_MS)) decisions.alertOverdueCount++;

		const action = actionForPrompt(state, nowMs);
		if (action.kind === "schedule") {
			decisions.toSchedule.push({ promptId: state.promptId, cadenceHours: action.cadenceHours });
		} else if (action.kind === "expedite") {
			decisions.toExpedite.push({ promptId: state.promptId, jobId: action.jobId });
		}
	}

	return decisions;
}

/**
 * Window for the maintenance last-run query: wide enough that the slowest
 * cadence in play still sees its last run (otherwise a long-cadence brand
 * looks never-run and gets expedite-stormed), bounded so the aggregate stops
 * scanning all of prompt_runs on every tick.
 */
export function lastRunQueryWindowMs(maxIntervalHours: number): number {
	const maxIntervalMs = maxIntervalHours * 3600 * 1000;
	return 2 * maxIntervalMs + OVERDUE_ALERT_GRACE_MS + dueToleranceMs(maxIntervalHours);
}
