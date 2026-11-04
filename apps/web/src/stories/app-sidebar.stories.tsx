/**
 * Stories for <AppSidebar />: the one rail the local workspace shows, from a
 * brand page and from an organization page.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { DEFAULT_CHART_COLORS } from "@workspace/config/constants";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { expect, within } from "storybook/test";
import { AppSidebar } from "@/components/app-sidebar";
import { type ClientConfig, setMockClientConfig } from "./_mocks/config-client";
import { setMockOrganizations } from "./_mocks/server-organizations";
import { setMockRouteContext } from "./_mocks/tanstack-router";
import { setMockBrand } from "./_mocks/use-brands";

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const onboardedBrand = {
	id: "brand-1",
	name: "Acme Corp",
	website: "https://acme.com",
	enabled: true,
	onboarded: true,
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

const organization = {
	id: "org-1",
	slug: "mock-organization",
	name: "Acme",
	brands: [{ id: "brand-1", slug: null, name: "Acme Corp", website: "https://acme.com", onboarded: true }],
};

const localConfig: ClientConfig = {
	branding: { name: "BeatGEO", chartColors: DEFAULT_CHART_COLORS },
	analytics: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configureMocks(brand: typeof onboardedBrand) {
	setMockClientConfig(localConfig);
	setMockBrand(brand);
	setMockOrganizations([organization]);
	setMockRouteContext({ clientConfig: localConfig, canManageConnections: true });
	return brand;
}

/**
 * Wrapper that contains the sidebar within a bounded box.
 *
 * The shadcn Sidebar uses `position: fixed` and `h-svh` / `min-h-svh` which
 * would otherwise break out of the story frame and overlap Ladle's own UI.
 *
 * Two constraints keep it bounded:
 *  1. `transform: translate(0)` on the outer div creates a new CSS containing
 *     block so that `position: fixed` children are positioned relative to this
 *     container instead of the viewport.
 *  2. Scoped style overrides swap `h-svh` / `min-h-svh` for `h-full` /
 *     `min-h-full` so the sidebar fits the container's height.
 */
function SidebarFrame({ children, label }: { children: React.ReactNode; label: string }) {
	return (
		<div
			className="sidebar-story-container relative h-[600px] w-full max-w-[1200px] border rounded-lg overflow-hidden bg-background"
			style={{ transform: "translate(0)" }}
		>
			<style>{`
				.sidebar-story-container [data-slot="sidebar-wrapper"] {
					min-height: 100% !important;
					height: 100% !important;
				}
				.sidebar-story-container [data-slot="sidebar-container"] {
					position: absolute !important;
					height: 100% !important;
				}
			`}</style>
			<SidebarProvider>
				{children}
				<SidebarInset>
					<div className="flex items-center justify-center h-full text-muted-foreground text-sm">{label}</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export default {
	title: "App Sidebar",
} satisfies Meta;

/** Local workspace exposes no account or organization controls. */
export const Local: StoryObj = {
	render: () => {
		const brand = configureMocks(onboardedBrand);

		return (
			<SidebarFrame label="Local workspace">
				<AppSidebar section="brand" brand={brand} organization={organization} />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("Workspace")).toBeVisible();
		await expect(canvas.getByText("SEO", { exact: true })).toBeVisible();
		await expect(canvas.getByText("GEO", { exact: true })).toBeVisible();
		await expect(canvas.getByText("Search performance")).toBeVisible();
		await expect(canvas.queryByRole("button", { name: "Account and organizations" })).toBeNull();
		await expect(canvas.queryByRole("button", { name: "Account" })).toBeNull();
		for (const label of ["Log out", "Team", "Organization", "Organization Settings", "Workflows", "Tools"])
			await expect(canvas.queryByText(label)).toBeNull();
	},
};

/** Organization settings — the keys page and the docs beside it */
export const OrganizationSettings: StoryObj = {
	render: () => {
		configureMocks(onboardedBrand);

		return (
			<SidebarFrame label="Organization settings">
				<AppSidebar section="organization" organization={organization} />
			</SidebarFrame>
		);
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Developers")).toBeVisible();
		await expect(await canvas.findByText("API Keys")).toBeVisible();
		await expect(await canvas.findByText("API Docs")).toBeVisible();
		await expect(await canvas.findByText("MCP")).toBeVisible();
	},
};
