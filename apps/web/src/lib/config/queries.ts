import { getClientConfig, getEnvValidationStateFn } from "@/server/config";

/**
 * The server answers this per request; the client keeps its answer for the
 * life of the page, seeded from the server render, so no navigation pays for
 * it.
 */
export const rootConfigQuery = {
	queryKey: ["root-config"] as const,
	queryFn: async () => {
		const [clientConfig, envValidation] = await Promise.all([getClientConfig(), getEnvValidationStateFn()]);
		return { clientConfig, envValidation };
	},
	staleTime: Number.POSITIVE_INFINITY,
};
