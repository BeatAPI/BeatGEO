import type { Meta, StoryObj } from "@storybook/react";
import type { CrawlSummary } from "@workspace/lib/traffic/crawls";
import type { GaSummary } from "@workspace/lib/traffic/ga";
import { expect, fn, userEvent, within } from "storybook/test";
import { TrafficPanel } from "@/components/traffic-panel";
import { LocaleProvider } from "@/lib/i18n";
import type { TrafficData } from "@/server/traffic-core";
import samples from "./traffic-data.json";

const empty: TrafficData = { site: "example.com", gaReady: true, readOnly: false, ga: null, crawls: null };
const connected: TrafficData = {
	...empty,
	ga: { kind: "ga", connected: true, config: { site: "example.com" }, snapshot: null, updatedAt: new Date() },
};
const populated: TrafficData = {
	...connected,
	ga: {
		...connected.ga!,
		config: { site: "example.com", property: { id: "123456789", name: "Example site" } },
		snapshot: samples.ga as GaSummary,
	},
	crawls: {
		kind: "crawls",
		connected: false,
		config: { site: "example.com" },
		snapshot: samples.crawls as CrawlSummary,
		updatedAt: new Date(),
	},
};
const meta = {
	title: "Pages/AI Traffic and Crawls",
	beforeEach: () => {
		window.localStorage.setItem("beatgeo.ui-language", "en");
	},
	component: TrafficPanel,
	args: {
		data: empty,
		properties: [],
		busy: false,
		error: "",
		onConnect: fn(),
		onSync: fn(),
		onDisconnect: fn(),
		onImport: fn(),
	},
	decorators: [
		(Story) => (
			<div className="p-5 max-w-6xl mx-auto">
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof TrafficPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {
	play: async ({ canvasElement, args }) => {
		const c = within(canvasElement);
		await userEvent.click(c.getByRole("button", { name: "Connect Google Analytics" }));
		await expect(args.onConnect).toHaveBeenCalled();
		await expect(c.getByText("No log imported. This does not mean no AI crawler has visited.")).toBeVisible();
	},
};
export const SetupRequired: Story = {
	args: { data: { ...empty, gaReady: false } },
	play: async ({ canvasElement }) => {
		await expect(within(canvasElement).getByRole("button", { name: "Connect Google Analytics" })).toBeDisabled();
	},
};
export const ChooseProperty: Story = {
	args: {
		data: connected,
		properties: [
			{ id: "123456789", name: "Example site" },
			{ id: "987654321", name: "Another property" },
		],
	},
	play: async ({ canvasElement, args }) => {
		const c = within(canvasElement);
		await expect(c.getByRole("button", { name: "Read GA data" })).toBeDisabled();
		await userEvent.selectOptions(c.getByLabelText("GA property"), "123456789");
		await userEvent.click(c.getByRole("button", { name: "Read GA data" }));
		await expect(args.onSync).toHaveBeenCalledWith("123456789");
	},
};
export const Populated: Story = {
	args: { data: populated },
	play: async ({ canvasElement }) => {
		const c = within(canvasElement);
		await expect(c.getByText("AI-attributed sessions")).toBeVisible();
		await userEvent.click(c.getByText("Landing pages and source evidence"));
		await expect(c.getAllByText("doubao.com / referral")[0]).toBeVisible();
	},
};
export const Chinese: Story = {
	beforeEach: () => {
		window.localStorage.setItem("beatgeo.ui-language", "zh");
	},
	args: { data: populated },
	decorators: [
		(Story) => (
			<LocaleProvider initialLocale="zh">
				<Story />
			</LocaleProvider>
		),
	],
};
export const DataLimited: Story = {
	args: {
		data: {
			...populated,
			ga: {
				...populated.ga!,
				snapshot: { ...(samples.ga as GaSummary), warnings: ["sources:thresholded", "landing:sampled"] },
			},
		},
	},
};
export const ConnectionError: Story = {
	args: { data: populated, error: "Google authorization expired or was revoked. Reconnect GA." },
};
