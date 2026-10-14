import type { Provider, ScrapeResult } from "../types";

function runnerUrl(): URL {
	const url = new URL(process.env.BROWSER_RUNNER_URL || "http://127.0.0.1:4318");
	if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
		throw new Error("BeatBrowser runner must be a local HTTP service.");
	}
	return new URL("/api/collect", url);
}

export const beatBrowser: Provider = {
	id: "beat-browser",
	name: "BeatBrowser (your Chrome)",
	access: "scraped",
	isConfigured: () => Boolean(process.env.BROWSER_RUNNER_TOKEN),
	validateTarget: (target) => {
		if (!["chatgpt", "gemini"].includes(target.model)) return "Browser Lab supports chatgpt and gemini.";
		if (target.version || target.webSearch)
			return "Browser Lab uses the account's current model/search mode; do not request a pinned version or :online.";
		return null;
	},
	async run(model, prompt): Promise<ScrapeResult> {
		const token = process.env.BROWSER_RUNNER_TOKEN;
		if (!token) throw new Error("BROWSER_RUNNER_TOKEN is required.");
		const response = await fetch(runnerUrl(), {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ engine: model, prompt, brand: "" }),
			signal: AbortSignal.timeout(960_000),
		});
		if (!response.ok)
			throw new Error(`Browser runner returned ${response.status}; inspect Browser Lab before retrying.`);
		const run = await response.json();
		if (run.status !== "completed" || typeof run.answer !== "string" || !run.answer.trim()) {
			throw new Error("Browser collection did not complete; no visibility observation was recorded.");
		}
		return {
			textContent: run.answer,
			rawOutput: { ...run, text: run.answer },
			webQueries: [],
			citations: (run.citations || []).map((citation: { url: string; title?: string }, index: number) => ({
				url: citation.url,
				title: citation.title,
				domain: new URL(citation.url).hostname,
				citationIndex: index + 1,
			})),
		};
	},
};
