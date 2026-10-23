import {
	IconBriefcase,
	IconBuilding,
	IconBuildings,
	IconChartBar,
	IconCode,
	IconCpu,
	IconCreditCard,
	IconDashboard,
	IconKey,
	IconListDetails,
	IconPlugConnected,
	IconSchool,
	IconTarget,
	IconUsers,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { DeploymentMode, FeaturesConfig } from "@workspace/config/types";
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
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import { NavAppInfo } from "@/components/nav-app-info";
import { type NavGroup, type NavItem, NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useLooseRouteContext, useViewer } from "@/hooks/use-route-context";
import { adminNavItems } from "@/lib/admin-nav";
import { INSIGHT_PAGES } from "@/lib/insight-navigation";
import type { OrganizationSummary } from "@/lib/organizations/types";
import type { ShellScope } from "@/lib/shell-scope";

export type AppSidebarProps = ShellScope;

function organizationGroups(
	organization: OrganizationSummary,
	features?: FeaturesConfig,
	mode?: DeploymentMode,
): NavGroup[] {
	const params = orgLinkParams(organization);
	const items: NavItem[] = [
		...(mode === "local"
			? []
			: [
					{
						title: "Organization",
						link: { to: "/app/org/$org/settings" as const, params },
						icon: IconBriefcase,
						exact: true,
					},
				]),
		{ title: "Brands", link: { to: "/app/org/$org/settings/brands", params }, icon: IconBuildings },
	];

	if (features?.teamInvites) {
		items.push({ title: "Team", link: { to: "/app/org/$org/settings/members", params }, icon: IconUsers });
	}

	if (features?.billing) {
		items.push({ title: "Billing", link: { to: "/app/org/$org/settings/billing", params }, icon: IconCreditCard });
	}

	items.push({ title: "API Keys", link: { to: "/app/org/$org/settings/api-keys", params }, icon: IconKey });

	const docs: NavItem[] = [
		{ title: "API", link: { to: "/app/org/$org/settings/api", params }, icon: IconCode },
		{ title: "MCP", link: { to: "/app/org/$org/settings/mcp", params }, icon: IconPlugConnected },
	];

	if (mode === "local")
		docs.push({ title: "Real workflow case", link: { to: "/app/org/$org/settings/cases", params }, icon: IconSchool });

	// The skill is BeatGEO's, and whitelabel deployments never point users at BeatGEO.
	if (mode !== "whitelabel") {
		docs.push({ title: "Skill", link: { to: "/app/org/$org/settings/skill", params }, icon: IconSchool });
	}

	// Org pages replace the brand menu, so keep a way straight back to each brand's dashboard.
	const brands: NavItem[] = organization.brands.map((brand) => ({
		title: brand.name,
		link: { to: "/app/org/$org/brand/$brand", params: brandLinkParams(organization, brand) },
		icon: IconDashboard,
		exact: true,
	}));

	return [
		...(brands.length > 0 ? [{ label: "Brand dashboards", items: brands }] : []),
		{ label: mode === "local" ? "Workspace" : "Organization Settings", items },
		{ label: "Docs", items: docs },
	];
}

function brandGroups(organization: OrganizationSummary, brand: BrandWithPrompts): NavGroup[] {
	const params = brandLinkParams(organization, brand);
	const dashboard: NavItem[] = [
		{ title: "Overview", link: { to: "/app/org/$org/brand/$brand", params }, icon: IconDashboard, exact: true },
	];

	if (brand.onboarded) {
		dashboard.push(
			{
				title: "Answer Engine Insights",
				link: { to: INSIGHT_PAGES[0].to, params },
				matchLinks: INSIGHT_PAGES.slice(1).map((page) => ({ to: page.to, params })),
				icon: IconChartBar,
			},
			{ title: "Opportunities", link: { to: "/app/org/$org/brand/$brand/opportunities", params }, icon: IconTarget },
		);
	}

	const groups: NavGroup[] = [{ label: "Dashboard", items: dashboard }];

	if (brand.onboarded) {
		groups.push({
			label: "Settings",
			items: [
				{ title: "Brand", link: { to: "/app/org/$org/brand/$brand/settings/brand", params }, icon: IconBuilding },
				{
					title: "Competitors",
					link: { to: "/app/org/$org/brand/$brand/settings/competitors", params },
					icon: IconBuildings,
				},
				{
					title: "Prompts",
					link: { to: "/app/org/$org/brand/$brand/settings/prompts", params },
					icon: IconListDetails,
				},
				{ title: "LLMs", link: { to: "/app/org/$org/brand/$brand/settings/llms", params }, icon: IconCpu },
			],
		});
	}

	return groups;
}

export function AppSidebar({ section, organization, brand }: AppSidebarProps) {
	const { setOpenMobile } = useSidebar();
	const { isAdmin, hasReportAccess } = useViewer();
	const features = useDeploymentFeatures();
	const context = useLooseRouteContext();
	const mode = context.clientConfig?.mode;
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = features?.reportGeneration ?? true;

	// A gate page offers no destinations: every link would either 404 or bounce
	// the user straight back to the gate.
	const adminItems =
		mode === "local" || section === "account" ? [] : adminNavItems({ isAdmin, hasReportAccess, reportsEnabled });

	const groups: NavGroup[] = [
		...(mode === "local"
			? [{ label: "Workspace", items: [{ title: "Brands", link: { to: "/app" as const }, icon: IconBuildings }] }]
			: []),
		...(context.canManageConnections && mode === "local"
			? [
					{
						label: "Setup",
						items: [{ title: "Connections", link: { to: "/setup" as const }, icon: IconPlugConnected }],
					},
				]
			: []),
		...(section === "brand" && organization && brand ? brandGroups(organization, brand) : []),
		...(section === "organization" && organization ? organizationGroups(organization, features, mode) : []),
		...(section === "admin" && adminItems.length > 0 ? [{ label: "Admin", items: adminItems }] : []),
	];
	if (mode === "local" && section === "brand" && organization) {
		groups.push({
			label: "Learn",
			items: [
				{
					title: "Real workflow case",
					link: { to: "/app/org/$org/settings/cases", params: orgLinkParams(organization) },
					icon: IconSchool,
				},
			],
		});
	}
	const brandmark = (
		<>
			<Logo />
			<div className="ml-auto group-data-[collapsible=icon]:hidden">
				<DemoModePill />
			</div>
		</>
	);

	return (
		<Sidebar variant="sidebar">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						{/* On a gate page the mark still says whose product this is, but it
						    leads nowhere — /app would redirect right back here. */}
						{section === "account" ? (
							<div className="flex items-center gap-2 p-2">{brandmark}</div>
						) : (
							<SidebarMenuButton size="lg" render={<Link to="/app" onClick={() => setOpenMobile(false)} />}>
								{brandmark}
							</SidebarMenuButton>
						)}
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain groups={groups} />
			</SidebarContent>
			<SidebarFooter>
				{mode !== "local" && (
					<NavUser showOrganizations={section !== "account"} adminItems={section === "admin" ? [] : adminItems} />
				)}
				<NavAppInfo />
			</SidebarFooter>
		</Sidebar>
	);
}
