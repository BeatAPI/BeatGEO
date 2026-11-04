import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
	session: vi.fn(),
	list: vi.fn(),
	summaries: vi.fn(),
	cookie: vi.fn(),
	set: vi.fn(),
	access: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({ handler: (fn: unknown) => fn, validator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: m.cookie, setCookie: m.set }));
vi.mock("@/lib/auth/helpers", () => ({
	getAuthSession: m.session,
	listUserOrganizations: m.list,
	requireBrandSession: m.access,
}));
vi.mock("@/lib/organizations/summarize", () => ({ summarizeOrganizations: m.summaries }));

import { getLocalNavigationFn, selectLocalWebsiteFn } from "../local-navigation";

beforeEach(() => {
	vi.resetAllMocks();
	m.session.mockResolvedValue({ user: { id: "owner" } });
	m.summaries.mockResolvedValue([
		{
			slug: "default",
			brands: [
				{ id: "a", slug: "alpha", website: "https://alpha.example", onboarded: false },
				{ id: "b", slug: "beta", website: "https://beta.example", onboarded: true },
			],
		},
	]);
});
it("restores the selected website and falls back if it was removed or inaccessible", async () => {
	m.cookie.mockReturnValue("b");
	expect(await getLocalNavigationFn()).toEqual({ website: { org: "default", brand: "beta" } });
	m.cookie.mockReturnValue("removed");
	expect(await getLocalNavigationFn()).toEqual({ website: { org: "default", brand: "alpha" } });
});
it("keeps first-run workspaces and signed-out visitors free of selected-brand data", async () => {
	m.summaries.mockResolvedValue([]);
	expect(await getLocalNavigationFn()).toEqual({ website: null });
	m.session.mockResolvedValue(null);
	expect(await getLocalNavigationFn()).toEqual({ website: null });
});
it("checks brand access before persisting a website selection", async () => {
	m.access.mockRejectedValueOnce(new Error("Forbidden"));
	await expect(selectLocalWebsiteFn({ data: { brandId: "other" } })).rejects.toThrow("Forbidden");
	expect(m.set).not.toHaveBeenCalled();
	await selectLocalWebsiteFn({ data: { brandId: "a" } });
	expect(m.set).toHaveBeenCalledWith(
		"beatgeo-website",
		"a",
		expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
	);
});
