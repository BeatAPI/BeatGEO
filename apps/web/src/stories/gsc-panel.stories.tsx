import type { Meta, StoryObj } from "@storybook/react";
import type { GscSummary } from "@workspace/lib/traffic/gsc";
import { expect, fn, screen, userEvent, within } from "storybook/test";
import { GscPanel } from "@/components/gsc-panel";
import { LocaleProvider } from "@/lib/i18n";

const snapshot: GscSummary = {
	schema: "beat-geo/gsc-summary@1",
	site: "example.com",
	siteUrl: "sc-domain:example.com",
	startDate: "2026-10-01",
	endDate: "2026-10-28",
	fetchedAt: "2026-10-29",
	totals: { clicks: 12, impressions: 240, ctr: 0.05, position: 8 },
	pages: [],
	queries: [{ keys: ["example query"], clicks: 12, impressions: 240, ctr: 0.05, position: 8 }],
	limitReached: false,
	warning: "",
};
const meta = {
	title: "Pages/Search Performance",
	component: GscPanel,
	args: {
		settingsOnly: false,
		showConnect: false,
		data: {
			site: "example.com",
			gaReady: true,
			ga: null,
			crawls: null,
			gsc: {
				kind: "gsc",
				connected: true,
				config: { site: "example.com", property: { id: "sc-domain:example.com", name: "example.com" } },
				snapshot,
				updatedAt: new Date(),
			},
		},
		properties: [{ siteUrl: "sc-domain:example.com" }, { siteUrl: "https://example.com/" }],
		propertiesLoading: false,
		propertiesFailed: false,
		busy: false,
		onConnect: fn(),
		onSync: fn(),
		onDisconnect: fn(),
	},
	decorators: [
		(Story) => (
			<LocaleProvider initialLocale="en">
				<Story />
			</LocaleProvider>
		),
	],
} satisfies Meta<typeof GscPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SearchResults: Story = {
	play: async ({ canvasElement }) => {
		const c = within(canvasElement);
		await expect(c.getByText("example query")).toBeVisible();
		await expect(c.queryByRole("combobox")).toBeNull();
		await expect(c.getByText("example.com", { exact: true })).toBeVisible();
	},
};
export const BrandConnection: Story = {
	args: { settingsOnly: true },
	play: async ({ canvasElement, args }) => {
		const c = within(canvasElement);
		await expect(c.queryByText("example query")).toBeNull();
		await userEvent.click(c.getByRole("combobox", { name: "Search Console property" }));
		await expect(await screen.findByRole("option", { name: "example.com", exact: true })).toBeVisible();
		await expect(screen.getByRole("option", { name: "https://example.com/", exact: true })).toBeVisible();
		await userEvent.click(screen.getByRole("option", { name: "example.com", exact: true }));
		await userEvent.click(c.getByRole("button", { name: "Refresh search data" }));
		await expect(args.onSync).toHaveBeenCalledWith("sc-domain:example.com");
	},
};
