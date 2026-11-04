import type { OrganizationSummary } from "@/lib/organizations/types";

export function firstWebsite(organizations: OrganizationSummary[]) {
	for (const organization of organizations) {
		const brand = organization.brands.find((item) => item.website.trim());
		if (brand) return { org: organization.slug, brand: brand.slug || brand.id };
	}
	return null;
}
