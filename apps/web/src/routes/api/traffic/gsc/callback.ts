import { createFileRoute } from "@tanstack/react-router";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { getAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { exchangeGscCode, GSC_COOKIE, validateGscOAuth } from "@/server/gsc-oauth-core";
import { saveGscAuthorization } from "@/server/traffic-core";
export async function handleGscCallback(request: Request) {
	let returnTo = "/app";
	const cookie = getCookie(GSC_COOKIE);
	deleteCookie(GSC_COOKIE, { path: "/api/traffic/gsc" });
	try {
		const session = await getAuthSession();
		const query = new URL(request.url).searchParams;
		if (!session || !cookie) throw new Error("Missing authorization session.");
		const pending = await validateGscOAuth(cookie, query.get("state") ?? "", session.user.id, session.session.id);
		returnTo = pending.returnTo;
		await requireBrandAccess(session.user.id, pending.brandId);
		if (query.has("error")) return callbackRedirect(`${returnTo}?gsc=denied`);
		const code = query.get("code");
		if (!code || code.length > 4096) throw new Error("Missing Google code.");
		await saveGscAuthorization(pending.brandId, await exchangeGscCode(code, pending.verifier));
		return callbackRedirect(`${returnTo}?gsc=connected`);
	} catch {
		return callbackRedirect(`${returnTo}?gsc=error`);
	}
}
function callbackRedirect(location: string) {
	return new Response(null, {
		status: 303,
		headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
	});
}
export const Route = createFileRoute("/api/traffic/gsc/callback")({
	server: { handlers: { GET: ({ request }) => handleGscCallback(request) } },
});
