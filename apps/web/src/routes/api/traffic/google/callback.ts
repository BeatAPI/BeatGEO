import { createFileRoute } from "@tanstack/react-router";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { getAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { localPathRewrite } from "@/lib/local-paths";
import { exchangeGoogleCode, GOOGLE_COOKIE, validateGoogleOAuth } from "@/server/google-oauth-core";
import { saveGoogleAuthorization } from "@/server/traffic-core";

export async function handleGoogleCallback(request: Request) {
	let returnTo = "/app";
	const cookie = getCookie(GOOGLE_COOKIE);
	deleteCookie(GOOGLE_COOKIE, { path: "/api/traffic/google" });
	try {
		const session = await getAuthSession();
		const query = new URL(request.url).searchParams;
		if (!session || !cookie) throw new Error("Missing authorization session.");
		const pending = await validateGoogleOAuth(cookie, query.get("state") ?? "", session.user.id, session.session.id);
		returnTo = pending.returnTo;
		await requireBrandAccess(session.user.id, pending.brandId);
		setCookie("beatgeo-website", pending.brandId, {
			httpOnly: true,
			sameSite: "strict",
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
		});
		if (query.has("error")) return callbackRedirect(`${returnTo}?google=denied`);
		const code = query.get("code");
		if (!code || code.length > 4096) throw new Error("Missing Google code.");
		const grant = await exchangeGoogleCode(code, pending.verifier);
		await saveGoogleAuthorization(pending.brandId, grant);
		return callbackRedirect(`${returnTo}?google=${grant.ga && grant.gsc ? "connected" : "partial"}`);
	} catch {
		return callbackRedirect(`${returnTo}?google=error`);
	}
}
function callbackRedirect(location: string) {
	const url = localPathRewrite(null).output({ url: new URL(location, "http://localhost") });
	return new Response(null, {
		status: 303,
		headers: { Location: url.pathname + url.search, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
	});
}
export const Route = createFileRoute("/api/traffic/google/callback")({
	server: { handlers: { GET: ({ request }) => handleGoogleCallback(request) } },
});
