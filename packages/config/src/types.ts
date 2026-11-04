export interface AnalyticsConfig {
	plausibleDomain?: string;
	clarityProjectId?: string;
	posthogKey?: string;
}

export interface BrandingConfig {
	name: string;
	icon: string;
	url: string;
	parentName?: string;
	parentUrl?: string;
	chartColors: string[];
}

export interface Deployment {
	branding: BrandingConfig;
}

/** Serializable deployment configuration exposed to browser code. */
export interface ClientConfig {
	branding: BrandingConfig;
	analytics: AnalyticsConfig;
	/** Prompt cadence in hours when a brand has no override. */
	defaultDelayHours: number;
	hasUsers: boolean;
}

export interface EnvRequirement {
	id: string;
	label: string;
	description?: string;
	isSatisfied: (env: Record<string, string | undefined>) => boolean;
}
