import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/lib/db/db", () => ({ db: {} }));
vi.mock("@/lib/job-scheduler", () => ({ createMultiplePromptJobSchedulers: vi.fn() }));
vi.mock("@workspace/lib/limits", () => ({
	assertAllowed: vi.fn(),
	decidePromptCap: vi.fn(),
	withQuotaLock: vi.fn(),
}));

import { planSeoPromptImport, seoPromptInput } from "../seo-prompts";

const existing = [{ id: "existing", value: "Best Image API?", enabled: false, tags: ["manual"] }];

describe("SEO question import", () => {
	it("deduplicates case, whitespace and Unicode equivalents without replacing existing questions", () => {
		const plan = planSeoPromptImport(
			[
				{ id: "a", text: " best   image API? " },
				{ id: "b", text: "Which API supports editing?" },
				{ id: "c", text: "Ｗhich API supports editing?" },
			],
			existing,
		);
		expect(plan.additions).toEqual(["Which API supports editing?"]);
		expect(plan.selected.size).toBe(2);
		expect(plan.byText.get("best image api?")).toEqual(existing[0]);
		expect(existing[0].enabled).toBe(false);
	});

	it("rejects conflicting text under the same selected question ID", () => {
		expect(() =>
			planSeoPromptImport(
				[
					{ id: "same", text: "One?" },
					{ id: "same", text: "Two?" },
				],
				[],
			),
		).toThrow("different texts");
	});

	it("rejects empty, oversized or unscoped imports before database writes", () => {
		const valid = {
			brandId: "brand",
			sourceRunId: "4fc33b63-57af-4b8f-93c8-769dcc4c3ea7",
			questions: [{ id: "q1", text: "A question?" }],
		};
		expect(seoPromptInput.parse(valid)).toEqual(valid);
		for (const input of [
			{ ...valid, sourceRunId: "other-brand/../../data" },
			{ ...valid, brandId: "" },
			{ ...valid, questions: [] },
			{ ...valid, questions: Array.from({ length: 101 }, () => valid.questions[0]) },
			{ ...valid, questions: [{ id: "q", text: " " }] },
			{ ...valid, questions: [{ id: "q".repeat(101), text: "Question?" }] },
			{ ...valid, questions: [{ id: "q", text: "q".repeat(2001) }] },
		])
			expect(seoPromptInput.safeParse(input).success).toBe(false);
	});
});
