import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";
import { OrganizationDirectory } from "@/components/organization-directory";
import { useT } from "@/lib/i18n";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { pageHead } from "@/lib/route-head";
import { syncOrganizationMembershipsFn } from "@/server/organizations";

function OrganizationPickerSkeleton() {
	return (
		<FullPageCard title="" subtitle="">
			<div className="flex min-w-[200px] flex-col space-y-3">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		</FullPageCard>
	);
}

export const Route = createFileRoute("/_authed/app/")({
	pendingComponent: OrganizationPickerSkeleton,
	loader: async ({ context }): Promise<OrganizationSummary[]> => {
		// Only whitelabel keeps memberships anywhere else, and asking elsewhere is
		// a round trip that returns false in front of this page's only real read.
		if (context.clientConfig?.mode === "whitelabel" && (await syncOrganizationMembershipsFn())) {
			await invalidateOrganizations(context.queryClient);
		}
		const organizations = (await context.queryClient.ensureQueryData(organizationsQuery)).organizations;
		if (context.clientConfig?.mode === "local" && organizations.length === 1 && organizations[0].brands.length === 0)
			throw redirect({ to: "/app/org/$org/new", params: { org: organizations[0].slug } });
		return organizations;
	},
	head: pageHead({ title: "Organizations and Brands", description: "Modify organizations or navigate to brands." }),
	component: OrganizationPickerPage,
});

function OrganizationPickerPage() {
	const t = useT();
	const organizations = Route.useLoaderData();
	const context = Route.useRouteContext();
	if (context.clientConfig?.mode === "local") return <LocalWorkspace organizations={organizations} />;

	if (organizations.length === 0) {
		return (
			<FullPageCard title={t("No organizations")} subtitle={t("Your account isn't a member of an organization yet.")}>
				<p className="text-center text-muted-foreground">{t("Ask an admin to invite you, then reload this page.")}</p>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title={t("Organizations and Brands")} subtitle={t("Modify organizations or navigate to brands.")}>
			<OrganizationDirectory organizations={organizations} />
		</FullPageCard>
	);
}

function LocalWorkspace({ organizations }: { organizations: OrganizationSummary[] }) {
	const t = useT();
	return (
		<FullPageCard
			title={t("Your websites")}
			subtitle={t("Open a website to view its questions, answers and progress.")}
		>
			<div className="flex w-full flex-col gap-3">
				{organizations.flatMap((organization) =>
					organization.brands.map((brand) => (
						<Link
							key={brand.id}
							to="/app/org/$org/brand/$brand"
							params={{ org: organization.slug, brand: brand.slug || brand.id }}
							className="rounded-lg border p-4 hover:bg-accent"
						>
							<p className="font-medium">{brand.name}</p>
							<p className="text-sm text-muted-foreground">{brand.website}</p>
						</Link>
					)),
				)}
				{organizations.map((organization) => (
					<Link
						key={organization.id}
						to="/app/org/$org/new"
						params={{ org: organization.slug }}
						className="text-sm underline"
					>
						{t("Add a website")}
					</Link>
				))}
				<Link to="/setup" className="text-sm underline">
					{t("Connect BeatAPI and your browser")}
				</Link>
			</div>
		</FullPageCard>
	);
}
