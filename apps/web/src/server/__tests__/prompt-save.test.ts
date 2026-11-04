import { describe, expect, it } from "vitest";
import { planPromptSave, type StoredPrompt, type SubmittedPrompt } from "@/server/prompt-save";

function stored(id: string): StoredPrompt {
	return { id };
}

function submitted(overrides: Partial<SubmittedPrompt> = {}): SubmittedPrompt {
	return { value: "how do i track brand mentions", enabled: true, ...overrides };
}

describe("which rows a save may claim", () => {
	it("updates the brand's own rows and inserts the ones with no id", () => {
		const plan = planPromptSave([submitted({ id: "own" }), submitted()], [stored("own")]);

		expect(plan.updates.map((update) => update.id)).toEqual(["own"]);
		expect(plan.inserts).toHaveLength(1);
	});

	it("refuses an id the brand does not have", () => {
		// Another brand's prompt, or one deleted through the admin API since the
		// editor loaded. Skipping it would drop that edit and report success.
		expect(() => planPromptSave([submitted({ id: "someone-elses" })], [stored("own")])).toThrow(
			/not in this brand's list/,
		);
	});

	it("refuses the same id twice, rather than guessing which edit was meant", () => {
		expect(() =>
			planPromptSave(
				[submitted({ id: "own", value: "first" }), submitted({ id: "own", value: "second" })],
				[stored("own")],
			),
		).toThrow(/appears twice/);
	});

	it("refuses a padded list", () => {
		const rows = Array.from({ length: 500 }, () => submitted({ id: "own" }));

		expect(() => planPromptSave(rows, [stored("own")])).toThrow(/appears twice/);
	});
});
