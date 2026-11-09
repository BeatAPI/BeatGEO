/**
 * The single module that parses and formats the SCRAPE_TARGETS env var.
 *
 * Format: model:provider[:version][:online]
 * - model: AI platform to track (chatgpt, gemini, claude, deepseek, ...)
 * - provider: How to reach it — beat-browser (the consumer page in your Chrome) or beatapi (the model API)
 * - version: BeatAPI model ID; optional for beatapi (defaults per platform), omitted for beat-browser
 * - :online: Reserved for web-search targets. Neither shipped provider accepts it today.
 */

import { PROVIDERS_DOCS_URL } from "./constants";
import { BEATAPI_DEFAULT_MODELS } from "./models";

export interface ModelConfig {
	model: string;
	provider: string;
	version?: string;
	webSearch: boolean;
}

/**
 * Parse the SCRAPE_TARGETS env var into structured ModelConfig objects.
 *
 * Parsing: split on ":". First = model, second = provider. If last segment is "online",
 * pop it (websearch = true). Remaining middle segments rejoined with ":" = version slug.
 */
export function parseScrapeTargets(envValue?: string): ModelConfig[] {
	if (!envValue || !envValue.trim()) {
		throw new Error(
			"SCRAPE_TARGETS environment variable is required. " +
				"Set it to configure which AI models to track. Example:\n" +
				"  SCRAPE_TARGETS=chatgpt:beat-browser,claude:beatapi\n" +
				`See ${PROVIDERS_DOCS_URL} for details.`,
		);
	}
	return envValue.split(",").map((raw) => {
		const trimmed = raw.trim();
		if (!trimmed) throw new Error("Invalid SCRAPE_TARGETS: empty entry (check for trailing commas)");
		const parts = trimmed.split(":");
		if (parts.length < 2) throw new Error(`Invalid SCRAPE_TARGETS entry: "${trimmed}" (need at least model:provider)`);
		const model = parts[0];
		const provider = parts[1];
		const webSearch = parts[parts.length - 1] === "online";
		const versionParts = parts.slice(2, webSearch ? -1 : undefined);
		const version =
			versionParts.length > 0
				? versionParts.join(":")
				: provider === "beatapi"
					? BEATAPI_DEFAULT_MODELS[model]
					: undefined;
		return { model, provider, version, webSearch };
	});
}

/**
 * Inverse of parseScrapeTargets for a single entry: build the
 * model:provider[:version][:online] string from a ModelConfig.
 */
export function formatScrapeTarget(config: ModelConfig): string {
	const parts = [config.model, config.provider];
	if (config.version) parts.push(config.version);
	if (config.webSearch) parts.push("online");
	return parts.join(":");
}

/**
 * Every platform BeatGEO can track and how: BeatBrowser opens the consumer page in
 * the user's own Chrome, BeatAPI asks the platform's model (BEATAPI_DEFAULT_MODELS)
 * through one key.
 */
export const PLATFORM_TARGETS = [
	"chatgpt:beat-browser",
	"gemini:beat-browser",
	...Object.keys(BEATAPI_DEFAULT_MODELS).map((model) => `${model}:beatapi`),
];

/**
 * Which providers can serve each trackable model, derived from PLATFORM_TARGETS.
 * Used to tell the user what they would need in order to track a platform they
 * have not configured yet.
 */
export function providersByModel(): Map<string, string[]> {
	const byModel = new Map<string, Set<string>>();
	for (const target of parseScrapeTargets(PLATFORM_TARGETS.join(","))) {
		const providers = byModel.get(target.model) ?? new Set<string>();
		providers.add(target.provider);
		byModel.set(target.model, providers);
	}
	return new Map([...byModel].map(([model, providers]) => [model, [...providers].sort()]));
}
