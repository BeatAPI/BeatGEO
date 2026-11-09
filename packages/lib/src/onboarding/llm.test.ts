import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveResearchProvider } from "./llm";

const ENV_KEYS = ["BEATAPI_API_KEY", "BEATAPI_RESEARCH_MODEL", "ONBOARDING_LLM_TARGET", "BROWSER_RUNNER_TOKEN"];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const key of ENV_KEYS) {
		savedEnv[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of ENV_KEYS) {
		const v = savedEnv[key];
		if (v === undefined) delete process.env[key];
		else process.env[key] = v;
	}
});

describe("resolveResearchProvider", () => {
	it("selects BeatAPI research only with a configured model", () => {
		process.env.BEATAPI_API_KEY = "test";
		expect(() => resolveResearchProvider({ BEATAPI_API_KEY: "test" })).toThrow(/BEATAPI_RESEARCH_MODEL/);
		process.env.BEATAPI_RESEARCH_MODEL = "test-model";
		expect(resolveResearchProvider().id).toBe("beatapi");
	});

	it("uses the explicit env override when set", () => {
		expect(resolveResearchProvider({ ONBOARDING_LLM_TARGET: "stub:stub" }).id).toBe("stub");
	});

	it("throws when ONBOARDING_LLM_TARGET points at an unconfigured provider", () => {
		expect(() =>
			resolveResearchProvider({ ONBOARDING_LLM_TARGET: "research:beatapi", BEATAPI_RESEARCH_MODEL: "m" }),
		).toThrow(/isn't configured/);
	});

	it("throws when ONBOARDING_LLM_TARGET points at the browser collector", () => {
		process.env.BROWSER_RUNNER_TOKEN = "x";
		expect(() => resolveResearchProvider({ ONBOARDING_LLM_TARGET: "chatgpt:beat-browser" })).toThrow(
			/does not support structured research/,
		);
	});

	it("does not treat the browser collector as a research provider", () => {
		process.env.BROWSER_RUNNER_TOKEN = "x";
		expect(() => resolveResearchProvider({ BROWSER_RUNNER_TOKEN: "x" })).toThrow(/BeatAPI/);
	});
});
