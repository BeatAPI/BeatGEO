import { useLooseRouteContext } from "@/hooks/use-route-context";
import type { PublicClientConfig } from "@/server/config";

export function useBranding(): PublicClientConfig["branding"] | undefined {
	return useLooseRouteContext().clientConfig?.branding;
}
