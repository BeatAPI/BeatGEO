/**
 * A fresh run plan for every prompt of one brand — the shared shape behind
 * process-prompt (a single prompt per firing) and schedule-maintenance (every
 * prompt of every brand per tick).
 */

import type { ModelConfig } from "@workspace/config/scrape-targets";
import { type PromptRunPlan, resolvePromptRunPlan } from "./policy";

export interface ResolveBrandPromptRunPlansInput {
	scrapeTargets: ModelConfig[];
	defaultDelayHours: number;
	brand: { enabledModels: string[] | null; delayOverrideHours: number | null };
	prompts: { id: string }[];
}

export function resolveBrandPromptRunPlans(input: ResolveBrandPromptRunPlansInput): Map<string, PromptRunPlan> {
	const plan = resolvePromptRunPlan({
		scrapeTargets: input.scrapeTargets,
		brand: input.brand,
		defaultDelayHours: input.defaultDelayHours,
	});
	return new Map(input.prompts.map((prompt) => [prompt.id, plan]));
}
