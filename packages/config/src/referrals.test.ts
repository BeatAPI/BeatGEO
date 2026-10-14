import { describe, expect, it } from "vitest";
import { bookDemoUrl, cloudAppUrl, cloudPricingUrl, cloudSignupUrl, demoSiteUrl, marketingUrl } from "./referrals";

describe("project destinations", () => {
	it.each([bookDemoUrl, cloudAppUrl, cloudPricingUrl, cloudSignupUrl, demoSiteUrl])(
		"never advertises a nonexistent hosted offering",
		(build) => {
			const url = new URL(build("cli"));
			expect(url.origin + url.pathname).toBe("https://github.com/BeatAPI/BeatGeo");
			expect(url.searchParams.get("ref")).toBe("cli");
		},
	);
	it("links documentation to the maintained project", () => {
		expect(new URL(marketingUrl("/docs", "cli")).hash).toBe("#readme");
	});
});
