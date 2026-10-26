import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret, getKeyring } from "@workspace/lib/secrets";
import { GA_SCOPE } from "@workspace/lib/traffic/ga";
import { z } from "zod";

export const GA_COOKIE = "beatgeo-ga-oauth";
const pendingSchema = z.object({
	brandId: z.string(),
	userId: z.string(),
	sessionId: z.string(),
	returnTo: z.string().startsWith("/app/"),
	state: z.string(),
	verifier: z.string(),
	expiresAt: z.number(),
});
export type GaTokens = { accessToken: string; refreshToken: string; expiresAt: number };
export function gaClient() {
	const id = process.env.GA_CLIENT_ID;
	const secret = process.env.GA_CLIENT_SECRET;
	const app = new URL(process.env.APP_URL || "http://localhost:3000");
	if (app.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(app.hostname))
		throw new Error("GA requires HTTPS outside localhost.");
	return { id, secret, redirect: new URL("/api/traffic/ga/callback", app).href, secure: app.protocol === "https:" };
}
function keyring() {
	const keys = getKeyring();
	if (!keys) throw new Error("The workspace encryption key is required to connect GA.");
	return keys;
}
export async function sealGa(value: unknown, context: string) {
	return encryptSecret(JSON.stringify(value), { key: keyring().primary, aad: `ga:${context}` });
}
export async function openGa(value: string, context: string): Promise<unknown> {
	return JSON.parse(await decryptSecret(value, { keyring: keyring(), aad: `ga:${context}` }));
}
export async function beginGaOAuth(
	input: { brandId: string; userId: string; sessionId: string; returnTo: string },
	now = Date.now(),
) {
	const client = gaClient();
	if (!client.id || !client.secret)
		throw new Error("The workspace owner needs to configure the Google Analytics connection first.");
	const state = randomBytes(32).toString("base64url"),
		verifier = randomBytes(48).toString("base64url");
	const cookie = await sealGa({ ...input, state, verifier, expiresAt: now + 600000 }, "oauth");
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	for (const [key, value] of Object.entries({
		client_id: client.id,
		redirect_uri: client.redirect,
		response_type: "code",
		scope: GA_SCOPE,
		state,
		code_challenge: createHash("sha256").update(verifier).digest("base64url"),
		code_challenge_method: "S256",
		access_type: "offline",
		prompt: "consent",
	}))
		url.searchParams.set(key, value);
	return { url: url.href, cookie };
}
export async function validateGaOAuth(
	cookie: string,
	state: string,
	userId: string,
	sessionId: string,
	now = Date.now(),
) {
	const pending = pendingSchema.parse(await openGa(cookie, "oauth"));
	const actual = Buffer.from(state),
		expected = Buffer.from(pending.state);
	if (
		pending.expiresAt < now ||
		pending.userId !== userId ||
		pending.sessionId !== sessionId ||
		actual.length !== expected.length ||
		!timingSafeEqual(actual, expected)
	)
		throw new Error("GA authorization expired or does not belong to this session. Connect again.");
	return pending;
}
export async function requestGaTokens(fields: Record<string, string>, fetchImpl: typeof fetch = fetch) {
	const client = gaClient();
	if (!client.id || !client.secret) throw new Error("Google Analytics is not configured.");
	let response: Response;
	try {
		response = await fetchImpl("https://oauth2.googleapis.com/token", {
			method: "POST",
			redirect: "error",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ ...fields, client_id: client.id, client_secret: client.secret }),
			signal: AbortSignal.timeout(30000),
		});
	} catch {
		throw new Error("Could not reach Google authorization. Try again.");
	}
	if (!response.ok) throw new Error("Google authorization expired or was revoked. Reconnect GA.");
	const body = await readTokenResponse(response);
	if (body.scope && !body.scope.split(" ").includes(GA_SCOPE))
		throw new Error("Analytics read-only access was not granted.");
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
		throw new Error("Google returned an invalid authorization response. Reconnect GA.");
	}
}
export async function exchangeGaCode(code: string, verifier: string) {
	const result = await requestGaTokens({
		grant_type: "authorization_code",
		code,
		code_verifier: verifier,
		redirect_uri: gaClient().redirect,
	});
	if (!result.refreshToken || !result.scope?.split(" ").includes(GA_SCOPE))
		throw new Error("Offline Analytics read-only access was not granted. Reconnect GA.");
	return { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
}
export async function usableGaTokens(encrypted: string, brandId: string): Promise<GaTokens> {
	const tokens = z
		.object({ accessToken: z.string(), refreshToken: z.string(), expiresAt: z.number() })
		.parse(await openGa(encrypted, brandId));
	if (tokens.expiresAt > Date.now() + 60000) return tokens;
	const result = await requestGaTokens({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
	return { ...result, refreshToken: result.refreshToken || tokens.refreshToken };
}
