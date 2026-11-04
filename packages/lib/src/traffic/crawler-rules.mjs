// Small, versioned HTTP identity catalogue. UA tokens are declarations, never proof.
// Roles checked against the linked operator documentation on 2026-10-26.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const CRAWLER_RULE_VERSION = "beat-geo/crawlers@1";
const sources = {
	OpenAI: "https://developers.openai.com/api/docs/bots",
	Anthropic:
		"https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
	Perplexity: "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
	Kimi: "https://www.kimi.com/policies/kimi-crawlers",
};

export const CRAWLERS = Object.freeze(
	[
		["GPTBot", "OpenAI", "training"],
		["OAI-SearchBot", "OpenAI", "search"],
		["ChatGPT-User", "OpenAI", "user"],
		["ClaudeBot", "Anthropic", "training"],
		["Claude-SearchBot", "Anthropic", "search"],
		["Claude-User", "Anthropic", "user"],
		["PerplexityBot", "Perplexity", "search"],
		["Perplexity-User", "Perplexity", "user"],
		["KimiBot", "Kimi", "training"],
		["Kimi-SearchBot", "Kimi", "search"],
		["Kimi-User", "Kimi", "user"],
	].map(([name, platform, purpose]) =>
		Object.freeze({
			id: name.toLowerCase(),
			name,
			platform,
			purpose,
			documentation: sources[platform],
			reviewedAt: "2026-10-26",
		}),
	),
);

const matchers = CRAWLERS.map((crawler) => ({
	crawler,
	pattern: new RegExp(`(?:^|[^a-z0-9_-])${escapeRegExp(crawler.name)}(?=$|[^a-z0-9_-])`, "i"),
}));

export function recognizeCrawler(userAgent) {
	const matches = matchers.filter(({ pattern }) => pattern.test(userAgent)).map(({ crawler }) => crawler);
	return {
		state: matches.length === 1 ? "declared" : matches.length ? "ambiguous" : "unrecognized",
		crawler: matches.length === 1 ? matches[0] : null,
		candidates: matches.map((crawler) => crawler.id),
	};
}
