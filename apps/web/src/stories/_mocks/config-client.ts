/**
 * Mock for @/lib/config/client — provides a controllable clientConfig.
 *
 * Components import `clientConfig` directly from this module.
 * Stories call `setMockClientConfig()` before rendering to control values.
 */

import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";

export interface BrandingConfig {
	name: string;
	icon?: string;
	url?: string;
	parentName?: string;
	parentUrl?: string;
	chartColors: string[];
}

export interface AnalyticsConfig {
	plausibleDomain?: string;
	clarityProjectId?: string;
}

export interface ClientConfig {
	branding: BrandingConfig;
	analytics: AnalyticsConfig;
	defaultDelayHours?: number;
	hasUsers?: boolean;
}

// ---------------------------------------------------------------------------
// Module-level config that stories can mutate
// ---------------------------------------------------------------------------

let _config: ClientConfig = {
	branding: {
		name: "BeatGEO",
		chartColors: DEFAULT_CHART_COLORS,
	},
	analytics: {},
	defaultDelayHours: 24,
	hasUsers: true,
};

export function setMockClientConfig(config: ClientConfig) {
	_config = config;
}

/**
 * Proxy-like object that always reads from the current `_config`.
 * This ensures that stories calling `setMockClientConfig` before render
 * will have the updated config read by child components.
 */
export const clientConfig: ClientConfig = new Proxy({} as ClientConfig, {
	get(_target, prop: string) {
		return (_config as unknown as Record<string, unknown>)[prop];
	},
});

export { _config as getDeployment };
