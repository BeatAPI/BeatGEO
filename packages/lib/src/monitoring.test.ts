import { describe, expect, it } from "vitest";
import { CollectionError, collectionFailure, compareObservations, type Observation } from "./monitoring";

const baseline: Observation = {
	runId: "before",
	promptId: "question",
	promptValue: "best image tools",
	targetKey: "chatgpt/browser/v1",
	definitionKey: "brand-v1",
	brandMentioned: false,
	citationCount: 0,
	createdAt: "2026-10-01T00:00:00Z",
};
const after = { ...baseline, runId: "after", brandMentioned: true, createdAt: "2026-10-03T00:00:00Z" };

describe("same-cohort retesting", () => {
	it("measures matching observations in percentage points", () => {
		expect(compareObservations([baseline], [after], "2026-10-02T00:00:00Z")).toMatchObject({
			matched: 1,
			missing: 0,
			beforeRate: 0,
			afterRate: 100,
			deltaPoints: 100,
		});
	});
	it.each(["promptValue", "targetKey", "definitionKey"] as const)("does not silently compare changed %s", (field) => {
		expect(compareObservations([baseline], [{ ...after, [field]: "changed" }], "2026-10-02T00:00:00Z")).toMatchObject({
			matched: 0,
			missing: 1,
			beforeRate: null,
			afterRate: null,
			deltaPoints: null,
		});
	});
	it("uses the latest answer once per cohort and excludes pre-implementation answers", () => {
		const newer = { ...after, runId: "latest", brandMentioned: false, createdAt: "2026-10-04T00:00:00Z" };
		const result = compareObservations([baseline, baseline], [newer, after, baseline], "2026-10-02T00:00:00Z");
		expect(result).toMatchObject({ expected: 1, matched: 1, afterRate: 0 });
		expect(result.pairs[0].after.runId).toBe("latest");
	});
	it("does not turn missing coverage into zero exposure", () => {
		const second = { ...baseline, promptId: "missing", brandMentioned: true };
		expect(compareObservations([baseline, second], [after], "2026-10-02T00:00:00Z")).toMatchObject({
			expected: 2,
			matched: 1,
			missing: 1,
			beforeRate: 0,
			afterRate: 100,
		});
	});
	it("classifies only controlled failures, without persisting raw errors", () => {
		expect(collectionFailure(new CollectionError("blocked"))).toBe("blocked");
		expect(collectionFailure(new DOMException("private content", "TimeoutError"))).toBe("timeout");
		expect(collectionFailure(new Error("secret provider body"))).toBe("failed");
	});
});
