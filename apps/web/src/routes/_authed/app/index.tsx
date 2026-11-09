import { createFileRoute, redirect } from "@tanstack/react-router";
import { organizationsQuery } from "@/lib/organizations/queries";
import { firstWebsite } from "@/lib/workspace-entry";

export const Route = createFileRoute("/_authed/app/")({
	loader: async ({ context }) => {
		const { organizations } = await context.queryClient.ensureQueryData(organizationsQuery);
		const website = context.localNavigation?.website ?? firstWebsite(organizations);
		if (website) throw redirect({ to: "/app/org/$org/brand/$brand", params: website });
		throw redirect({ to: "/setup" });
	},
});
