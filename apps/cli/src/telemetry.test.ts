import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { capture, shutdown, posthog, readFile } = vi.hoisted(() => {
	const capture = vi.fn();
	const shutdown = vi.fn().mockResolvedValue(undefined);
	return { capture, shutdown, posthog: vi.fn(() => ({ capture, shutdown })), readFile: vi.fn() };
});
vi.mock("posthog-node", () => ({ PostHog: posthog }));
vi.mock("node:fs/promises", () => ({ default: { readFile } }));

import { trackCliEvent } from "./telemetry";

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("BEAT_GEO_POSTHOG_KEY", "");
	vi.stubEnv("DISABLE_TELEMETRY", "");
	readFile.mockResolvedValue("DEPLOYMENT_ID=local-test\n");
});
afterEach(() => vi.unstubAllEnvs());
describe("operator-owned telemetry", () => {
	it("sends nothing without an explicit analytics project", async () => {
		await trackCliEvent("/test", "cli_init");
		expect(posthog).not.toHaveBeenCalled();
	});
	it("sends only to the configured project", async () => {
		vi.stubEnv("BEAT_GEO_POSTHOG_KEY", "test-project");
		await trackCliEvent("/test", "cli_init");
		expect(posthog).toHaveBeenCalledWith("test-project", { host: "https://us.i.posthog.com" });
		expect(capture).toHaveBeenCalledOnce();
	});
	it("honors disable even with a configured project", async () => {
		vi.stubEnv("BEAT_GEO_POSTHOG_KEY", "test-project");
		readFile.mockResolvedValue("DEPLOYMENT_ID=local-test\nDISABLE_TELEMETRY=1\n");
		await trackCliEvent("/test", "cli_init");
		expect(posthog).not.toHaveBeenCalled();
	});
});
