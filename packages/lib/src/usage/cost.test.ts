import { describe, expect, it } from "vitest";
import { estimateRunCostUsd, projectMonthlyTargetCostUsd } from "./cost";

describe("estimateRunCostUsd", () => {
	it("charges nothing for browser collection in the user's own account", () => {
		expect(estimateRunCostUsd("beat-browser")).toBe(0);
	});

	it("prices a BeatAPI run", () => {
		expect(estimateRunCostUsd("beatapi")).toBeGreaterThan(0);
	});

	it("reports nothing for an unpriced or missing provider", () => {
		expect(estimateRunCostUsd("some-new-provider")).toBeNull();
		expect(estimateRunCostUsd(null)).toBeNull();
	});
});

describe("projectMonthlyTargetCostUsd", () => {
	it("multiplies per-run cost by prompts, cadence, replication and 30 days", () => {
		// 10 prompts x 4/day x 5 calls x 30 days = 6000 runs at a cent each.
		expect(
			projectMonthlyTargetCostUsd({ costPerRunUsd: 0.01, enabledPrompts: 10, runsPerDay: 4, replication: 5 }),
		).toBeCloseTo(60, 6);
	});

	it("costs nothing when a brand has no enabled prompts", () => {
		expect(projectMonthlyTargetCostUsd({ costPerRunUsd: 0.01, enabledPrompts: 0, runsPerDay: 4, replication: 5 })).toBe(
			0,
		);
	});

	it("stays unknown when the per-run cost is unknown, rather than guessing zero", () => {
		expect(
			projectMonthlyTargetCostUsd({ costPerRunUsd: null, enabledPrompts: 10, runsPerDay: 4, replication: 5 }),
		).toBeNull();
	});
});
