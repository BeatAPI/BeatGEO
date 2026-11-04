interface OrganizationBrand {
	id: string;
	slug: string | null;
	name: string;
	website: string;
	onboarded: boolean;
}

export interface OrganizationSummary {
	id: string;
	slug: string;
	name: string;
	brands: OrganizationBrand[];
}

export interface OrganizationsView {
	signedIn: boolean;
	organizations: OrganizationSummary[];
}
