import { describe, expect, it } from "vitest";
import { organizationTree } from "@/lib/organizations/tree";
import type { OrganizationSummary } from "@/lib/organizations/types";

function organization(brandNames: string[] = []): OrganizationSummary {
	return {
		id: "org-1",
		slug: "acme",
		name: "Acme",
		brands: brandNames.map((name) => ({
			id: name,
			slug: name,
			name,
			website: `https://${name}.com`,
			onboarded: true,
		})),
	};
}

describe("organizationTree", () => {
	it("names the heading for what it leads to, so every surface says it the same way", () => {
		expect(organizationTree(organization()).heading.ariaLabel).toBe("Acme organization settings");
	});

	it("lists the brands, then the way to add one", () => {
		const { children } = organizationTree(organization(["nike", "adidas"]));
		expect(children.map((row) => row.label)).toEqual(["nike", "adidas", "New brand"]);
	});

	it("hands each row its own address", () => {
		const { children } = organizationTree(organization(["nike"]));
		expect(children.map((row) => row.link)).toEqual([
			{ to: "/app/org/$org/brand/$brand", params: { org: "acme", brand: "nike" } },
			{ to: "/app/org/$org/new", params: { org: "acme" } },
		]);
	});

	it("says what each row is", () => {
		const { children } = organizationTree(organization(["nike"]));
		expect(children.map((row) => row.kind)).toEqual(["brand", "new-brand"]);
		expect(children[0]).toMatchObject({ id: "nike", website: "https://nike.com" });
	});

	it("asks for the first brand differently from the next one", () => {
		const { children } = organizationTree(organization());
		expect(children).toEqual([
			{
				kind: "new-brand",
				key: "new-brand",
				link: { to: "/app/org/$org/new", params: { org: "acme" } },
				label: "Create your first brand",
			},
		]);
	});
});
