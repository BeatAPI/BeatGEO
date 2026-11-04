/**
 * The workspace's branding, assembled from env alone and cached at module
 * scope. Node-safe, so the worker can read it without loading React.
 */

import { DEFAULT_APP_ICON, DEFAULT_APP_NAME, DEFAULT_APP_URL, DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { getEnv } from "@workspace/config/env";
import type { Deployment } from "@workspace/config/types";

type Env = Record<string, string | undefined>;

export function buildDeployment(env: Env): Deployment {
	// The localhost URL fallback keeps this total: a missing APP_URL surfaces on
	// the env-validation page rather than throwing here.
	return {
		branding: {
			name: getEnv("APP_NAME", DEFAULT_APP_NAME, env),
			icon: getEnv("APP_ICON", DEFAULT_APP_ICON, env),
			url: getEnv("APP_URL", DEFAULT_APP_URL, env),
			parentName: env.APP_PARENT_NAME,
			parentUrl: env.APP_PARENT_URL,
			chartColors: DEFAULT_CHART_COLORS,
		},
	};
}

let cached: Deployment | null = null;

export interface GetDeploymentOptions {
	env?: Env;
}

export function getDeployment(options?: GetDeploymentOptions): Deployment {
	cached ??= buildDeployment(options?.env ?? process.env);
	return cached;
}

/** Reset the cached deployment instance. Only used in tests. */
export function resetDeploymentCache(): void {
	cached = null;
}
