import { describe, expect, it } from "vitest";
import { addedPlatforms } from "@/lib/run-config-changes";

const CONFIGURED = ["chatgpt", "perplexity", "gemini"];

describe("addedPlatforms", () => {
	it("reports a newly picked platform", () => {
		expect(addedPlatforms(["chatgpt"], ["chatgpt", "gemini"], CONFIGURED)).toEqual(["gemini"]);
	});

	it("reports nothing when a platform is dropped", () => {
		expect(addedPlatforms(["chatgpt", "gemini"], ["chatgpt"], CONFIGURED)).toEqual([]);
	});

	it("reports nothing when the selection is unchanged", () => {
		expect(addedPlatforms(["chatgpt", "gemini"], ["gemini", "chatgpt"], CONFIGURED)).toEqual([]);
	});

	it("treats null as every configured target, so narrowing adds nothing", () => {
		expect(addedPlatforms(null, ["chatgpt"], CONFIGURED)).toEqual([]);
	});

	it("treats null as every configured target, so widening adds the rest", () => {
		expect(addedPlatforms(["chatgpt"], null, CONFIGURED)).toEqual(["perplexity", "gemini"]);
	});
});
