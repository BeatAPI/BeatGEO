import { setTimeout as delay } from "node:timers/promises";
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
		const run = await collectRun(runnerUrl(), token, model, prompt);
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

type BrowserRun = {
	status: string;
	errorCode?: string;
	answer?: string;
	citations?: Array<{ url: string; title?: string }>;
};

async function collectRun(url: URL, token: string, model: string, prompt: string): Promise<BrowserRun> {
	const signal = AbortSignal.timeout(960_000);
	const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Prefer: "respond-async" };
	try {
		const response = await fetch(url, {
			redirect: "error",
			method: "POST",
			headers,
			body: JSON.stringify({ engine: model, prompt, brand: "" }),
			signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
		});
		if (response.status === 409) throw new CollectionError("runner_busy");
		if (!response.ok) throw new CollectionError("failed");
		const result = await response.json();
		if (response.status !== 202) return result;
		if (typeof result.runId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(result.runId))
			throw new CollectionError("failed");
		return await pollRun(new URL(`/api/collect/${result.runId}`, url), token, signal);
	} catch (error) {
		if (error instanceof CollectionError) throw error;
		if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
			throw new CollectionError("timeout");
		throw new CollectionError("runner_offline");
	}
}

async function pollRun(url: URL, token: string, signal: AbortSignal): Promise<BrowserRun> {
	let run: BrowserRun;
	do {
		await delay(2000, undefined, { signal });
		const progress = await fetch(url, {
			redirect: "error",
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
		});
		if (!progress.ok) throw new CollectionError("runner_offline");
		run = await progress.json();
	} while (["opening", "submitting", "waiting"].includes(run.status));
	return run;
}
