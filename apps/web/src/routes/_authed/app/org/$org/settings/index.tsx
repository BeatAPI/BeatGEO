import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/org/$org/settings/")({
	beforeLoad: ({ context }) => {
		throw redirect({ to: "/app/org/$org/settings/brands", params: { org: context.organization.slug } });
	},
});
