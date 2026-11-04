import { createFileRoute, redirect } from "@tanstack/react-router";

/** The workspace documents its own API, from the spec this instance serves. */
export const Route = createFileRoute("/api/v1/docs/")({
	beforeLoad: () => {
		throw redirect({ href: "/developers/api" });
	},
	component: () => null,
});
