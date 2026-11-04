import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { GA_SCOPE } from "@workspace/lib/traffic/ga";
import { GSC_SCOPE } from "@workspace/lib/traffic/gsc";
import { z } from "zod";
import { type GaTokens, openGa, sealGa } from "./ga-oauth-core";
import { googleClient } from "./google-client";

export const GOOGLE_COOKIE = "beatgeo-google-oauth";
export const sharedGoogleClient = () => googleClient("/api/traffic/google/callback");
const pendingSchema = z.object({
	brandId: z.string(),
	userId: z.string(),
	sessionId: z.string(),
	returnTo: z.string().startsWith("/app/"),
	state: z.string(),
	verifier: z.string(),
	clientId: z.string(),
	redirect: z.string(),
	expiresAt: z.number(),
});
export type GoogleGrant = { tokens: GaTokens; ga: boolean; gsc: boolean };
export async function beginGoogleOAuth(
	input: { brandId: string; userId: string; sessionId: string; returnTo: string },
	now = Date.now(),
) {
	const client = sharedGoogleClient();
	if (!client.ready || !client.id) throw new Error("Google connection is not available in this build yet.");
	const state = randomBytes(32).toString("base64url");
	const verifier = randomBytes(48).toString("base64url");
	const pending = pendingSchema.parse({
		...input,
		state,
		verifier,
		clientId: client.id,
		redirect: client.redirect,
		expiresAt: now + 600000,
	});
	const cookie = await sealGa(pending, "google-oauth");
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.search = new URLSearchParams({
		client_id: client.id,
		redirect_uri: client.redirect,
		response_type: "code",
		scope: `${GSC_SCOPE} ${GA_SCOPE}`,
		state,
		code_challenge: createHash("sha256").update(verifier).digest("base64url"),
		code_challenge_method: "S256",
		access_type: "offline",
		prompt: "consent select_account",
	}).toString();
	return { url: url.href, cookie };
}
export async function validateGoogleOAuth(
	cookie: string,
	state: string,
	userId: string,
	sessionId: string,
	now = Date.now(),
) {
	const pending = pendingSchema.parse(await openGa(cookie, "google-oauth"));
	const client = sharedGoogleClient();
	const actual = Buffer.from(state),
		expected = Buffer.from(pending.state);
	if (
		!client.ready ||
		pending.clientId !== client.id ||
		pending.redirect !== client.redirect ||
		pending.expiresAt < now ||
		pending.userId !== userId ||
		pending.sessionId !== sessionId ||
		actual.length !== expected.length ||
		!timingSafeEqual(actual, expected)
	)
		throw new Error("Google authorization expired or does not belong to this session. Connect again.");
	return pending;
}
export async function exchangeGoogleCode(
	code: string,
	verifier: string,
	fetchImpl: typeof fetch = fetch,
): Promise<GoogleGrant> {
	const client = sharedGoogleClient();
	if (!client.ready || !client.id) throw new Error("Google connection is not available in this build yet.");
	let response: Response;
	try {
		response = await fetchImpl("https://oauth2.googleapis.com/token", {
			method: "POST",
			redirect: "error",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				code_verifier: verifier,
				redirect_uri: client.redirect,
				client_id: client.id,
				...(client.secret ? { client_secret: client.secret } : {}),
			}),
			signal: AbortSignal.timeout(30000),
		});
	} catch {
		throw new Error("Could not reach Google authorization. Try again.");
	}
	if (!response.ok) throw new Error("Google authorization could not be completed. Connect again.");
	const body = await readGrant(response);
	const scopes = new Set(body.scope.split(/\s+/));
	const ga = scopes.has(GA_SCOPE),
		gsc = scopes.has(GSC_SCOPE);
	if (!ga && !gsc) throw new Error("No Google data access was granted.");
	return {
		ga,
		gsc,
		tokens: {
			accessToken: body.access_token,
			refreshToken: body.refresh_token,
			expiresAt: Date.now() + body.expires_in * 1000,
			oauthClientId: client.id,
		},
	};
}
async function readGrant(response: Response) {
	try {
		return z
			.object({
				access_token: z.string().min(1),
				refresh_token: z.string().min(1),
				expires_in: z.number().positive(),
				scope: z.string().min(1),
			})
			.parse(await response.json());
	} catch {
		throw new Error("Google did not provide offline data access. Connect again and allow read-only access.");
	}
}
