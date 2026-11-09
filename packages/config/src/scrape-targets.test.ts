import { describe, expect, it } from "vitest";
import {
	formatScrapeTarget,
	type ModelConfig,
	PLATFORM_TARGETS,
	parseScrapeTargets,
	providersByModel,
} from "./scrape-targets";

describe("parseScrapeTargets", () => {
	describe("basic parsing", () => {
		it("parses model:provider", () => {
			const result = parseScrapeTargets("chatgpt:beat-browser");
			expect(result).toEqual([{ model: "chatgpt", provider: "beat-browser", version: undefined, webSearch: false }]);
		});

		it("parses model:provider:online", () => {
			const result = parseScrapeTargets("chatgpt:beat-browser:online");
			expect(result).toEqual([{ model: "chatgpt", provider: "beat-browser", version: undefined, webSearch: true }]);
		});

		it("parses model:provider:version", () => {
			const result = parseScrapeTargets("chatgpt:beatapi:gpt-5.6-luna");
			expect(result).toEqual([{ model: "chatgpt", provider: "beatapi", version: "gpt-5.6-luna", webSearch: false }]);
		});

		it("parses model:provider:version:online", () => {
			const result = parseScrapeTargets("chatgpt:beatapi:gpt-5.6-luna:online");
			expect(result).toEqual([{ model: "chatgpt", provider: "beatapi", version: "gpt-5.6-luna", webSearch: true }]);
		});
	});

	it("parses multiple entries with mixed providers", () => {
		const result = parseScrapeTargets(
			"chatgpt:beat-browser:online,claude:beatapi:claude-sonnet-5-5,gemini:beat-browser:online",
		);
		expect(result).toHaveLength(3);
		expect(result[0]).toEqual({ model: "chatgpt", provider: "beat-browser", version: undefined, webSearch: true });
		expect(result[1]).toEqual({
			model: "claude",
			provider: "beatapi",
			version: "claude-sonnet-5-5",
			webSearch: false,
		});
		expect(result[2]).toEqual({ model: "gemini", provider: "beat-browser", version: undefined, webSearch: true });
	});

	it("handles OpenRouter version slugs with colons", () => {
		const result = parseScrapeTargets("chatgpt:beatapi:gpt-5.6-luna:free:online");
		expect(result).toEqual([{ model: "chatgpt", provider: "beatapi", version: "gpt-5.6-luna:free", webSearch: true }]);
	});

	describe("whitespace handling", () => {
		it("trims whitespace around entries", () => {
			const result = parseScrapeTargets(" chatgpt:beat-browser:online , gemini:beat-browser:online ");
			expect(result).toHaveLength(2);
			expect(result[0].model).toBe("chatgpt");
			expect(result[1].model).toBe("gemini");
		});
	});

	describe("error cases", () => {
		it("throws on empty string entries (trailing comma)", () => {
			expect(() => parseScrapeTargets("chatgpt:beat-browser,")).toThrow("empty entry");
		});

		it("throws on single-segment entries", () => {
			expect(() => parseScrapeTargets("chatgpt")).toThrow("need at least model:provider");
		});
	});

	describe("missing SCRAPE_TARGETS", () => {
		it("throws when SCRAPE_TARGETS is undefined", () => {
			expect(() => parseScrapeTargets(undefined)).toThrow("SCRAPE_TARGETS environment variable is required");
		});

		it("throws when SCRAPE_TARGETS is empty string", () => {
			expect(() => parseScrapeTargets("")).toThrow("SCRAPE_TARGETS environment variable is required");
		});
	});
});

describe("formatScrapeTarget", () => {
	it("formats model:provider", () => {
		expect(formatScrapeTarget({ model: "chatgpt", provider: "beat-browser", webSearch: false })).toBe(
			"chatgpt:beat-browser",
		);
	});

	it("formats model:provider:online", () => {
		expect(formatScrapeTarget({ model: "chatgpt", provider: "beat-browser", webSearch: true })).toBe(
			"chatgpt:beat-browser:online",
		);
	});

	it("formats model:provider:version", () => {
		expect(
			formatScrapeTarget({ model: "chatgpt", provider: "beatapi", version: "gpt-5.6-luna", webSearch: false }),
		).toBe("chatgpt:beatapi:gpt-5.6-luna");
	});

	it("formats model:provider:version:online", () => {
		expect(
			formatScrapeTarget({
				model: "claude",
				provider: "beatapi",
				version: "claude-sonnet-5-5",
				webSearch: true,
			}),
		).toBe("claude:beatapi:claude-sonnet-5-5:online");
	});
});

describe("round-trip", () => {
	it("parse(format(x)) returns x", () => {
		const configs: ModelConfig[] = [
			{ model: "chatgpt", provider: "beat-browser", version: undefined, webSearch: true },
			{ model: "chatgpt", provider: "beat-browser", version: undefined, webSearch: false },
			{ model: "claude", provider: "beatapi", version: "claude-sonnet-5-5", webSearch: true },
			{ model: "chatgpt", provider: "beatapi", version: "gpt-5.6-luna", webSearch: false },
			{ model: "chatgpt", provider: "beatapi", version: "gpt-5.6-luna:free", webSearch: true },
			{ model: "gemini", provider: "beat-browser", version: undefined, webSearch: true },
		];
		for (const config of configs) {
			expect(parseScrapeTargets(formatScrapeTarget(config))).toEqual([config]);
		}
	});

	it("format(parse(s)) returns s", () => {
		const value =
			"chatgpt:beat-browser:online,claude:beatapi:claude-sonnet-5-5,glm:beatapi:glm-5.3:online,chatgpt:beat-browser";
		expect(parseScrapeTargets(value).map(formatScrapeTarget).join(",")).toBe(value);
	});
});

describe("providersByModel", () => {
	it("lists every provider PLATFORM_TARGETS exercises for a model, deduped and sorted", () => {
		const map = providersByModel();
		// ChatGPT is the most widely served surface, via scrapers and APIs alike.
		const chatgpt = map.get("chatgpt") ?? [];
		expect(chatgpt).toContain("beat-browser");
		expect(chatgpt).toContain("beatapi");
		expect(chatgpt).toEqual([...new Set(chatgpt)].sort());
	});

	it("covers every model PLATFORM_TARGETS names, and nothing else", () => {
		const fromTargets = new Set(parseScrapeTargets(PLATFORM_TARGETS.join(",")).map((t) => t.model));
		expect(new Set(providersByModel().keys())).toEqual(fromTargets);
	});
});

describe("BeatAPI default models", () => {
	it("asks the platform's default model when a target names only the platform", () => {
		expect(parseScrapeTargets("claude:beatapi")).toEqual([
			{ model: "claude", provider: "beatapi", version: "claude-sonnet-5-5", webSearch: false },
		]);
	});

	it("keeps an explicitly pinned model", () => {
		expect(parseScrapeTargets("claude:beatapi:claude-opus-5-5")[0]?.version).toBe("claude-opus-5-5");
	});

	it("leaves unknown platforms without a model so validation can reject them", () => {
		expect(parseScrapeTargets("unknown:beatapi")[0]?.version).toBeUndefined();
	});
});
