/**
 * How tracked platforms are grouped and named.
 *
 * A platform reaches a brand one of three ways: scraped from the product a
 * visitor uses, called as an API without web search, or called as an API with
 * its own web search on (grounded). The grounded tier keeps the id "premium",
 * which model-filter URLs already carry.
 */

import { getModelMeta } from "./models";

export type PlatformTierId = "scraped" | "api" | "premium";

/** What each tier is called, wherever it is shown. */
export const PLATFORM_TIER_LABELS: Record<PlatformTierId, string> = {
	scraped: "Browser observations · BeatBrowser",
	api: "Model answers · BeatAPI",
	premium: "Premium LLM APIs",
};

/**
 * What a grounded model is called, which is not what it is called as a plain
 * pick: "ChatGPT" and "GPT-5 Search" answer different questions.
 */
const GROUNDED_LABELS: Record<string, string> = {
	claude: "Claude Sonnet 5 (web)",
	chatgpt: "GPT-5 Search",
	grok: "Grok (web)",
};

export function premiumModelLabel(model: string): string {
	return GROUNDED_LABELS[model] ?? getModelMeta(model).label;
}
