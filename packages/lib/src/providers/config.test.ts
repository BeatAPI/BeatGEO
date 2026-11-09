import { describe, expect, it, vi } from "vitest";
import { validateScrapeTargets } from "./config";
import { beatBrowser } from "./registry/beat-browser";
import { beatapi } from "./registry/beatapi";

describe("validateScrapeTargets", () => {
	const configuredProvider = { isConfigured: () => true };
	const unconfiguredProvider = { isConfigured: () => false };

	function makeGetProvider(providers: Record<string, { isConfigured(): boolean }>) {
		return (id: string) => providers[id];
	}

	it("passes when all providers are configured", () => {
		const configs = [
			{ model: "chatgpt", provider: "beat-browser", webSearch: false },
			{ model: "claude", provider: "beatapi", version: "claude-sonnet-5-5", webSearch: false },
		];
		expect(() =>
			validateScrapeTargets(
				configs,
				makeGetProvider({ "beat-browser": configuredProvider, beatapi: configuredProvider }),
			),
		).not.toThrow();
	});

	it("throws on unknown provider", () => {
		const configs = [{ model: "chatgpt", provider: "nonexistent", webSearch: true }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({}))).toThrow('unknown provider "nonexistent"');
	});

	it("names the missing key when a provider is not configured", () => {
		const configs = [{ model: "claude", provider: "beatapi", version: "claude-sonnet-5-5", webSearch: false }];
		expect(() => validateScrapeTargets(configs, makeGetProvider({ beatapi: unconfiguredProvider }))).toThrow(
			"BEATAPI_API_KEY",
		);
	});

	it("reports every misconfigured target at once", () => {
		const configs = [
			{ model: "chatgpt", provider: "nonexistent", webSearch: false },
			{ model: "unknown", provider: "beatapi", webSearch: false },
		];
		const error = (() => {
			try {
				validateScrapeTargets(configs, (id) => (id === "beatapi" ? beatapi : undefined));
			} catch (err) {
				return String(err);
			}
			return "";
		})();
		expect(error).toContain('unknown provider "nonexistent"');
		expect(error).toContain("default BeatAPI model");
	});
});

describe("BeatBrowser targets", () => {
	it("accepts ChatGPT and Gemini consumer pages", () => {
		vi.stubEnv("RUNS_PER_PROMPT", "1");
		for (const model of ["chatgpt", "gemini"]) {
			expect(beatBrowser.validateTarget?.({ model, provider: "beat-browser", webSearch: false })).toBeNull();
		}
		vi.unstubAllEnvs();
	});

	it("rejects platforms the browser collector cannot open", () => {
		vi.stubEnv("RUNS_PER_PROMPT", "1");
		expect(
			beatBrowser.validateTarget?.({ model: "perplexity", provider: "beat-browser", webSearch: false }),
		).toBeTruthy();
		vi.unstubAllEnvs();
	});
});
