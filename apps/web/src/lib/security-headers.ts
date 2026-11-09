// HSTS asserts HTTPS-only for the host that served the response. Browsers
// ignore it over plain HTTP, so it stays inert on localhost.
const strictTransportSecurity = "max-age=63072000; includeSubDomains";

const SECURITY_HEADERS: Record<string, string> = {
	"Content-Security-Policy": [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"font-src 'self' data:",
		"media-src 'self'",
		"worker-src 'self' blob:",
		"frame-src 'self'",
		"connect-src 'self'",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	].join("; "),
	"Strict-Transport-Security": strictTransportSecurity,
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	// same-origin-allow-popups (not same-origin) keeps OAuth/SSO popups that rely on
	// window.opener working while still isolating us from cross-origin openers.
	"Cross-Origin-Opener-Policy": "same-origin-allow-popups",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
};

export function addSecurityHeaders(response: Response, allowSameOriginFrame = false): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
	if (allowSameOriginFrame) {
		headers.set("X-Frame-Options", "SAMEORIGIN");
		headers.set(
			"Content-Security-Policy",
			response.headers.get("Content-Security-Policy") ||
				SECURITY_HEADERS["Content-Security-Policy"].replace("frame-ancestors 'none'", "frame-ancestors 'self'"),
		);
	}
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
