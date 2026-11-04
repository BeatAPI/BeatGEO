import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseRouterSearch, stringifyRouterSearch } from "../router-search";

const signature = (params: URLSearchParams) => {
	const signed = new URLSearchParams([...params].filter(([key]) => key !== "sig").sort());
	return createHmac("sha256", "test-secret").update(signed.toString()).digest("base64");
};

describe("router search", () => {
	it("keeps an OAuth signature valid through hydration and navigation", () => {
		const params = new URLSearchParams({ client_id: "000123", scope: "openid profile", exp: "1800000000" });
		params.append("resource", "http://localhost:3140/api/mcp");
		params.append("resource", "https://example.test/second");
		for (const key of ["client_id", "scope", "exp", "resource", "ba_param"]) params.append("ba_param", key);
		params.set("sig", signature(params));
		const roundTrip = new URLSearchParams(stringifyRouterSearch(parseRouterSearch(`?${params}`)));
		expect(signature(roundTrip)).toBe(params.get("sig"));
		expect(roundTrip.getAll("resource")).toEqual(params.getAll("resource"));
	});

	it("retains typed dashboard filters outside signed OAuth links", () => {
		const filters = { page: 2, tags: ["monitoring", "seo"], enabled: true };
		expect(parseRouterSearch(stringifyRouterSearch(filters))).toEqual(filters);
	});
});
