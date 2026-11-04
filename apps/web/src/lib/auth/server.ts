/**
 * Auth instance for the web app.
 *
 * Created once at module scope using the shared factory from @workspace/lib.
 * The local workspace plugin issues the only session: there are no passwords
 * and no sign-up.
 *
 * This is the single source of truth for the server-side auth object.
 * All server functions, middleware, and route handlers import from here.
 */
import { localWorkspacePlugin } from "@workspace/lib/auth/local-workspace";
import { createAuth } from "@workspace/lib/auth/server";
import { ensureLocalWorkspace } from "@workspace/lib/db/local-workspace";

export const auth = createAuth({ extraPlugins: [localWorkspacePlugin(ensureLocalWorkspace)] });

// The runtime's unhandled-rejection log drops the error's `cause`.
auth.$context.catch((error: unknown) => {
	console.error("[auth] init failed:", error);
	throw error;
});
