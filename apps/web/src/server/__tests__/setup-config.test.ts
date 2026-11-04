import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ missing: [{ id: "RESEARCH_PROVIDER" }] }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ handler: (fn: unknown) => fn }) }));
vi.mock("@workspace/config/env", () => ({
	getEnvValidationState: () => state,
}));
vi.mock("@workspace/lib/secrets", () => ({
	storedCredentialsLoaded: async () => {},
	withStoredCredentials: () => ({}),
}));

import { getEnvValidationStateFn } from "../config";

describe("first-run access without a paid key", () => {
	it("allows setup without research credentials", async () => {
		state.missing = [{ id: "RESEARCH_PROVIDER" }];
		expect(await getEnvValidationStateFn()).toMatchObject({ isValid: true, missing: [] });
	});
	it("keeps infrastructure failures blocking", async () => {
		state.missing = [{ id: "RESEARCH_PROVIDER" }, { id: "DATABASE_URL" }];
		expect(await getEnvValidationStateFn()).toMatchObject({ isValid: false, missing: [{ id: "DATABASE_URL" }] });
	});
});
