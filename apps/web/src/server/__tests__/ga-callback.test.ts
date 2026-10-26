import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
	session: vi.fn(),
	access: vi.fn(),
	cookie: vi.fn(),
	delete: vi.fn(),
	validate: vi.fn(),
	exchange: vi.fn(),
	save: vi.fn(),
	deployment: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: m.cookie, deleteCookie: m.delete }));
vi.mock("@workspace/deployment", () => ({ getDeployment: m.deployment }));
vi.mock("@/lib/auth/helpers", () => ({ getAuthSession: m.session, requireBrandAccess: m.access }));
vi.mock("@/server/ga-oauth-core", () => ({
	GA_COOKIE: "cookie",
	validateGaOAuth: m.validate,
	exchangeGaCode: m.exchange,
}));
vi.mock("@/server/traffic-core", () => ({ saveGaAuthorization: m.save }));

import { handleGaCallback } from "../../routes/api/traffic/ga/callback";

beforeEach(() => {
	vi.clearAllMocks();
	m.deployment.mockReturnValue({ features: { readOnly: false } });
	m.cookie.mockReturnValue("encrypted-cookie");
	m.session.mockResolvedValue({ user: { id: "user-a" }, session: { id: "session-a" } });
	m.access.mockResolvedValue(undefined);
	m.validate.mockResolvedValue({
		brandId: "brand-a",
		verifier: "private-verifier",
		returnTo: "/app/org/a/brand/a/traffic",
	});
	m.exchange.mockResolvedValue({ accessToken: "private-token" });
});
it("consumes the session-bound callback and never includes codes or tokens in the redirect", async () => {
	const r = await handleGaCallback(
		new Request("http://localhost/api/traffic/ga/callback?state=state&code=private-code"),
	);
	expect(r.headers.get("Location")).toBe("/app/org/a/brand/a/traffic?ga=connected");
	expect(r.headers.get("Cache-Control")).toBe("no-store");
	expect(m.access).toHaveBeenCalledWith("user-a", "brand-a");
	expect(m.save).toHaveBeenCalledOnce();
	expect(m.delete).toHaveBeenCalledOnce();
});
it("does not exchange or store a grant when Google consent is declined", async () => {
	const r = await handleGaCallback(
		new Request("http://localhost/api/traffic/ga/callback?state=state&error=access_denied"),
	);
	expect(r.headers.get("Location")).toContain("ga=denied");
	expect(m.exchange).not.toHaveBeenCalled();
	expect(m.save).not.toHaveBeenCalled();
});
it("rejects changed sessions, lost brand access and read-only deployments before storing anything", async () => {
	m.validate.mockRejectedValueOnce(new Error("wrong session"));
	await handleGaCallback(new Request("http://localhost/api/traffic/ga/callback?code=code"));
	expect(m.save).not.toHaveBeenCalled();
	m.access.mockRejectedValueOnce(new Error("Forbidden"));
	await handleGaCallback(new Request("http://localhost/api/traffic/ga/callback?code=code"));
	expect(m.save).not.toHaveBeenCalled();
	m.deployment.mockReturnValue({ features: { readOnly: true } });
	await handleGaCallback(new Request("http://localhost/api/traffic/ga/callback?code=code"));
	expect(m.save).not.toHaveBeenCalled();
});
