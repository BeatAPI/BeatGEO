import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireBrandSession: vi.fn(),
	canManageConnections: vi.fn(),
	createWorkbench: vi.fn(),
	brand: vi.fn(),
	org: vi.fn(),
	rivals: vi.fn(),
	request: vi.fn(),
}));
vi.mock("@/lib/auth/helpers", () => mocks);
vi.mock("@workspace/lib/secrets", () => ({ getCredential: () => "", refreshCredentialOverlay: vi.fn() }));
vi.mock("@workspace/lib/db/db", () => ({
	db: {
		query: {
			brands: { findFirst: mocks.brand },
			organization: { findFirst: mocks.org },
			competitors: { findMany: mocks.rivals },
		},
	},
}));
vi.mock("../../../../../tools/seo-geo/src/workbench.mjs", () => ({ createWorkbench: mocks.createWorkbench }));
vi.mock("../seo-prompts", () => ({ addSeoPrompts: vi.fn() }));

import { handleSeoWorkbench } from "../seo-workbench";

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("APP_URL", "http://localhost:3000");
	mocks.requireBrandSession.mockResolvedValue({ user: { id: "owner" } });
	mocks.canManageConnections.mockResolvedValue(true);
	mocks.brand.mockResolvedValue({
		id: "brand-a",
		name: "Acme",
		website: "https://acme.example",
		organizationId: "default",
		slug: "acme",
	});
	mocks.org.mockResolvedValue({ slug: "default" });
	mocks.rivals.mockResolvedValue([]);
	mocks.request.mockResolvedValue(new Response("workspace"));
	mocks.createWorkbench.mockResolvedValue({ request: mocks.request });
});

describe("managed SEO boundary", () => {
	it("rejects cross-origin and wrong-host requests before looking up a workspace", async () => {
		for (const request of [
			new Request("http://evil.example/api/seo/brand-a/"),
			new Request("http://localhost:3000/api/seo/brand-a/", { headers: { origin: "https://evil.example" } }),
		]) {
			expect((await handleSeoWorkbench(request, "brand-a")).status).toBe(403);
		}
		expect(mocks.requireBrandSession).not.toHaveBeenCalled();
		expect(mocks.createWorkbench).not.toHaveBeenCalled();
	});
	it("requires brand authorization on every asset and report", async () => {
		mocks.requireBrandSession.mockRejectedValue(new Error("Forbidden"));
		expect(
			(await handleSeoWorkbench(new Request("http://localhost:3000/api/seo/other/reports/report.html"), "other"))
				.status,
		).toBe(403);
		expect(mocks.createWorkbench).not.toHaveBeenCalled();
	});
	it("does not expose instance credentials to a viewer who cannot manage connections", async () => {
		mocks.canManageConnections.mockResolvedValue(false);
		expect((await handleSeoWorkbench(new Request("http://localhost:3000/api/seo/brand-a/"), "brand-a")).status).toBe(
			403,
		);
		expect(mocks.createWorkbench).not.toHaveBeenCalled();
	});
	it("opens a brand-scoped workspace and rechecks access when it is cached", async () => {
		const request = new Request("http://localhost:3000/api/seo/brand-a/");
		expect((await handleSeoWorkbench(request, "brand-a")).status).toBe(200);
		expect(mocks.createWorkbench).toHaveBeenCalledWith(
			expect.objectContaining({
				managed: expect.objectContaining({
					basePath: "/api/seo/brand-a",
					settingsUrl: "/app/org/default/brand/acme/settings/brand#research",
					responsesUrl: "/app/org/default/brand/acme/responses",
					project: expect.objectContaining({ site: "https://acme.example" }),
				}),
			}),
		);
		mocks.requireBrandSession.mockRejectedValue(new Error("Access revoked"));
		expect((await handleSeoWorkbench(request, "brand-a")).status).toBe(403);
		expect(mocks.request).toHaveBeenCalledTimes(1);
	});
});
