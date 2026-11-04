import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { BrandSetup } from "@/components/brand-setup";
import { LanguageSwitch } from "@/components/language-switch";
import { Logo } from "@/components/logo";
import { WebsiteCreate } from "@/components/website-create";
import { useT } from "@/lib/i18n";
import { organizationsQuery } from "@/lib/organizations/queries";
import { firstWebsite } from "@/lib/workspace-entry";

export const Route = createFileRoute("/_authed/setup")({
	validateSearch: (search: Record<string, unknown>): { add?: boolean; org?: string } => ({
		add: search.add === true || search.add === "true" ? true : undefined,
		org: typeof search.org === "string" ? search.org : undefined,
	}),
	beforeLoad: ({ context }) => {
		if (!context.canManageConnections) throw notFound();
	},
	loaderDeps: ({ search }) => search,
	loader: async ({ context, deps, location }) => {
		const { organizations } = await context.queryClient.ensureQueryData(organizationsQuery);
		const website = context.localNavigation?.website ?? firstWebsite(organizations);
		if (!deps.add && website)
			throw redirect({ to: "/app/org/$org/brand/$brand/settings/brand", params: website, hash: location.hash });
		return {
			organization: organizations.find((org) => org.slug === (deps.org ?? website?.org)) ?? organizations[0],
			hasWebsites: Boolean(website),
		};
	},
	component: SetupPage,
});
function SetupPage() {
	const t = useT();
	const { organization, hasWebsites } = Route.useLoaderData();
	return (
		<main className="min-h-svh bg-background">
			<header className="border-b">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
					<Link to="/app">
						<Logo />
					</Link>
					<LanguageSwitch />
				</div>
			</header>
			<div className="mx-auto max-w-6xl px-6 py-10">
				<BrandSetup
					website={
						organization ? <WebsiteCreate organization={organization} /> : <p role="alert">{t("No organizations")}</p>
					}
					actions={
						hasWebsites ? (
							<Link to="/app" className="text-sm underline underline-offset-4">
								{t("Back to workspace")}
							</Link>
						) : undefined
					}
				/>
			</div>
		</main>
	);
}
