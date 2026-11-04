import { describe, expect, it } from "vitest";
import { localPathRewrite } from "../local-paths";
import type { OrganizationSummary } from "../organizations/types";
import { firstWebsite } from "../workspace-entry";

const prefix = "/app/org/default/brand/example";
const rewrite = localPathRewrite({ org: "default", brand: "example" });
const url = (path: string) => new URL(path, "http://localhost:3140");

describe("local workspace URLs", () => {
	it.each([
		["/brand", "/settings/brand"],
		["/seo", "/seo"],
		["/geo", ""],
		["/questions", "/settings/prompts"],
		["/questions/prompt-123", "/prompts/prompt-123"],
		["/visibility", "/visibility"],
		["/responses", "/responses"],
		["/share-of-voice", "/share-of-voice"],
		["/query-fan-out", "/query-fan-out"],
		["/traffic", "/traffic"],
		["/search-console", "/search-console"],
		["/opportunities", "/opportunities"],
		["/models", "/settings/llms"],
		["/competitors", "/settings/competitors"],
	])("opens and shares %s without exposing tenant paths", (short, internal) => {
		expect(rewrite.input({ url: url(short) }).pathname).toBe(prefix + internal);
		expect(rewrite.output({ url: url(prefix + internal) }).pathname).toBe(short);
	});
	it("preserves search, authorization status and section hashes", () => {
		const location = url("/brand?google=partial#website");
		expect(rewrite.output({ url: rewrite.input({ url: location }) }).href).toBe(
			"http://localhost:3140/brand?google=partial#website",
		);
	});
	it("lets an existing workspace add another website", () => {
		expect(rewrite.input({ url: url("/brand?add=true&org=default") }).pathname).toBe("/setup");
	});
	it("takes a workspace without a website to setup", () => {
		expect(localPathRewrite(null).input({ url: url("/seo") }).pathname).toBe("/setup");
		expect(localPathRewrite(null).output({ url: url("/setup") }).pathname).toBe("/brand");
	});
	it("keeps API and authorization callback routes intact", () => {
		for (const path of ["/api/traffic/google/callback", "/api/mcp", "/_server/test"]) {
			expect(rewrite.input({ url: url(path) }).pathname).toBe(path);
			expect(rewrite.output({ url: url(path) }).pathname).toBe(path);
		}
	});
	it("keeps selecting a website independent of question onboarding completion", () => {
		const organizations: OrganizationSummary[] = [
			{
				id: "default",
				slug: "default",
				name: "Workspace",
				brands: [{ id: "1", slug: "example", name: "Example", website: "https://example.com", onboarded: false }],
			},
		];
		expect(firstWebsite(organizations)).toEqual({ org: "default", brand: "example" });
		expect(firstWebsite([])).toBeNull();
	});
});
