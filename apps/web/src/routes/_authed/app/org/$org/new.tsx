import { createFileRoute, redirect } from "@tanstack/react-router";

/** Brands are added through local setup; this keeps old links working. */
export const Route = createFileRoute("/_authed/app/org/$org/new")({
	loader: () => {
		throw redirect({ to: "/setup", search: { add: true } });
	},
});
