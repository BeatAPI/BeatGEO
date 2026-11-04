import type { LinkProps } from "@tanstack/react-router";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
import type { OrganizationSummary } from "@/lib/organizations/types";

interface RowBase {
	key: string;
	link: LinkProps;
	label: string;
}

export type OrganizationRow =
	| (RowBase & { kind: "brand"; id: string; website: string })
	| (RowBase & { kind: "new-brand" });

export interface OrganizationTree {
	heading: RowBase & { ariaLabel: string };
	children: OrganizationRow[];
}

export function organizationTree(organization: OrganizationSummary): OrganizationTree {
	const children: OrganizationRow[] = organization.brands.map((brand) => ({
		kind: "brand",
		key: brand.id,
		link: { to: "/app/org/$org/brand/$brand", params: brandLinkParams(organization, brand) },
		label: brand.name,
		id: brand.id,
		website: brand.website,
	}));

	const params = orgLinkParams(organization);

	children.push({
		kind: "new-brand",
		key: "new-brand",
		link: { to: "/app/org/$org/new", params },
		label: organization.brands.length > 0 ? "New brand" : "Create your first brand",
	});

	return {
		heading: {
			key: organization.id,
			link: { to: "/app/org/$org/settings", params },
			label: organization.name,
			ariaLabel: `${organization.name} organization settings`,
		},
		children,
	};
}
