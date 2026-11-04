import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/org/$org/")({
	beforeLoad: ({ context }) => {
		throw redirect({ to: "/app/org/$org/settings", params: { org: context.organization.slug } });
	},
});
