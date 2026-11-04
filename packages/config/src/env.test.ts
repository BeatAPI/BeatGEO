import { describe, expect, it } from "vitest";
import { assertRequiredEnv, getEnvRequirements, requireEnvVars, validateEnvRequirements } from "./env";

function missingIds(env: Record<string, string>): Set<string> {
	return new Set(validateEnvRequirements(getEnvRequirements(), env).missing.map((entry) => entry.id));
}

describe("startup requirements", () => {
	it("requires the infra vars and the encryption key the CLI provisions", () => {
		const ids = new Set(getEnvRequirements().map((requirement) => requirement.id));
		for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET", "SCRAPE_TARGETS", "BEAT_GEO_ENCRYPTION_KEY"]) {
			expect(ids.has(name), name).toBe(true);
		}
	});
});

describe("research provider requirement", () => {
	it("is missing when no direct LLM key is set", () => {
		expect(missingIds({}).has("RESEARCH_PROVIDER")).toBe(true);
	});

	it("is satisfied by any one direct LLM key", () => {
		for (const key of ["OPENAI_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "MISTRAL_API_KEY"]) {
			expect(missingIds({ [key]: "x" }).has("RESEARCH_PROVIDER"), key).toBe(false);
		}
	});

	it("is not satisfied by scraper keys alone", () => {
		expect(missingIds({ OLOSTEP_API_KEY: "x", CLORO_API_KEY: "x" }).has("RESEARCH_PROVIDER")).toBe(true);
	});

	it("follows ONBOARDING_LLM_TARGET to that provider's keys", () => {
		const target = { ONBOARDING_LLM_TARGET: "claude:anthropic-api" };
		expect(missingIds({ ...target, OPENAI_API_KEY: "x" }).has("RESEARCH_PROVIDER")).toBe(true);
		expect(missingIds({ ...target, ANTHROPIC_API_KEY: "x" }).has("RESEARCH_PROVIDER")).toBe(false);
		expect(missingIds({ ONBOARDING_LLM_TARGET: "stub:stub" }).has("RESEARCH_PROVIDER")).toBe(false);
	});
});

describe("requireEnvVars", () => {
	it("reports every missing required env var at once", () => {
		expect(() => requireEnvVars(["APP_NAME", "APP_ICON", "APP_URL"], { APP_URL: "https://app.beatgeo.com" })).toThrow(
			"Missing required environment variables: APP_NAME, APP_ICON",
		);
	});

	it("uses the singular message when a single var is missing", () => {
		expect(() => requireEnvVars(["APP_NAME"], {})).toThrow("Missing required environment variable: APP_NAME");
	});

	it("returns the resolved values when every var is present", () => {
		const env = { APP_NAME: "Acme", APP_URL: "https://app.beatgeo.com" };
		expect(requireEnvVars(["APP_NAME", "APP_URL"], env)).toEqual(env);
	});
});

describe("assertRequiredEnv", () => {
	it("names every missing var in one error", () => {
		expect(() => assertRequiredEnv({ SCRAPE_TARGETS: "chatgpt:olostep:online" })).toThrow(
			/DATABASE_URL.*BETTER_AUTH_SECRET.*BEAT_GEO_ENCRYPTION_KEY/,
		);
	});

	it("leaves provider keys to SCRAPE_TARGETS validation", () => {
		expect(() =>
			assertRequiredEnv({
				DATABASE_URL: "postgres://localhost/beatgeo",
				BETTER_AUTH_SECRET: "secret",
				BEAT_GEO_ENCRYPTION_KEY: "key",
				SCRAPE_TARGETS: "chatgpt:olostep:online",
			}),
		).not.toThrow();
	});
});
