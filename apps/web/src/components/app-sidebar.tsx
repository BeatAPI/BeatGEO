import {
	IconBuilding,
	IconBuildings,
	IconChartBar,
	IconCode,
	IconCpu,
	IconDashboard,
	IconFileText,
	IconHistory,
	IconKey,
	IconLink,
	IconListDetails,
	IconPlugConnected,
	IconSchool,
	IconSearch,
	IconTarget,
	IconWorld,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { Logo } from "@/components/logo";
import { NavAppInfo } from "@/components/nav-app-info";
import { type NavGroup, type NavItem, NavMain } from "@/components/nav-main";
import { useLooseRouteContext } from "@/hooks/use-route-context";
import { INSIGHT_PAGES } from "@/lib/insight-navigation";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { SEO_PAGES } from "@/lib/seo-navigation";
import type { ShellScope } from "@/lib/shell-scope";

export type AppSidebarProps = ShellScope;

type SidebarBrand = Pick<BrandWithPrompts, "id" | "slug" | "onboarded">;

function brandGroups(organization: OrganizationSummary, brand: SidebarBrand, seoEnabled: boolean): NavGroup[] {
	const params = brandLinkParams(organization, brand);
	const dashboard: NavItem[] = [
		{ title: "Overview", link: { to: "/app/org/$org/brand/$brand", params }, icon: IconDashboard, exact: true },
	];

	dashboard.push(
		{
			title: "Questions",
			link: { to: "/app/org/$org/brand/$brand/settings/prompts", params },
			icon: IconListDetails,
		},
		{
			title: "Visibility",
			link: { to: INSIGHT_PAGES[0].to, params },
			matchLinks: INSIGHT_PAGES.slice(1).map((page) => ({ to: page.to, params })),
			icon: IconChartBar,
		},
		{
			title: "GEO recommendations",
			link: { to: "/app/org/$org/brand/$brand/opportunities", params },
			icon: IconTarget,
		},
	);

	const groups: NavGroup[] = [];
	if (seoEnabled)
		groups.push({
			label: "SEO",
			items: [
				{
					title: "Search diagnosis",
					link: { to: "/app/org/$org/brand/$brand/opportunities", params, hash: "search" },
					icon: IconTarget,
				},
				...SEO_PAGES.map(
					(page): NavItem => ({
						title: page.title,
						link: { to: "/app/org/$org/brand/$brand/seo", params, hash: page.view === "home" ? "" : page.view },
						icon: {
							home: IconDashboard,
							domain: IconWorld,
							keywords: IconSearch,
							backlinks: IconLink,
							results: IconHistory,
							actions: IconFileText,
						}[page.view],
						exact: true,
					}),
				),
				{
					title: "Search performance",
					link: { to: "/app/org/$org/brand/$brand/search-console", params },
					icon: IconChartBar,
				},
			],
		});
	groups.unshift({ label: "GEO", items: dashboard });
	groups.push({
		label: "Analytics",
		items: [
			{ title: "Traffic analysis", link: { to: "/app/org/$org/brand/$brand/traffic", params }, icon: IconChartBar },
			{
				title: "All improvement actions",
				link: { to: "/app/org/$org/brand/$brand/opportunities", params, hash: "all-actions" },
				icon: IconFileText,
			},
		],
	});

	groups.push({
		label: "Settings",
		items: [
			{
				title: "Competitors",
				link: { to: "/app/org/$org/brand/$brand/settings/competitors", params },
				icon: IconBuildings,
			},
			{
				title: "Monitoring platforms",
				link: { to: "/app/org/$org/brand/$brand/settings/llms", params },
				icon: IconCpu,
			},
		],
	});

	return groups;
}

/** Developer and learning pages, shared by every page so the rail never changes shape. */
function localWorkspaceGroups(organization: OrganizationSummary): NavGroup[] {
	const params = orgLinkParams(organization);
	return [
		{
			label: "Developers",
			items: [
				{ title: "API Keys", link: { to: "/app/org/$org/settings/api-keys", params }, icon: IconKey },
				{ title: "API Docs", link: { to: "/app/org/$org/settings/api", params }, icon: IconCode },
				{ title: "MCP", link: { to: "/app/org/$org/settings/mcp", params }, icon: IconPlugConnected },
				{ title: "Skill", link: { to: "/app/org/$org/settings/skill", params }, icon: IconSchool },
			],
		},
		{
			label: "Learn",
			items: [
				{
					title: "Real workflow case",
					link: { to: "/app/org/$org/settings/cases", params },
					icon: IconSchool,
				},
			],
		},
	];
}

/** One rail on every page: Brand, the current website's SEO and GEO, then developer pages. */
function localSidebarGroups(
	organization: OrganizationSummary | undefined,
	brand: SidebarBrand | undefined,
	canManageConnections: boolean,
): NavGroup[] {
	const groups: NavGroup[] = [
		{
			label: "Workspace",
			items: [
				{
					title: "Brand",
					link:
						organization && brand
							? { to: "/app/org/$org/brand/$brand/settings/brand", params: brandLinkParams(organization, brand) }
							: { to: "/setup" },
					icon: IconBuilding,
				},
			],
		},
	];
	if (organization && brand) groups.push(...brandGroups(organization, brand, canManageConnections));
	if (organization) groups.push(...localWorkspaceGroups(organization));
	return groups;
}

export function AppSidebar({ organization, brand }: AppSidebarProps) {
	const { setOpenMobile } = useSidebar();
	const context = useLooseRouteContext();
	const currentWebsite = context.localNavigation?.website;
	// Org pages carry no brand of their own; follow the website last selected.
	const current =
		brand ??
		organization?.brands.find(
			(candidate) =>
				organization.slug === currentWebsite?.org &&
				(candidate.slug === currentWebsite.brand || candidate.id === currentWebsite.brand),
		);
	const groups = localSidebarGroups(organization, current, Boolean(context.canManageConnections));

	return (
		<Sidebar variant="sidebar">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" render={<Link to="/app" onClick={() => setOpenMobile(false)} />}>
							<Logo />
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain groups={groups} />
			</SidebarContent>
			<SidebarFooter>
				<NavAppInfo />
			</SidebarFooter>
		</Sidebar>
	);
}
