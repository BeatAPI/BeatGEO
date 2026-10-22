import { afterEach, expect, it, vi } from "vitest";
import { extractCitations, extractTextContent } from "../../text-extraction";
import { beatBrowser } from "./beat-browser";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it("polls the accepted browser run without resubmitting while a long answer is generated", async () => {
	vi.useFakeTimers();
	vi.stubEnv("BROWSER_RUNNER_TOKEN", "local-test-token");
	const id = "11111111-1111-4111-8111-111111111111";
	const request = vi
		.fn()
		.mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, runId: id }), { status: 202 }))
		.mockResolvedValueOnce(new Response(JSON.stringify({ id, status: "waiting" })))
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ id, status: "completed", answer: "A finished answer.", citations: [] })),
		);
	vi.stubGlobal("fetch", request);
	const operation = beatBrowser.run("chatgpt", "best providers", {});
	await vi.advanceTimersByTimeAsync(4000);
	expect((await operation).textContent).toBe("A finished answer.");
	expect(request).toHaveBeenCalledTimes(3);
	expect(request.mock.calls.filter((call) => call[1].method === "POST")).toHaveLength(1);
	expect(request.mock.calls[0][1].headers.Prefer).toBe("respond-async");
	expect(request.mock.calls.slice(1).every((call) => call[0].pathname === `/api/collect/${id}`)).toBe(true);
});

it("does not resubmit when the runner disappears after accepting a browser task", async () => {
	vi.useFakeTimers();
	vi.stubEnv("BROWSER_RUNNER_TOKEN", "local-test-token");
	const request = vi
		.fn()
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ runId: "11111111-1111-4111-8111-111111111111" }), { status: 202 }),
		)
		.mockResolvedValueOnce(new Response("not found", { status: 404 }));
	vi.stubGlobal("fetch", request);
	const rejected = expect(beatBrowser.run("chatgpt", "best providers", {})).rejects.toThrow("did not complete");
	await vi.advanceTimersByTimeAsync(2000);
	await rejected;
	expect(request).toHaveBeenCalledTimes(2);
	expect(request.mock.calls.filter((call) => call[1].method === "POST")).toHaveLength(1);
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
