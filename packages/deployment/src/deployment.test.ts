import { DEFAULT_APP_ICON, DEFAULT_APP_NAME, DEFAULT_APP_URL, DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDeployment, getDeployment, resetDeploymentCache } from "./deployment";

describe("branding", () => {
	it("falls back to the BeatGEO defaults when nothing is configured", () => {
		expect(buildDeployment({}).branding).toEqual({
			name: DEFAULT_APP_NAME,
			icon: DEFAULT_APP_ICON,
			url: DEFAULT_APP_URL,
			parentName: undefined,
			parentUrl: undefined,
			chartColors: DEFAULT_CHART_COLORS,
		});
	});

	it("takes the name, icon, URL and parent links from the environment", () => {
		const { branding } = buildDeployment({
			APP_NAME: "Acme",
			APP_ICON: "https://cdn.example.com/acme.png",
			APP_URL: "https://acme.example.com",
			APP_PARENT_NAME: "Acme Group",
			APP_PARENT_URL: "https://group.example.com",
		});
		expect(branding).toMatchObject({
			name: "Acme",
			icon: "https://cdn.example.com/acme.png",
			url: "https://acme.example.com",
			parentName: "Acme Group",
			parentUrl: "https://group.example.com",
		});
	});
});

describe("getDeployment", () => {
	beforeEach(() => resetDeploymentCache());

	it("caches the first build", () => {
		const first = getDeployment({ env: { APP_NAME: "First" } });
		expect(getDeployment({ env: { APP_NAME: "Second" } })).toBe(first);
	});
});
