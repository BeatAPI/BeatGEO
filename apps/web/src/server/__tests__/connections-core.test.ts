import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ transaction: vi.fn(), encrypt: vi.fn(), refresh: vi.fn(), credential: vi.fn() }));
vi.mock("@workspace/lib/db/db", () => ({ db: { transaction: mocked.transaction } }));
vi.mock("@workspace/lib/db/schema", () => ({ secrets: { name: "name" } }));
vi.mock("@workspace/lib/secrets", () => ({
	encryptCredential: mocked.encrypt,
	refreshCredentialOverlay: mocked.refresh,
	getCredential: mocked.credential,
}));

import { browserRequest, connectionSummary, disconnectBeatApi, inspectBeatApi, saveBeatApi } from "../connections-core";

const request = vi.fn();
beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal("fetch", request);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});
function access() {
	request
		.mockResolvedValueOnce(Response.json({ balance: 1 }))
		.mockResolvedValueOnce(Response.json({ data: [{ id: "text-model" }, { id: 9 }] }));
}

describe("BeatAPI connection", () => {
	it("checks access and lists models without a generation request or redirect", async () => {
		access();
		expect(await inspectBeatApi("test-only-key")).toEqual(["text-model"]);
		expect(request.mock.calls.map(([url]) => url)).toEqual([
			"https://api.beatapi.io/v1/usage",
			"https://api.beatapi.io/v1/models",
		]);
		for (const [, options] of request.mock.calls) expect(options.redirect).toBe("error");
	});
	it("saves a key without a model or a remote API call", async () => {
		mocked.transaction.mockImplementation(async (run) =>
			run({ insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }) }),
		);
		mocked.credential.mockReturnValue(undefined);
		await expect(saveBeatApi("test-only-key")).resolves.toMatchObject({ saved: true, verified: false });
		expect(request).not.toHaveBeenCalled();
		expect(mocked.encrypt).toHaveBeenCalledWith("BEATAPI_RESEARCH_MODEL", "");
	});
	it("rejects malformed credentials before persisting or making requests", async () => {
		await expect(saveBeatApi("key with spaces")).rejects.toThrow("without spaces");
		await expect(saveBeatApi("short")).rejects.toThrow("valid BeatAPI key");
		expect(mocked.encrypt).not.toHaveBeenCalled();
		expect(mocked.transaction).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});
	it("disconnects with encrypted empty overrides instead of reactivating environment credentials", async () => {
		mocked.transaction.mockImplementation(async (run) =>
			run({ insert: () => ({ values: () => ({ onConflictDoUpdate: async () => {} }) }) }),
		);
		await disconnectBeatApi();
		expect(mocked.encrypt.mock.calls).toEqual([
			["BEATAPI_API_KEY", ""],
			["BEATAPI_RESEARCH_MODEL", ""],
		]);
		expect(mocked.refresh).toHaveBeenCalledOnce();
		expect(request).not.toHaveBeenCalled();
	});
	it("encrypts both values and commits them together before refreshing workers' source", async () => {
		mocked.encrypt.mockImplementation(async (name) => `encrypted:${name}`);
		const entries: unknown[] = [];
		mocked.transaction.mockImplementation(async (run) =>
			run({
				insert: () => ({
					values: (value: unknown) => {
						entries.push(value);
						return { onConflictDoUpdate: async () => {} };
					},
				}),
			}),
		);
		await saveBeatApi("test-only-key", "text-model");
		expect(entries).toEqual([
			{ name: "BEATAPI_API_KEY", encryptedValue: "encrypted:BEATAPI_API_KEY" },
			{ name: "BEATAPI_RESEARCH_MODEL", encryptedValue: "encrypted:BEATAPI_RESEARCH_MODEL" },
		]);
		expect(mocked.transaction).toHaveBeenCalledTimes(1);
		expect(mocked.refresh).toHaveBeenCalledTimes(1);
	});
	it("never returns the saved key in connection status", () => {
		mocked.credential.mockImplementation((name) =>
			name === "BEATAPI_API_KEY" ? "test-only-private-value" : "text-model",
		);
		expect(connectionSummary().keyHint).toBe("test••••");
		expect(JSON.stringify(connectionSummary())).not.toContain("private-value");
	});
	it("sanitizes network failures", async () => {
		request.mockRejectedValueOnce(new Error("test-only-private-value"));
		await expect(inspectBeatApi("test-only-key")).rejects.toThrow("Could not reach BeatAPI");
	});
});
describe("local browser connection", () => {
	it("refuses remote runners without sending the local token", async () => {
		vi.stubEnv("BROWSER_RUNNER_URL", "https://example.com");
		await expect(browserRequest("/api/browser")).rejects.toThrow("this computer");
		expect(request).not.toHaveBeenCalled();
	});
	it("reports offline separately from a connected service with no extension", async () => {
		vi.stubEnv("BROWSER_RUNNER_URL", "http://127.0.0.1:4319");
		request.mockRejectedValueOnce(new Error("ECONNREFUSED"));
		expect((await browserRequest("/api/browser")).online).toBe(false);
		request.mockResolvedValueOnce(Response.json({ profiles: [] }));
		expect(await browserRequest("/api/browser")).toMatchObject({ online: true, profiles: [] });
	});
});
