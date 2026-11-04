/**
 * Kept out of `@/server/organizations`, which the client imports: handler bodies
 * are stripped from that module, but anything exported outright would drag the
 * database into the client graph.
 */

import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { inArray } from "drizzle-orm";
import type { UserOrganization } from "@/lib/auth/helpers";
import type { OrganizationSummary } from "@/lib/organizations/types";

export async function summarizeOrganizations(orgs: UserOrganization[]): Promise<OrganizationSummary[]> {
	if (orgs.length === 0) return [];
	const orgIds = orgs.map((org) => org.id);

	const rows = await db
		.select({
			id: brands.id,
			slug: brands.slug,
			name: brands.name,
			website: brands.website,
			onboarded: brands.onboarded,
			organizationId: brands.organizationId,
		})
		.from(brands)
		.where(inArray(brands.organizationId, orgIds));

	return orgs.map((org) => ({
		id: org.id,
		slug: org.slug,
		name: org.name,
		// Sorted here rather than in SQL so it doesn't depend on the deployment's
		// collation — `ORDER BY name` under LC_COLLATE=C is byte order, which puts
		// every capitalized name ahead of every lowercase one.
		brands: rows
			.filter((brand) => brand.organizationId === org.id)
			.map(({ id, slug, name, website, onboarded }) => ({ id, slug, name, website, onboarded }))
			.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
	}));
}
