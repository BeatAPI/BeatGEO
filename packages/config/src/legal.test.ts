import { describe, expect, it } from "vitest";
import { legalUrl, showsLegalLinks } from "./legal";

describe("self-hosted product notices", () => {
	it.each(["local", "cloud", "demo", "whitelabel", undefined] as const)(
		"does not claim an upstream hosted agreement for %s",
		(mode) => {
			expect(showsLegalLinks(mode)).toBe(false);
		},
	);
	it("keeps information on the project", () => {
		expect(legalUrl("privacy")).toBe("https://github.com/BeatAPI/BeatGeo/blob/main/docs/privacy.md#privacy");
	});
});
