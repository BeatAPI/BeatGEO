import type { OnboardingSuggestion } from "@workspace/lib/onboarding";
import type { Job, PgBoss } from "pg-boss";
import { type AnalyzeBrandData, analyzeBrandJob } from "./jobs/analyze-brand";
import { type GenerateReportData, generateReportJob } from "./jobs/generate-report";
import { type ProcessPromptData, processPromptJob } from "./jobs/process-prompt";
import { type ScheduleMaintenanceData, scheduleMaintenanceJob } from "./jobs/schedule-maintenance";
import { type SuggestPromptsData, type SuggestPromptsResult, suggestPromptsJob } from "./jobs/suggest-prompts";

/**
 * Wraps a pg-boss handler to log errors with their queue before re-throwing.
 * Preserves the handler's return value (stored by pg-boss as the job output).
 */
function withFailureLog<T, R>(
	queueName: string,
	handler: (jobs: Job<T>[]) => Promise<R>,
): (jobs: Job<T>[]) => Promise<R> {
	return async (jobs) => {
		try {
			return await handler(jobs);
		} catch (error) {
			console.error(`[${queueName}] job failed:`, error);
			throw error;
		}
	};
}

/**
 * Register all job handlers with pg-boss.
 */
export async function registerHandlers(boss: PgBoss): Promise<void> {
	await boss.work<ProcessPromptData>(
		"process-prompt",
		{ localConcurrency: process.env.SCRAPE_TARGETS?.includes(":beat-browser") ? 1 : 10 },
		withFailureLog("process-prompt", processPromptJob),
	);
	console.log("Registered handler: process-prompt");

	await boss.work<GenerateReportData>(
		"generate-report",
		{ localConcurrency: 2 },
		withFailureLog("generate-report", generateReportJob),
	);
	console.log("Registered handler: generate-report");

	// batchSize: 1 keeps the returned suggestion mapped 1:1 to a single job's
	// output, which the web app reads back via getJobById.
	await boss.work<AnalyzeBrandData, OnboardingSuggestion>(
		"analyze-brand",
		{ batchSize: 1, localConcurrency: 2 },
		withFailureLog("analyze-brand", analyzeBrandJob),
	);
	console.log("Registered handler: analyze-brand");

	await boss.work<SuggestPromptsData, SuggestPromptsResult>(
		"suggest-prompts",
		{ batchSize: 1, localConcurrency: 2 },
		withFailureLog("suggest-prompts", suggestPromptsJob),
	);
	console.log("Registered handler: suggest-prompts");

	await boss.work<ScheduleMaintenanceData>(
		"schedule-maintenance",
		{ localConcurrency: 1 },
		withFailureLog("schedule-maintenance", scheduleMaintenanceJob),
	);
	console.log("Registered handler: schedule-maintenance");
}
