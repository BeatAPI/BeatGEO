import { timingSafeEqual } from "node:crypto";

/** HTTP methods that mutate state */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Blocked outright: issuance goes through the server function that validates
 * the key's brand narrowing. */
const API_KEY_PLUGIN_MUTATIONS = new Set([
	"/api/auth/api-key/create",
	"/api/auth/api-key/update",
	"/api/auth/api-key/delete",
]);

export type DeploymentPolicyResult =
	| { action: "allow" }
	| {
			action: "block";
			status: 401 | 403 | 404;
			error: string;
			message: string;
			code?: string;
	  }
	| { action: "serve-openapi" };

export interface RequestInfo {
	pathname: string;
	method: string;
	authorizationHeader?: string | null;
}

/** Doors onto things the app only ever does server-side. */
function refuseAuthEndpoint(pathname: string, isWriteMethod: boolean): DeploymentPolicyResult | null {
	if (API_KEY_PLUGIN_MUTATIONS.has(pathname.replace(/\/$/, ""))) {
		return {
			action: "block",
			status: 403,
			error: "Forbidden",
			message: "API keys are issued from the dashboard, not over this endpoint",
		};
	}

	if (pathname.startsWith("/api/auth/organization/") && isWriteMethod) {
		return {
			action: "block",
			status: 403,
			error: "Forbidden",
			message: "Organization mutations are not available via the API",
		};
	}

	return null;
}

/** Coarse: this only keeps an unmatched /api/v1 request from falling through to
 *  the SPA and answering with HTML. */
function refuseUnauthenticatedApiV1(
	pathname: string,
	authorizationHeader: string | null | undefined,
): DeploymentPolicyResult | null {
	if (!pathname.startsWith("/api/v1/")) return null;
	if (pathname === "/api/v1/docs" || pathname === "/api/v1/docs/") return null;
	if (hasBearerToken(authorizationHeader)) return null;

	return {
		action: "block",
		status: 401,
		error: "Unauthorized",
		message: "Valid API key required as Bearer token in Authorization header",
		code: "unauthorized",
	};
}

/**
 * No /api/v1 authentication: resolving a key needs a database, and this is pure
 * and synchronous. createApiHandler is the gate for those routes.
 */
export function evaluateDeploymentPolicy(request: RequestInfo): DeploymentPolicyResult {
	const { pathname, method, authorizationHeader } = request;
	const isWriteMethod = WRITE_METHODS.has(method);

	const authEndpointRefusal = refuseAuthEndpoint(pathname, isWriteMethod);
	if (authEndpointRefusal) return authEndpointRefusal;

	const isOpenApi = pathname === "/api/v1/openapi.json" || pathname === "/api/v1/openapi.json/";
	if (isOpenApi && method === "GET") return { action: "serve-openapi" };

	return refuseUnauthenticatedApiV1(pathname, authorizationHeader) ?? { action: "allow" };
}

/**
 * Constant-time string comparison to prevent timing attacks on API keys.
 * Returns true if the strings are equal, false otherwise.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		// Compare against itself to consume constant time, then return false
		timingSafeEqual(bufA, bufA);
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

/**
 * A shape check only. Whether the token is *valid* needs a database lookup and
 * belongs to createApiHandler.
 */
function hasBearerToken(header: string | null | undefined): boolean {
	return typeof header === "string" && header.startsWith("Bearer ") && header.slice(7).trim().length > 0;
}

/**
 * Parse comma-separated ADMIN_API_KEYS env var into a trimmed, non-empty array.
 * Single source of truth — use this everywhere instead of inline parsing.
 */
export function getAdminApiKeys(): string[] {
	return (process.env.ADMIN_API_KEYS || "")
		.split(",")
		.map((key) => key.trim())
		.filter(Boolean);
}
