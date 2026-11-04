import { createFileRoute, redirect } from "@tanstack/react-router";

/** The local request handler has already established the session by now. */
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/app" });
	},
});
