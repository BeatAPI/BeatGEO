import { createFileRoute } from "@tanstack/react-router";
import { deleteCookie, getCookie } from "@tanstack/react-start/server";
import { getDeployment } from "@workspace/deployment";
import { getAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { exchangeGaCode, GA_COOKIE, validateGaOAuth } from "@/server/ga-oauth-core";
import { saveGaAuthorization } from "@/server/traffic-core";
export async function handleGaCallback(request: Request) {
	let returnTo = "/app";
	const cookie = getCookie(GA_COOKIE);
	deleteCookie(GA_COOKIE, { path: "/api/traffic/ga" });
	try {
		if (getDeployment().features.readOnly) throw new Error("Read-only workspace.");
		const session = await getAuthSession();
		const query = new URL(request.url).searchParams;
		if (!session || !cookie) throw new Error("Missing authorization session.");
		const pending = await validateGaOAuth(cookie, query.get("state") ?? "", session.user.id, session.session.id);
		returnTo = pending.returnTo;
		await requireBrandAccess(session.user.id, pending.brandId);
		if (query.has("error")) return callbackRedirect(`${returnTo}?ga=denied`);
		const code = query.get("code");
		if (!code || code.length > 4096) throw new Error("Missing Google code.");
		await saveGaAuthorization(pending.brandId, await exchangeGaCode(code, pending.verifier));
		return callbackRedirect(`${returnTo}?ga=connected`);
	} catch {
		return callbackRedirect(`${returnTo}?ga=error`);
	}
}
function callbackRedirect(location: string) {
	return new Response(null, {
		status: 303,
		headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
	});
}
export const Route = createFileRoute("/api/traffic/ga/callback")({
	server: { handlers: { GET: ({ request }) => handleGaCallback(request) } },
});
