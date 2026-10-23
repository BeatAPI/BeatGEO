/**
 * Auth instance for the web app.
 *
 * Created once at module scope using the shared factory from @workspace/lib,
 * with deployment-specific options injected based on DEPLOYMENT_MODE.
 *
 * This is the single source of truth for the server-side auth object.
 * All server functions, middleware, and route handlers import from here.
 */
import { getCloudAuthOptions } from "@workspace/deployment/auth-hooks/cloud";
import { getWhitelabelAuthOptions } from "@workspace/deployment/auth-hooks/whitelabel";
import { localWorkspacePlugin } from "@workspace/lib/auth/local-workspace";
import { type CreateAuthOptions, createAuth } from "@workspace/lib/auth/server";
import { ensureLocalWorkspace } from "@workspace/lib/db/local-workspace";

function getLocalAuthOptions(): CreateAuthOptions {
	return {
		emailAndPasswordEnabled: false,
		disableSignUp: true,
		extraPlugins: [localWorkspacePlugin(ensureLocalWorkspace)],
	};
}

function getDeploymentAuthOptions(): CreateAuthOptions | undefined {
	switch (process.env.DEPLOYMENT_MODE) {
		case "whitelabel":
			return getWhitelabelAuthOptions();
		case "demo":
			// Demo deployments authenticate only the provisioned demo user.
			return { disableSignUp: true };
		case "cloud": {
			// Full cloud auth stack (email verification, Google OAuth, Resend
			// transactional email, team invitations, disposable-domain blocking,
			// invite-only allowlist, and umbrella-org provisioning). The cloud
			// package owns the entire hook chain — this case is a single call.
			return getCloudAuthOptions();
		}
		default:
			return process.env.READ_ONLY === "true" ? { disableSignUp: true } : getLocalAuthOptions();
	}
}

export const auth = createAuth(getDeploymentAuthOptions());

// The runtime's unhandled-rejection log drops the error's `cause`.
auth.$context.catch((error: unknown) => {
	console.error("[auth] init failed:", error);
	throw error;
});
