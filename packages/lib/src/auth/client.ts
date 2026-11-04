/**
 * Better-auth client instance.
 *
 * Used by the local MCP consent page.
 */

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: typeof window !== "undefined" ? window.location.origin : "",
	basePath: "/api/auth",
	plugins: [
		// The MCP authorization server's endpoints, and the fetch hook that hands
		// the consent screen's signed query back with the request. That query is
		// what the server checks the signature of, so it has to travel unedited —
		// which is why the page never rebuilds it itself.
		oauthProviderClient(),
	],
});

export type AuthClient = typeof authClient;
