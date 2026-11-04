import { createHash } from "node:crypto";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ACCOUNT_PAGES = new Set([
	"/auth/login",
	"/auth/register",
	"/auth/forgot-password",
	"/auth/reset-password",
	"/auth/logout",
]);
const AUTH_READS = new Set(["/api/auth/get-session", "/api/auth/jwks"]);
const GOOGLE_CALLBACKS = new Set([
	"/api/traffic/google/callback",
	"/api/traffic/ga/callback",
	"/api/traffic/gsc/callback",
]);

function isReturningNavigation(request: Request): boolean {
	const path = new URL(request.url).pathname;
	return (
		request.method === "GET" &&
		!request.headers.has("origin") &&
		request.headers.get("accept")?.includes("text/html") === true &&
		request.headers.get("sec-fetch-mode") === "navigate" &&
		request.headers.get("sec-fetch-dest") === "document" &&
		(GOOGLE_CALLBACKS.has(path) ||
			path === "/" ||
			path === "/brand" ||
			path === "/traffic" ||
			path === "/app" ||
			path.startsWith("/app/"))
	);
}

function resumeGoogleCallback(): Response {
	// Commit a local document before retrying: Strict session cookies are intentionally
	// absent on Google's cross-site redirect, but available on this same-origin navigation.
	const script = "location.replace(location.href)";
	const hash = createHash("sha256").update(script).digest("base64");
	return new Response(
		`<!doctype html><html lang="en"><title>BeatGEO</title><p>Completing your Google connection…</p><script>${script}</script></html>`,
		{
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
				"Referrer-Policy": "no-referrer",
				"Content-Security-Policy": `default-src 'none'; script-src 'sha256-${hash}'; frame-ancestors 'none'; base-uri 'none'`,
			},
		},
	);
}

function refusal(message: string, status = 403): Response {
	return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function localRequestRefusal(request: Request, appUrl: string): Response | null {
	const configured = new URL(appUrl);
	const url = new URL(request.url);
	if (!LOOPBACK.has(configured.hostname) || !["http:", "https:"].includes(configured.protocol))
		return refusal("The local workspace must use a loopback APP_URL.");
	if (!LOOPBACK.has(url.hostname) || url.port !== configured.port || url.protocol !== configured.protocol)
		return refusal("Local workspace requests must use this computer's configured address.");
	const host = request.headers.get("host");
	if (host && host !== url.host) return refusal("Invalid local host.");
	if (["forwarded", "x-forwarded-host", "x-forwarded-for"].some((header) => request.headers.has(header)))
		return refusal("The local workspace does not accept proxy requests.");
	const origin = request.headers.get("origin");
	if (origin && origin !== url.origin) return refusal("Cross-origin access to the local workspace is disabled.");
	const site = request.headers.get("sec-fetch-site");
	// OAuth redirects retain cross-site metadata through the final workspace redirect.
	// These document visits still require an existing session below; they never bootstrap one.
	if (site && !["same-origin", "none"].includes(site) && !isReturningNavigation(request))
		return refusal("Cross-site access to the local workspace is disabled.");
	return null;
}

function isBrowserNavigation(request: Request): boolean {
	return (
		request.method === "GET" &&
		request.headers.get("accept")?.includes("text/html") === true &&
		request.headers.get("sec-fetch-mode") === "navigate" &&
		request.headers.get("sec-fetch-dest") === "document" &&
		["none", "same-origin"].includes(request.headers.get("sec-fetch-site") ?? "")
	);
}

function canBootstrapLocalSession(request: Request, pathname: string): boolean {
	return (
		isBrowserNavigation(request) &&
		!pathname.startsWith("/_server") &&
		(!pathname.startsWith("/api/") || pathname === "/api/auth/oauth2/authorize")
	);
}

interface LocalRequestOptions {
	appUrl: string;
	getSession: (headers: Headers) => Promise<unknown>;
	bootstrap: (headers: Headers) => Promise<Response>;
	next: (request: Request) => Promise<Response> | Response;
}

function localAccountResponse(request: Request, pathname: string): Response | null {
	const sessionRead = request.method === "GET" && AUTH_READS.has(pathname);
	if (pathname.startsWith("/api/auth/") && !sessionRead && !pathname.startsWith("/api/auth/oauth2/"))
		return refusal("Account management is not available in the local workspace.", 404);
	if (ACCOUNT_PAGES.has(pathname)) return Response.redirect(new URL("/app", request.url), 302);
	return null;
}

function usesOwnAuthentication(request: Request, pathname: string): boolean {
	if (pathname === "/api/mcp" || ["/api/mcp/", "/api/v1/"].some((prefix) => pathname.startsWith(prefix))) return true;
	if (
		request.method === "GET" &&
		(pathname.startsWith("/.well-known/") || pathname === "/api/setup-status" || pathname === "/api/auth/jwks")
	)
		return true;
	return (
		pathname.startsWith("/api/auth/oauth2/") && !request.headers.has("origin") && !request.headers.has("sec-fetch-site")
	);
}

function isUntrustedWrite(request: Request): boolean {
	return (
		!["GET", "HEAD"].includes(request.method) &&
		request.headers.get("origin") !== new URL(request.url).origin &&
		request.headers.get("sec-fetch-site") !== "same-origin"
	);
}

/** All local UI requests cross the same gate, including server functions and raw routes. */
export async function handleLocalWorkspaceRequest(request: Request, options: LocalRequestOptions): Promise<Response> {
	const blocked = localRequestRefusal(request, options.appUrl);
	if (blocked) return blocked;
	let pathname: string;
	try {
		pathname = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, "") || "/";
	} catch {
		return refusal("Invalid local path.");
	}
	if (
		GOOGLE_CALLBACKS.has(pathname) &&
		isReturningNavigation(request) &&
		request.headers.get("sec-fetch-site") === "cross-site"
	)
		return resumeGoogleCallback();
	const accountResponse = localAccountResponse(request, pathname);
	if (accountResponse) return accountResponse;
	if (usesOwnAuthentication(request, pathname)) return options.next(request);
	if (isUntrustedWrite(request)) return refusal("Local writes require a same-origin browser request.");
	if (request.headers.has("cookie") && (await options.getSession(request.headers))) return options.next(request);
	if (!canBootstrapLocalSession(request, pathname))
		return refusal("BeatGEO is running. Open this address in your browser to use the workspace.", 401);
	const bootstrap = await options.bootstrap(request.headers);
	if (!bootstrap.ok)
		return refusal("The local workspace could not be opened. Check its database and configuration.", 503);
	const cookies = bootstrap.headers.getSetCookie();
	if (!cookies.length) return refusal("The local workspace could not establish a browser session.", 503);
	const headers = new Headers(request.headers);
	headers.set(
		"cookie",
		[...cookies.map((cookie) => cookie.split(";", 1)[0]), headers.get("cookie")].filter(Boolean).join("; "),
	);
	// Rebuilt from its parts: the server runtime's own Request cannot be passed to the Request
	// constructor, and this path only serves body-less GET navigations.
	const response = await options.next(
		new Request(request.url, { method: request.method, headers, signal: request.signal }),
	);
	const responseHeaders = new Headers(response.headers);
	for (const cookie of cookies) responseHeaders.append("set-cookie", cookie);
	responseHeaders.set("cache-control", "no-store");
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	});
}
