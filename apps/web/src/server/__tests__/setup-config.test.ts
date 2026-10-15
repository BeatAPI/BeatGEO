import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "local", missing: [{ id: "RESEARCH_PROVIDER" }] }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ handler: (fn: unknown) => fn }) }));
vi.mock("@workspace/config/env", () => ({
	getEnvValidationState: () => state,
	getDeploymentModeFromEnv: () => state.mode,
}));
vi.mock("@workspace/lib/secrets", () => ({
	storedCredentialsLoaded: async () => {},
	withStoredCredentials: () => ({}),
}));

import { getEnvValidationStateFn } from "../config";

describe("first-run access without a paid key", () => {
	it("allows local registration and setup without research credentials", async () => {
		state.mode = "local";
		state.missing = [{ id: "RESEARCH_PROVIDER" }];
		expect(await getEnvValidationStateFn()).toMatchObject({ isValid: true, missing: [] });
	});
	it("keeps infrastructure failures blocking", async () => {
		state.mode = "local";
		state.missing = [{ id: "RESEARCH_PROVIDER" }, { id: "DATABASE_URL" }];
		expect(await getEnvValidationStateFn()).toMatchObject({ isValid: false, missing: [{ id: "DATABASE_URL" }] });
	});
	it("preserves the required research configuration outside local mode", async () => {
		state.mode = "cloud";
		state.missing = [{ id: "RESEARCH_PROVIDER" }];
		expect(await getEnvValidationStateFn()).toMatchObject({ isValid: false });
	});
});
