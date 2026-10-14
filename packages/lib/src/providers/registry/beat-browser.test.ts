import { afterEach, expect, it, vi } from "vitest";
import { extractCitations, extractTextContent } from "../../text-extraction";
import { beatBrowser } from "./beat-browser";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

it("preserves a completed browser answer and its citations through history rendering", async () => {
	vi.stubEnv("BROWSER_RUNNER_TOKEN", "local-test-token");
	const answer = {
		status: "completed",
		answer: "Example is recommended.",
		citations: [{ url: "https://example.com/", title: "Example" }],
	};
	const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(answer)));
	vi.stubGlobal("fetch", request);
	const result = await beatBrowser.run("chatgpt", "best providers", {});
	expect(result.textContent).toBe(answer.answer);
	expect(extractTextContent(result.rawOutput, "beat-browser")).toBe(answer.answer);
	expect(extractCitations(result.rawOutput, "beat-browser")[0].url).toBe("https://example.com/");
	expect(result.webQueries).toEqual([]);
	expect(JSON.parse(request.mock.calls[0][1].body).brand).toBe("");
});

it("does not convert a timeout to an empty successful observation or retry submission", async () => {
	vi.stubEnv("BROWSER_RUNNER_TOKEN", "local-test-token");
	const request = vi
		.fn()
		.mockResolvedValue(new Response(JSON.stringify({ status: "timeout", partialAnswer: "partial" })));
	vi.stubGlobal("fetch", request);
	await expect(beatBrowser.run("gemini", "best providers", {})).rejects.toThrow("did not complete");
	expect(request).toHaveBeenCalledTimes(1);
	expect(extractTextContent({ status: "timeout", answer: "partial" }, "beat-browser")).toBe("");
});

it("rejects a remote collector before sending the local credential", async () => {
	vi.stubEnv("BROWSER_RUNNER_TOKEN", "local-test-token");
	vi.stubEnv("BROWSER_RUNNER_URL", "https://example.com");
	const request = vi.fn();
	vi.stubGlobal("fetch", request);
	await expect(beatBrowser.run("chatgpt", "best providers", {})).rejects.toThrow("local HTTP");
	expect(request).not.toHaveBeenCalled();
});
