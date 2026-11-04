import { expect, it } from "vitest";
import { type ObservedAnswer, summarizeObservedAnswers } from "./observed-metrics";

const answer = (id: string, patch: Partial<ObservedAnswer> = {}): ObservedAnswer => ({
	id,
	model: "chatgpt",
	provider: "beat-browser",
	version: "collector-v1",
	webSearchEnabled: true,
	branded: false,
	brandMentioned: true,
	competitorsMentioned: ["other", "other"],
	createdAt: new Date("2026-10-01"),
	...patch,
});
it("deduplicates evidence and uses answer-level mention denominators", () => {
	const [group] = summarizeObservedAnswers([
		answer("1"),
		answer("1"),
		answer("2", { brandMentioned: false, competitorsMentioned: ["other"] }),
	]);
	expect(group).toMatchObject({ answers: 2, mentions: 1, competitorMentions: 2, mentionRate: 50 });
	expect(group.shareOfVoice).toBeCloseTo(100 / 3);
});
it("keeps API, browser, version and question-type cohorts apart without synthesizing missing dates", () => {
	const groups = summarizeObservedAnswers([
		answer("1"),
		answer("2", { provider: "beatapi" }),
		answer("3", { version: "collector-v2" }),
		answer("4", { branded: true }),
	]);
	expect(groups).toHaveLength(4);
	expect(groups.every((group) => group.answers === 1 && group.lastSeen === "2026-10-01T00:00:00.000Z")).toBe(true);
	expect(summarizeObservedAnswers([])).toEqual([]);
	expect(
		summarizeObservedAnswers([answer("5", { brandMentioned: false, competitorsMentioned: [] })])[0].shareOfVoice,
	).toBeNull();
});
