import { createHash } from "node:crypto";
import { GA_SCOPE } from "@workspace/lib/traffic/ga";
import { GSC_SCOPE } from "@workspace/lib/traffic/gsc";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sealGa, usableGaTokens } from "../ga-oauth-core";
import { googleClient } from "../google-client";
import { beginGoogleOAuth, exchangeGoogleCode, validateGoogleOAuth } from "../google-oauth-core";
import { sealGsc, usableGscTokens } from "../gsc-oauth-core";

const input = { brandId: "brand-a", userId: "user-a", sessionId: "session-a", returnTo: "/app/org/a/brand/a/traffic" };
beforeEach(() => {
	vi.stubEnv("GA_CLIENT_ID", "");
	vi.stubEnv("GA_CLIENT_SECRET", "");
	vi.stubEnv("GOOGLE_DESKTOP_CLIENT_ID", "desktop-test.apps.googleusercontent.com");
	vi.stubEnv("GOOGLE_DESKTOP_CLIENT_SECRET", "desktop-test-secret");
	vi.stubEnv("APP_URL", "http://localhost:3140");
	vi.stubEnv("BEAT_GEO_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});
it("requests both read-only scopes with PKCE without a distributed web secret", async () => {
	const flow = await beginGoogleOAuth(input, 1000),
		url = new URL(flow.url);
	expect(new Set(url.searchParams.get("scope")?.split(" "))).toEqual(new Set([GA_SCOPE, GSC_SCOPE]));
	expect(url.searchParams.has("client_secret")).toBe(false);
	const pending = await validateGoogleOAuth(
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
		["wrong", input.userId, input.sessionId, 2000],
		[pending.state, "other", input.sessionId, 2000],
		[pending.state, input.userId, "other", 2000],
		[pending.state, input.userId, input.sessionId, 9999999],
	] as const)
		await expect(validateGoogleOAuth(flow.cookie, state, user, session, now)).rejects.toThrow();
	vi.stubEnv("GOOGLE_DESKTOP_CLIENT_ID", "different.apps.googleusercontent.com");
	await expect(validateGoogleOAuth(flow.cookie, pending.state, input.userId, input.sessionId, 2000)).rejects.toThrow();
});
it("records only permissions Google actually granted and sends the PKCE verifier", async () => {
	const api = vi.fn<typeof fetch>(async () =>
		Response.json({ access_token: "private", refresh_token: "refresh", expires_in: 3600, scope: GSC_SCOPE }),
	);
	const grant = await exchangeGoogleCode("code", "verifier", api);
	expect(grant.gsc).toBe(true);
	expect(grant.ga).toBe(false);
	const body = api.mock.calls[0][1]?.body as URLSearchParams;
	expect(body.get("code_verifier")).toBe("verifier");
	expect(body.get("client_secret")).toBe("desktop-test-secret");
	api.mockResolvedValueOnce(
		Response.json({
			access_token: "private",
			refresh_token: "refresh",
			expires_in: 3600,
			scope: `${GA_SCOPE} ${GSC_SCOPE}`,
		}),
	);
	expect(await exchangeGoogleCode("code", "verifier", api)).toMatchObject({ ga: true, gsc: true });
	api.mockResolvedValueOnce(new Response("sensitive-provider-error", { status: 400 }));
	await expect(exchangeGoogleCode("code", "verifier", api)).rejects.toThrow("could not be completed");
	api.mockResolvedValueOnce(
		Response.json({ access_token: "private", expires_in: 3600, scope: `${GA_SCOPE} ${GSC_SCOPE}` }),
	);
	await expect(exchangeGoogleCode("code", "verifier", api)).rejects.toThrow("offline");
});
it("sends configured desktop credentials only to the token endpoint", async () => {
	vi.stubEnv("GOOGLE_DESKTOP_CLIENT_SECRET", "desktop-secret");
	const flow = await beginGoogleOAuth(input, 1000);
	expect(new URL(flow.url).searchParams.has("client_secret")).toBe(false);
	const api = vi.fn<typeof fetch>(async () =>
		Response.json({ access_token: "private", refresh_token: "refresh", expires_in: 3600, scope: GSC_SCOPE }),
	);
	await exchangeGoogleCode("code", "verifier", api);
	const body = api.mock.calls[0][1]?.body as URLSearchParams;
	expect(body.get("client_secret")).toBe("desktop-secret");
	expect(body.get("code_verifier")).toBe("verifier");
});
it("refreshes either service with the shared desktop grant and rejects changed clients", async () => {
	const tokens = {
		accessToken: "old",
		refreshToken: "refresh",
		expiresAt: 0,
		oauthClientId: "desktop-test.apps.googleusercontent.com",
	};
	const api = vi.fn(async () =>
		Response.json({ access_token: "new", expires_in: 3600, scope: `${GA_SCOPE} ${GSC_SCOPE}` }),
	);
	vi.stubGlobal("fetch", api);
	const ga = await sealGa(tokens, input.brandId),
		gsc = await sealGsc(tokens, input.brandId);
	for (const result of [await usableGaTokens(ga, input.brandId), await usableGscTokens(gsc, input.brandId)]) {
		expect(result.accessToken).toBe("new");
		expect(result.refreshToken).toBe("refresh");
		expect(result.oauthClientId).toBe(tokens.oauthClientId);
	}
	vi.stubEnv("GOOGLE_DESKTOP_CLIENT_ID", "changed.apps.googleusercontent.com");
	await expect(usableGaTokens(ga, input.brandId)).rejects.toThrow("changed");
	await expect(usableGscTokens(gsc, input.brandId)).rejects.toThrow("changed");
	expect(api).toHaveBeenCalledTimes(2);
});
it("allows the bundled desktop client only on local loopback and keeps web credentials private", () => {
	expect(googleClient("/callback").ready).toBe(true);
	vi.stubEnv("APP_URL", "https://example.com");
	expect(googleClient("/callback").ready).toBe(false);
	vi.stubEnv("GA_CLIENT_ID", "web-client");
	expect(googleClient("/callback").ready).toBe(false);
	vi.stubEnv("GA_CLIENT_SECRET", "web-secret");
	expect(googleClient("/callback").ready).toBe(true);
	vi.stubEnv("APP_URL", "http://example.com");
	expect(() => googleClient("/callback")).toThrow("HTTPS");
});

it("authorizes and refreshes both services without user-supplied Google configuration", async () => {
	vi.stubEnv("GOOGLE_DESKTOP_CLIENT_ID", "");
	vi.stubEnv("GOOGLE_DESKTOP_CLIENT_SECRET", "");
	const client = googleClient("/callback");
	expect(client.ready).toBe(true);
	const flow = await beginGoogleOAuth(input, 1000);
	const url = new URL(flow.url);
	expect(url.searchParams.get("client_id")).toBe(client.id);
	expect(url.searchParams.has("client_secret")).toBe(false);
	const api = vi.fn<typeof fetch>(async (_url, init) => {
		const body = init?.body as URLSearchParams;
		expect(body.get("client_id")).toBe(client.id);
		expect(body.get("client_secret")).toBeTruthy();
		return Response.json({
			access_token: "new",
			refresh_token: "refresh",
			expires_in: 3600,
			scope: `${GA_SCOPE} ${GSC_SCOPE}`,
		});
	});
	const grant = await exchangeGoogleCode("code", "verifier", api);
	expect(grant).toMatchObject({ ga: true, gsc: true });
	vi.stubGlobal("fetch", api);
	const tokens = { ...grant.tokens, expiresAt: 0 };
	for (const result of [
		await usableGaTokens(await sealGa(tokens, input.brandId), input.brandId),
		await usableGscTokens(await sealGsc(tokens, input.brandId), input.brandId),
	])
		expect(result.accessToken).toBe("new");
	expect(api).toHaveBeenCalledTimes(3);
});

it("never pairs a custom desktop client with bundled credentials", async () => {
	vi.stubEnv("GOOGLE_DESKTOP_CLIENT_SECRET", "");
	expect(googleClient("/callback").secret).toBeUndefined();
	expect(googleClient("/callback").ready).toBe(false);
	await expect(beginGoogleOAuth(input)).rejects.toThrow("not available");
	vi.stubEnv("GOOGLE_DESKTOP_CLIENT_ID", "");
	vi.stubEnv("GA_CLIENT_ID", "web-client");
	expect(googleClient("/callback").secret).toBe("");
	expect(googleClient("/callback").ready).toBe(false);
});
