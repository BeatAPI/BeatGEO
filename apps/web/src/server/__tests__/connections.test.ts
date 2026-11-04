import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	session: vi.fn(),
	admin: vi.fn(),
	read: vi.fn(),
	save: vi.fn(),
	disconnect: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({ handler: (fn: unknown) => fn, validator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@/lib/auth/helpers", () => ({
	requireAuthSession: mocks.session,
	canManageConnections: async (session: unknown) => mocks.admin(session),
}));
vi.mock("@workspace/lib/runtime-health", () => ({ readRuntimeHealth: vi.fn() }));
vi.mock("@workspace/lib/secrets", () => ({ refreshCredentialOverlay: vi.fn(), getCredential: () => "test-only-key" }));
vi.mock("../connections-core", () => ({
	browserRequest: mocks.read,
	connectionSummary: () => ({}),
	inspectBeatApi: mocks.read,
	saveBeatApi: mocks.save,
	disconnectBeatApi: mocks.disconnect,
}));

import { disconnectBeatApiFn, getConnectionsFn, saveBeatApiFn } from "../connections";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.session.mockResolvedValue({ user: { id: "test" } });
	mocks.admin.mockReturnValue(true);
});
describe("connection permissions", () => {
	it("requires sign-in before inspecting local browser state", async () => {
		mocks.session.mockRejectedValueOnce(new Error("Sign in"));
		await expect(getConnectionsFn()).rejects.toThrow("Sign in");
		expect(mocks.read).not.toHaveBeenCalled();
	});
	it("saves a shared key without requiring a research model", async () => {
		await saveBeatApiFn({ data: { key: "test-only-key" } });
		expect(mocks.save).toHaveBeenCalledWith("test-only-key", undefined);
	});
	it("requires local administrator access to disconnect the shared key", async () => {
		mocks.admin.mockReturnValue(false);
		await expect(disconnectBeatApiFn()).rejects.toThrow("local instance administrator");
		expect(mocks.disconnect).not.toHaveBeenCalled();
		mocks.admin.mockReturnValue(true);
		await disconnectBeatApiFn();
		expect(mocks.disconnect).toHaveBeenCalledOnce();
	});
	it("rejects non-admin users before making external requests", async () => {
		mocks.admin.mockReturnValue(false);
		await expect(getConnectionsFn()).rejects.toThrow("local instance administrator");
		expect(mocks.read).not.toHaveBeenCalled();
	});
});
