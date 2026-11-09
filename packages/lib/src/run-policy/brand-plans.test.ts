import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { describe, expect, it } from "vitest";
import { type ResolveBrandPromptRunPlansInput, resolveBrandPromptRunPlans } from "./brand-plans";

const TARGETS = parseScrapeTargets("chatgpt:beat-browser:online,perplexity:beat-browser:online");

function input(overrides: Partial<ResolveBrandPromptRunPlansInput>): ResolveBrandPromptRunPlansInput {
	return {
		scrapeTargets: TARGETS,
		defaultDelayHours: 24,
		brand: { enabledModels: ["chatgpt"], delayOverrideHours: null },
		prompts: [],
		...overrides,
	};
}

describe("resolveBrandPromptRunPlans", () => {
	it("plans every prompt it is given", () => {
		const plans = resolveBrandPromptRunPlans(input({ prompts: [{ id: "p1" }, { id: "p2" }, { id: "p3" }] }));
		expect([...plans.keys()]).toEqual(["p1", "p2", "p3"]);
	});

	it("runs the brand's picks at the brand cadence", () => {
		const plans = resolveBrandPromptRunPlans(
			input({ brand: { enabledModels: ["chatgpt"], delayOverrideHours: 6 }, prompts: [{ id: "p1" }] }),
		);
		const plan = plans.get("p1");
		expect(plan?.targets.map((target) => target.config.model)).toEqual(["chatgpt"]);
		expect(plan?.rescheduleHours).toBe(6);
	});
});
