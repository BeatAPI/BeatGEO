import { COLLECTION_FAILURES, CollectionError, type CollectionFailure } from "../../monitoring";
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
		if (process.env.RUNS_PER_PROMPT !== "1")
			return "BeatBrowser MVP requires RUNS_PER_PROMPT=1 and one worker per collector.";
		if (!["chatgpt", "gemini"].includes(target.model)) return "Browser Lab supports chatgpt and gemini.";
		if (target.version || target.webSearch)
			return "Browser Lab uses the account's current model/search mode; do not request a pinned version or :online.";
		return null;
	},
	async run(model, prompt): Promise<ScrapeResult> {
		const token = process.env.BROWSER_RUNNER_TOKEN;
		if (!token) throw new Error("BROWSER_RUNNER_TOKEN is required.");
		const url = runnerUrl();
		let response: Response;
		try {
			response = await fetch(url, {
				redirect: "error",
				method: "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
				body: JSON.stringify({ engine: model, prompt, brand: "" }),
				signal: AbortSignal.timeout(960_000),
			});
		} catch (error) {
			if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
				throw new CollectionError("timeout");
			throw new CollectionError("runner_offline");
		}
		if (response.status === 409) throw new CollectionError("runner_busy");
		if (!response.ok) throw new CollectionError("failed");
		const run = await response.json();
		if (run.status !== "completed" || typeof run.answer !== "string" || !run.answer.trim()) {
			throw new CollectionError(runnerFailure(run));
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

function runnerFailure(run: { errorCode?: string; status: string }): CollectionFailure {
	const code = run.errorCode ?? run.status;
	if (COLLECTION_FAILURES.includes(code as CollectionFailure)) return code as CollectionFailure;
	return run.status === "completed" ? "empty_answer" : "failed";
}
