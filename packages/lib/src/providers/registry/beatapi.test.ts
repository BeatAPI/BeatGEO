import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { extractTextContent } from "../../text-extraction";
import { beatapi } from "./beatapi";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});
const completion = (content: string, finish = "stop") =>
	new Response(JSON.stringify({ model: "test-model", choices: [{ finish_reason: finish, message: { content } }] }));

it("uses the configured BeatAPI model for structured analysis with no extra searches", async () => {
	vi.stubEnv("BEATAPI_API_KEY", "test-key");
	vi.stubEnv("BEATAPI_RESEARCH_MODEL", "test-model");
	const request = vi.fn().mockResolvedValue(completion('{"summary":"useful"}'));
	vi.stubGlobal("fetch", request);
	const result = await beatapi.runStructuredResearch!({
		prompt: "Analyze evidence",
		schema: z.object({ summary: z.string() }),
		webSearch: false,
	});
	expect(result.object).toEqual({ summary: "useful" });
	expect(request).toHaveBeenCalledTimes(1);
	expect(request.mock.calls[0][0]).toBe("https://api.beatapi.io/v1/chat/completions");
	expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer test-key" } });
});

it("reads search leads before using them as bounded research evidence", async () => {
	vi.stubEnv("BEATAPI_API_KEY", "test-key");
	vi.stubEnv("BEATAPI_RESEARCH_MODEL", "test-model");
	const request = vi
		.fn()
		.mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ url: "https://example.com" }] })))
		.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					request_id: "read-1",
					results: [{ url: "https://example.com", content: "Product facts" }],
					failed: [],
				}),
			),
		)
		.mockResolvedValueOnce(completion('{"summary":"grounded"}'));
	vi.stubGlobal("fetch", request);
	await beatapi.runStructuredResearch!({
		prompt: "Research https://example.com",
		schema: z.object({ summary: z.string() }),
	});
	expect(request.mock.calls.map((call) => call[0])).toEqual([
		"https://api.beatapi.io/v1/web/search",
		"https://api.beatapi.io/v1/web/read",
		"https://api.beatapi.io/v1/chat/completions",
	]);
	expect(request.mock.calls[2][1].body).toContain("read-1");
});

it.each([401, 402, 429, 500])("sanitizes HTTP %s and never automatically repeats paid work", async (status) => {
	vi.stubEnv("BEATAPI_API_KEY", "test-key");
	const request = vi.fn().mockResolvedValue(new Response("private supplier message", { status }));
	vi.stubGlobal("fetch", request);
	await expect(beatapi.run("api-simulation", "test", { version: "test-model" })).rejects.toThrow(`(${status})`);
	expect(request).toHaveBeenCalledTimes(1);
});

it("rejects empty or truncated observations", async () => {
	vi.stubEnv("BEATAPI_API_KEY", "test-key");
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValueOnce(completion("partial", "length")).mockResolvedValueOnce(completion("")),
	);
	await expect(beatapi.run("api-simulation", "test", { version: "test-model" })).rejects.toThrow("complete answer");
	await expect(beatapi.run("api-simulation", "test", { version: "test-model" })).rejects.toThrow("empty answer");
});

it("keeps API simulations readable and separate from consumer web observations", async () => {
	vi.stubEnv("BEATAPI_API_KEY", "test-key");
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion("Example answer")));
	const result = await beatapi.run("api-simulation", "test", { version: "test-model" });
	expect(extractTextContent(result.rawOutput, "beatapi")).toBe("Example answer");
	expect(result.citations).toEqual([]);
	expect(beatapi.access).toBe("api");
	await expect(beatapi.run("api-simulation", "test", { version: "test-model", webSearch: true })).rejects.toThrow(
		"no :online",
	);
});

it("rejects consumer-platform labels before making a paid request", async () => {
	const request = vi.fn();
	vi.stubGlobal("fetch", request);
	await expect(beatapi.run("chatgpt", "test", { version: "test-model" })).rejects.toThrow("api-simulation");
	expect(request).not.toHaveBeenCalled();
});
