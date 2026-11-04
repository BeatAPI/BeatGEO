import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { LOCAL_BOOTSTRAP_HEADER, LOCAL_BOOTSTRAP_PATH, localBootstrapProof } from "@workspace/lib/auth/local-workspace";
import { startCredentialRefresh } from "@workspace/lib/secrets";
import { handleLocalWorkspaceRequest } from "@/lib/auth/local-request";
import { auth } from "@/lib/auth/server";
import { addSecurityHeaders } from "@/lib/security-headers";

// Not awaited: the app has to serve the workspace and settings whether or not the
// credential store is reachable.
void startCredentialRefresh();

export default createServerEntry({
	async fetch(request: Request) {
		const response = await handleLocalWorkspaceRequest(request, {
			appUrl: process.env.APP_URL || "http://localhost:3140",
			getSession: (headers) => auth.api.getSession({ headers }),
			bootstrap: async () => {
				const context = await auth.$context;
				return auth.handler(
					new Request(new URL(`/api/auth${LOCAL_BOOTSTRAP_PATH}`, context.baseURL), {
						method: "POST",
						headers: {
							[LOCAL_BOOTSTRAP_HEADER]: localBootstrapProof(context.secret),
							"Content-Type": "application/json",
						},
						body: "{}",
					}),
				);
			},
			next: (localRequest) => handler.fetch(localRequest),
		});
		return addSecurityHeaders(response, response.ok && /^\/api\/seo\/[^/]+\//.test(new URL(request.url).pathname));
	},
});
