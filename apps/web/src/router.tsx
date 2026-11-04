import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { NotFoundPage } from "./components/not-found-page";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { localPathRewrite } from "./lib/local-paths";
import { parseRouterSearch, stringifyRouterSearch } from "./lib/router-search";
import { DefaultErrorComponent, DefaultPendingComponent } from "./router-default-components";
import { routeTree } from "./routeTree.gen";
import { getLocalNavigationFn } from "./server/local-navigation";

export const getRouter = async () => {
	const rqContext = TanstackQuery.getContext();
	const localNavigation = await getLocalNavigationFn();

	const router = createRouter({
		routeTree,
		parseSearch: parseRouterSearch,
		stringifySearch: stringifyRouterSearch,
		// clientConfig and envValidation are provided by __root.tsx's beforeLoad
		context: { ...rqContext, localNavigation },
		rewrite: localNavigation ? localPathRewrite(localNavigation.website) : undefined,
		defaultPreload: "intent",
		defaultNotFoundComponent: NotFoundPage,
		defaultErrorComponent: DefaultErrorComponent,
		defaultPendingComponent: DefaultPendingComponent,
		defaultStaleTime: 30_000, // Cache loader data for 30s to avoid re-fetching on navigations
	});

	setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient });

	return router;
};
