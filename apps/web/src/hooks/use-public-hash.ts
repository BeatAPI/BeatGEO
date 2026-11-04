import { useRouter } from "@tanstack/react-router";
import { useCallback, useSyncExternalStore } from "react";

/** URL fragments are absent from SSR requests, so read the browser value after hydration. */
export function usePublicHash() {
	const router = useRouter();
	const subscribe = useCallback(
		(changed: () => void) => {
			const unsubscribe = router.subscribe("onResolved", changed);
			window.addEventListener("hashchange", changed);
			window.addEventListener("popstate", changed);
			return () => {
				unsubscribe();
				window.removeEventListener("hashchange", changed);
				window.removeEventListener("popstate", changed);
			};
		},
		[router],
	);
	return useSyncExternalStore(
		subscribe,
		() => window.location.hash.slice(1),
		() => "",
	);
}
