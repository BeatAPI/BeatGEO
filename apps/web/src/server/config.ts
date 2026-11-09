/**
 * Server functions for providing deployment configuration to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getEnvValidationState } from "@workspace/config/env";
import type { ClientConfig } from "@workspace/config/types";
import { getDeployment } from "@workspace/deployment";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { countUsers } from "@workspace/lib/db/provisioning";
import { storedCredentialsLoaded, withStoredCredentials } from "@workspace/lib/secrets";

export type PublicClientConfig = ClientConfig;

/**
 * Get the client-safe deployment configuration. Called in the root route's
 * loader so the config is available to all routes via context; the return value
 * must be fully serializable.
 */
export const getClientConfig = createServerFn({ method: "GET" }).handler(async (): Promise<PublicClientConfig> => {
	const deployment = getDeployment();
	const userCount = await countUsers();

	return {
		branding: deployment.branding,
		defaultDelayHours: getDefaultDelayHours(),
		hasUsers: userCount > 0,
	};
});

export const getEnvValidationStateFn = createServerFn({ method: "GET" }).handler(async () => {
	await storedCredentialsLoaded();
	const envState = getEnvValidationState(withStoredCredentials());
	// Opening a local workspace never requires a research key.
	const missing = envState.missing.filter((item) => item.id !== "RESEARCH_PROVIDER");
	return {
		missing,
		isValid: missing.length === 0,
	};
});
