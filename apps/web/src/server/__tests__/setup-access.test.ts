import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ memberships: [] as Array<{ id: string; role: string }> }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: {} }));
vi.mock("@workspace/lib/db/db", () => ({
	db: {
		select: () => ({
			from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: async () => mocks.memberships }) }) }),
		}),
	},
}));

import { canManageConnections } from "@/lib/auth/helpers";

beforeEach(() => {
	mocks.memberships = [];
});
describe("local instance ownership", () => {
	it("lets the first registered organization administrator configure the instance", async () => {
		mocks.memberships = [{ id: "default", role: "admin" }];
		expect(await canManageConnections({ user: { id: "local-owner", role: "user" } })).toBe(true);
	});
	it.each([
		{ id: "default", role: "member" },
		{ id: "other", role: "admin" },
	])("rejects a different scope: %j", async (membership) => {
		mocks.memberships = [membership];
		expect(await canManageConnections({ user: { id: "member", role: "user" } })).toBe(false);
	});
});
