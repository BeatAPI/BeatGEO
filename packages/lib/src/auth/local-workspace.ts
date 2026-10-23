import { createHmac, timingSafeEqual } from "node:crypto";
import type { BetterAuthPlugin, User } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

export const LOCAL_BOOTSTRAP_PATH = "/local-workspace";
export const LOCAL_BOOTSTRAP_HEADER = "x-beatgeo-local-bootstrap";

export function localBootstrapProof(secret: string): string {
	return createHmac("sha256", secret).update("beatgeo-local-workspace-bootstrap").digest("hex");
}

/** Only the in-process HTTP entry can issue a local browser session. */
export function localWorkspacePlugin(ensureOwner: () => Promise<User>) {
	return {
		id: "local-workspace",
		endpoints: {
			bootstrapLocalWorkspace: createAuthEndpoint(LOCAL_BOOTSTRAP_PATH, { method: "POST" }, async (ctx) => {
				const proof = ctx.headers?.get(LOCAL_BOOTSTRAP_HEADER) ?? "";
				const expected = localBootstrapProof(ctx.context.secret);
				if (!/^[0-9a-f]{64}$/.test(proof) || !timingSafeEqual(Buffer.from(proof), Buffer.from(expected)))
					throw new APIError("NOT_FOUND");
				const owner = await ensureOwner();
				const session = await ctx.context.internalAdapter.createSession(owner.id);
				if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
				await setSessionCookie(ctx, { user: owner, session }, false, { sameSite: "strict", httpOnly: true });
				return ctx.json({ ready: true });
			}),
		},
	} satisfies BetterAuthPlugin;
}
