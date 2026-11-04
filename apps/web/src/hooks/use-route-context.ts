import { useRouteContext } from "@tanstack/react-router";

export function useLooseRouteContext() {
	return useRouteContext({ strict: false });
}
