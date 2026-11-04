import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
	session: vi.fn(),
	access: vi.fn(),
	cookie: vi.fn(),
	setCookie: vi.fn(),
	delete: vi.fn(),
	validate: vi.fn(),
	exchange: vi.fn(),
	save: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("@tanstack/react-start/server", () => ({
	getCookie: m.cookie,
	deleteCookie: m.delete,
	setCookie: m.setCookie,
}));
vi.mock("@/lib/auth/helpers", () => ({ getAuthSession: m.session, requireBrandAccess: m.access }));
vi.mock("@/server/google-oauth-core", () => ({
	GOOGLE_COOKIE: "cookie",
	validateGoogleOAuth: m.validate,
	exchangeGoogleCode: m.exchange,
}));
vi.mock("@/server/traffic-core", () => ({ saveGoogleAuthorization: m.save }));

import { handleGoogleCallback } from "../../routes/api/traffic/google/callback";

beforeEach(() => {
	vi.clearAllMocks();
	m.cookie.mockReturnValue("encrypted-cookie");
	m.session.mockResolvedValue({ user: { id: "user-a" }, session: { id: "session-a" } });
	m.access.mockResolvedValue(undefined);
	m.validate.mockResolvedValue({
		brandId: "brand-a",
		verifier: "private-verifier",
		returnTo: "/app/org/a/brand/a/traffic",
	});
	m.exchange.mockResolvedValue({ ga: true, gsc: true, tokens: { accessToken: "private-token" } });
});
it("consumes the session-bound callback and never includes codes or tokens in the redirect", async () => {
	const r = await handleGoogleCallback(
		new Request("http://localhost/api/traffic/google/callback?state=state&code=private-code"),
	);
	expect(r.headers.get("Location")).toBe("/traffic?google=connected");
	expect(r.headers.get("Cache-Control")).toBe("no-store");
	expect(m.access).toHaveBeenCalledWith("user-a", "brand-a");
	expect(m.save).toHaveBeenCalledOnce();
	expect(m.delete).toHaveBeenCalledOnce();
});
it("does not exchange or store a grant when Google consent is declined", async () => {
	const r = await handleGoogleCallback(
		new Request("http://localhost/api/traffic/google/callback?state=state&error=access_denied"),
	);
	expect(r.headers.get("Location")).toContain("google=denied");
	expect(m.exchange).not.toHaveBeenCalled();
	expect(m.save).not.toHaveBeenCalled();
});
it("rejects changed sessions and lost brand access before storing anything", async () => {
	m.validate.mockRejectedValueOnce(new Error("wrong session"));
	await handleGoogleCallback(new Request("http://localhost/api/traffic/google/callback?code=code"));
	expect(m.save).not.toHaveBeenCalled();
	m.access.mockRejectedValueOnce(new Error("Forbidden"));
	await handleGoogleCallback(new Request("http://localhost/api/traffic/google/callback?code=code"));
	expect(m.save).not.toHaveBeenCalled();
});

it("reports partial consent without claiming both services connected", async () => {
	m.exchange.mockResolvedValueOnce({ ga: false, gsc: true, tokens: { accessToken: "private-token" } });
	const response = await handleGoogleCallback(
		new Request("http://localhost/api/traffic/google/callback?state=state&code=private-code"),
	);
	expect(response.headers.get("Location")).toContain("google=partial");
	expect(m.save).toHaveBeenCalledWith("brand-a", expect.objectContaining({ ga: false, gsc: true }));
});

it("returns local consent to the short brand page and remembers the authorized website", async () => {
	m.validate.mockResolvedValue({
		brandId: "brand-a",
		verifier: "private-verifier",
		returnTo: "/app/org/a/brand/a/settings/brand",
	});
	const response = await handleGoogleCallback(
		new Request("http://localhost/api/traffic/google/callback?state=state&code=private-code"),
	);
	expect(response.headers.get("Location")).toBe("/brand?google=connected");
	expect(m.setCookie).toHaveBeenCalledWith(
		"beatgeo-website",
		"brand-a",
		expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
	);
});
