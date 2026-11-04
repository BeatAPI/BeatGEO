/**
 * /auth/login — the auth plugins' sign-in page. The local workspace has no
 * sign-in form: its session is issued by the local request handler, so this
 * only sends the browser back to the workspace.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/login")({
	beforeLoad: () => {
		throw redirect({ to: "/app" });
	},
});
