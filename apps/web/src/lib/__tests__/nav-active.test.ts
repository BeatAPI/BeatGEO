import { describe, expect, it } from "vitest";
import { activeNavHref } from "@/lib/nav-active";

const BRAND = "/app/org/acme/brand/nike";
const brandRail = [
	{ href: BRAND, exact: true },
	{ href: `${BRAND}/visibility` },
	{ href: `${BRAND}/settings/prompts` },
	{ href: `${BRAND}/settings/brand` },
];

describe("activeNavHref", () => {
	it("lights the entry whose page you are on", () => {
		expect(activeNavHref(brandRail, `${BRAND}/visibility`)).toBe(`${BRAND}/visibility`);
	});

	it("lights the entry a sub-page belongs to", () => {
		expect(activeNavHref(brandRail, `${BRAND}/visibility/anything`)).toBe(`${BRAND}/visibility`);
	});

	it("prefers the longest match", () => {
		expect(activeNavHref(brandRail, `${BRAND}/settings/prompts`)).toBe(`${BRAND}/settings/prompts`);
	});

	it("lights an exact entry only on its own page", () => {
		expect(activeNavHref(brandRail, BRAND)).toBe(BRAND);
		expect(activeNavHref(brandRail, `${BRAND}/prompts/abc`)).toBe("");
	});

	it("lights nothing off the rail entirely", () => {
		expect(activeNavHref(brandRail, "/admin")).toBe("");
	});

	it("lights the right one of two entries that share a title", () => {
		const rail = [{ href: "/app/org/acme/settings/brands" }, { href: "/admin" }];
		expect(activeNavHref(rail, "/admin")).toBe("/admin");
		expect(activeNavHref(rail, "/app/org/acme/settings/brands")).toBe("/app/org/acme/settings/brands");
	});
});

describe("grouped analysis navigation", () => {
	const rail = [
		{ href: `${BRAND}/visibility`, aliases: [`${BRAND}/share-of-voice`, `${BRAND}/responses`] },
		{ href: `${BRAND}/settings/prompts` },
	];
	it("keeps the insights module selected on its share-of-voice and answer pages", () => {
		expect(activeNavHref(rail, `${BRAND}/share-of-voice`)).toBe(`${BRAND}/visibility`);
		expect(activeNavHref(rail, `${BRAND}/responses/detail`)).toBe(`${BRAND}/visibility`);
	});
	it("does not claim settings or a similarly prefixed route", () => {
		expect(activeNavHref(rail, `${BRAND}/settings/prompts`)).toBe(`${BRAND}/settings/prompts`);
		expect(activeNavHref(rail, `${BRAND}/responses-archive`)).toBe("");
	});
});

describe("SEO section navigation", () => {
	const path = `${BRAND}/seo`;
	const rail = [
		{ href: path, exact: true },
		{ href: `${path}#domain`, exact: true },
		{ href: `${path}#keywords`, exact: true },
		{ href: `${path}#backlinks`, exact: true },
	];
	it("selects the matching section rather than the last link to the shared page", () => {
		expect(activeNavHref(rail, path)).toBe(path);
		expect(activeNavHref(rail, path, "keywords")).toBe(`${path}#keywords`);
		expect(activeNavHref(rail, path, "domain")).toBe(`${path}#domain`);
	});
	it("falls back to the workspace on an unknown section and ignores other pages", () => {
		expect(activeNavHref(rail, path, "unknown")).toBe(path);
		expect(activeNavHref(rail, BRAND, "keywords")).toBe("");
	});
});
