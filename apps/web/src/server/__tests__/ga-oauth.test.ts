import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { beginGaOAuth, openGa, requestGaTokens, sealGa, usableGaTokens, validateGaOAuth } from "../ga-oauth-core";

beforeEach(() => {
	vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
	vi.stubEnv("GA_CLIENT_ID", "test.apps.googleusercontent.com");
	vi.stubEnv("GA_CLIENT_SECRET", "test-only-secret");
	vi.stubEnv("APP_URL", "http://localhost:3000");
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
const scope = "https://www.googleapis.com/auth/analytics.readonly";
it("binds read-only PKCE consent to this user's browser session and brand", async () => {
	const input = {
		brandId: "brand-a",
		userId: "user-a",
		sessionId: "session-a",
		returnTo: "/app/org/a/brand/a/traffic",
	};
	const flow = await beginGaOAuth(input, 1000);
	const url = new URL(flow.url);
	expect(url.searchParams.get("scope")).toBe(scope);
	expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/traffic/ga/callback");
	const pending = await validateGaOAuth(
		flow.cookie,
		url.searchParams.get("state")!,
		input.userId,
		input.sessionId,
		2000,
	);
	expect(createHash("sha256").update(pending.verifier).digest("base64url")).toBe(
		url.searchParams.get("code_challenge"),
	);
	for (const [state, user, session, now] of [
		["wrong", "user-a", "session-a", 2000],
		[pending.state, "user-b", "session-a", 2000],
		[pending.state, "user-a", "session-b", 2000],
		[pending.state, "user-a", "session-a", 9999999],
	] as const)
		await expect(validateGaOAuth(flow.cookie, state, user, session, now)).rejects.toThrow();
});
it("encrypts credentials with brand binding instead of exposing tokens to the browser", async () => {
	const sealed = await sealGa({ refreshToken: "private-token" }, "brand-a");
	expect(sealed).not.toContain("private-token");
	expect(await openGa(sealed, "brand-a")).toEqual({ refreshToken: "private-token" });
	await expect(openGa(sealed, "brand-b")).rejects.toThrow();
});
it("refreshes expired grants and keeps an existing refresh token", async () => {
	const encrypted = await sealGa(
		{ accessToken: "old-token", refreshToken: "private-refresh", expiresAt: 0 },
		"brand-a",
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json({ access_token: "new-token", expires_in: 3600, scope })),
	);
	const tokens = await usableGaTokens(encrypted, "brand-a");
	expect(tokens.refreshToken).toBe("private-refresh");
	expect(tokens.accessToken).toBe("new-token");
});
it("rejects insufficient scope and redacts Google's error body", async () => {
	const api = vi.fn<typeof fetch>(async () => new Response("private-secret", { status: 400 }));
	await expect(requestGaTokens({ code: "private-code" }, api)).rejects.toThrow("Reconnect GA");
	api.mockResolvedValueOnce(Response.json({ access_token: "token", expires_in: 3600, scope: "openid" }));
	await expect(requestGaTokens({}, api)).rejects.toThrow("read-only");
});
