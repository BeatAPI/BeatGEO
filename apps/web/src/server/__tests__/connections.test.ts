import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	session: vi.fn(),
	admin: vi.fn(),
	deployment: vi.fn(),
	read: vi.fn(),
	save: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({ handler: (fn: unknown) => fn, validator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: mocks.session,
	canManageConnections: async (session: unknown) => mocks.deployment().mode === "local" && mocks.admin(session),
}));
vi.mock("@workspace/deployment", () => ({ getDeployment: mocks.deployment }));
vi.mock("@workspace/lib/secrets", () => ({ refreshCredentialOverlay: vi.fn(), getCredential: () => "test-only-key" }));
vi.mock("../connections-core", () => ({
	browserRequest: mocks.read,
	connectionSummary: () => ({}),
	inspectBeatApi: mocks.read,
	saveBeatApi: mocks.save,
}));

import { getConnectionsFn, saveBeatApiFn } from "../connections";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.session.mockResolvedValue({ user: { id: "test" } });
	mocks.admin.mockReturnValue(true);
	mocks.deployment.mockReturnValue({ mode: "local" });
});
describe("connection permissions", () => {
	it("requires sign-in before inspecting local browser state", async () => {
		mocks.session.mockRejectedValueOnce(new Error("Sign in"));
		await expect(getConnectionsFn()).rejects.toThrow("Sign in");
		expect(mocks.read).not.toHaveBeenCalled();
	});
	it.each(["cloud", "demo", "whitelabel"])("rejects instance-wide credentials in %s mode", async (mode) => {
		mocks.deployment.mockReturnValue({ mode });
		await expect(saveBeatApiFn({ data: { key: "test-only-key", model: "text-model" } })).rejects.toThrow(
			"local instance administrator",
		);
		expect(mocks.save).not.toHaveBeenCalled();
	});
	it("rejects non-admin users before making external requests", async () => {
		mocks.admin.mockReturnValue(false);
		await expect(getConnectionsFn()).rejects.toThrow("local instance administrator");
		expect(mocks.read).not.toHaveBeenCalled();
	});
});
