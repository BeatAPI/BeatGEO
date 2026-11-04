import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret, getKeyring } from "@workspace/lib/secrets";
import { GSC_SCOPE } from "@workspace/lib/traffic/gsc";
import { z } from "zod";
import { googleClient } from "./google-client";

export const GSC_COOKIE = "beatgeo-gsc-oauth";
const pendingSchema = z.object({
	brandId: z.string(),
	userId: z.string(),
	sessionId: z.string(),
	returnTo: z.string().startsWith("/app/"),
	state: z.string(),
	verifier: z.string(),
	expiresAt: z.number(),
});
export type GscTokens = { accessToken: string; refreshToken: string; expiresAt: number; oauthClientId?: string };
export function gscClient() {
	return googleClient("/api/traffic/gsc/callback");
}

function keyring() {
	const keys = getKeyring();
	if (!keys) throw new Error("The workspace encryption key is required to connect Search Console.");
	return keys;
}
export async function sealGsc(value: unknown, context: string) {
	return encryptSecret(JSON.stringify(value), { key: keyring().primary, aad: `gsc:${context}` });
}
export async function openGsc(value: string, context: string): Promise<unknown> {
	return JSON.parse(await decryptSecret(value, { keyring: keyring(), aad: `gsc:${context}` }));
}
export async function beginGscOAuth(
	input: { brandId: string; userId: string; sessionId: string; returnTo: string },
	now = Date.now(),
) {
	const client = gscClient();
	if (!client.ready || !client.id)
		throw new Error("The workspace owner needs to configure the Google Search Console connection first.");
	const state = randomBytes(32).toString("base64url"),
		verifier = randomBytes(48).toString("base64url");
	const cookie = await sealGsc({ ...input, state, verifier, expiresAt: now + 600000 }, "oauth");
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	for (const [key, value] of Object.entries({
		client_id: client.id,
		redirect_uri: client.redirect,
		response_type: "code",
		scope: GSC_SCOPE,
		state,
		code_challenge: createHash("sha256").update(verifier).digest("base64url"),
		code_challenge_method: "S256",
		access_type: "offline",
		prompt: "consent",
	}))
		url.searchParams.set(key, value);
	return { url: url.href, cookie };
}
export async function validateGscOAuth(
	cookie: string,
	state: string,
	userId: string,
	sessionId: string,
	now = Date.now(),
) {
	const pending = pendingSchema.parse(await openGsc(cookie, "oauth"));
	const actual = Buffer.from(state),
		expected = Buffer.from(pending.state);
	if (
		pending.expiresAt < now ||
		pending.userId !== userId ||
		pending.sessionId !== sessionId ||
		actual.length !== expected.length ||
		!timingSafeEqual(actual, expected)
	)
		throw new Error("Search Console authorization expired or does not belong to this session. Connect again.");
	return pending;
}
export async function requestGscTokens(fields: Record<string, string>, fetchImpl: typeof fetch = fetch) {
	const client = gscClient();
	if (!client.ready || !client.id) throw new Error("Google Search Console is not configured.");
	let response: Response;
	try {
		response = await fetchImpl("https://oauth2.googleapis.com/token", {
			method: "POST",
			redirect: "error",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				...fields,
				client_id: client.id,
				...(client.secret ? { client_secret: client.secret } : {}),
			}),
			signal: AbortSignal.timeout(30000),
		});
	} catch {
		throw new Error("Could not reach Google authorization. Try again.");
	}
	if (!response.ok) throw new Error("Google authorization expired or was revoked. Reconnect Search Console.");
	const body = await readTokenResponse(response);
	if (body.scope && !body.scope.split(" ").includes(GSC_SCOPE))
		throw new Error("Search Console read-only access was not granted.");
	return {
		accessToken: body.access_token,
		refreshToken: body.refresh_token,
		expiresAt: Date.now() + body.expires_in * 1000,
		scope: body.scope,
	};
}
async function readTokenResponse(response: Response) {
	try {
		return z
			.object({
				access_token: z.string().min(1),
				refresh_token: z.string().optional(),
				expires_in: z.number().positive(),
				scope: z.string().optional(),
				token_type: z.string().optional(),
			})
			.parse(await response.json());
	} catch {
		throw new Error("Google returned an invalid authorization response. Reconnect Search Console.");
	}
}
export async function exchangeGscCode(code: string, verifier: string) {
	const result = await requestGscTokens({
		grant_type: "authorization_code",
		code,
		code_verifier: verifier,
		redirect_uri: gscClient().redirect,
	});
	if (!result.refreshToken || !result.scope?.split(" ").includes(GSC_SCOPE))
		throw new Error("Offline Search Console read-only access was not granted. Reconnect Search Console.");
	return {
		accessToken: result.accessToken,
		refreshToken: result.refreshToken,
		expiresAt: result.expiresAt,
		oauthClientId: gscClient().id,
	};
}
export async function usableGscTokens(encrypted: string, brandId: string): Promise<GscTokens> {
	const tokens = z
		.object({
			accessToken: z.string(),
			refreshToken: z.string(),
			expiresAt: z.number(),
			oauthClientId: z.string().optional(),
		})
		.parse(await openGsc(encrypted, brandId));
	if (tokens.oauthClientId && tokens.oauthClientId !== gscClient().id)
		throw new Error("Google connection changed. Connect Google again.");
	if (tokens.expiresAt > Date.now() + 60000) return tokens;
	const result = await requestGscTokens({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
	return { ...result, refreshToken: result.refreshToken || tokens.refreshToken, oauthClientId: tokens.oauthClientId };
}
