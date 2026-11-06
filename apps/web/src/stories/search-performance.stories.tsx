import type { Meta, StoryObj } from "@storybook/react-vite";
import type { GaPerformance, GaPerformanceReport } from "@workspace/lib/traffic/ga";
import type { GscWindow } from "@workspace/lib/traffic/gsc";
import { expect, userEvent, within } from "storybook/test";
import { GaPerformancePanel, GscRelationships } from "@/components/search-performance";
import { LocaleProvider } from "@/lib/i18n";

const meta = {
	title: "Pages/Search performance",
	decorators: [
		(Story) => (
			<div className="p-6 max-w-6xl">
				<Story />
			</div>
		),
	],
	beforeEach: () => {
		localStorage.setItem("beatgeo.ui-language", "en");
	},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dataset = {
	dimensions: ["query", "page"],
	rows: [{ keys: ["image api", "https://example.com/pricing"], clicks: 4, impressions: 500, ctr: 0.008, position: 7 }],
	returnedRows: 1,
	limitReached: true,
	providerLimited: true,
};
const current: GscWindow = {
	schema: "beat-geo/gsc-summary@1",
	site: "example.com",
	siteUrl: "https://example.com/",
	startDate: "2026-10-01",
	endDate: "2026-10-28",
	fetchedAt: "2026-11-01T00:00:00Z",
	totals: null,
	pages: [],
	queries: [],
	limitReached: false,
	warning: "limited",
	queryPages: dataset,
	daily: { ...dataset, dimensions: ["date"], rows: [{ ...dataset.rows[0], keys: ["2026-10-02"] }] },
	dailyPages: { ...dataset, dimensions: ["date", "page"], rows: [] },
};
export const JointEvidence: Story = {
	render: () => (
		<GscRelationships
			analysis={{
				schema: "beat-geo/gsc-analysis@1",
				timezone: "America/Los_Angeles",
				current,
				previous: { ...current, startDate: "2026-09-03", endDate: "2026-09-30", queryPages: { ...dataset, rows: [] } },
			}}
		/>
	),
	play: async ({ canvasElement }) => {
		const c = within(canvasElement);
		await expect(c.getByText("image api")).toBeVisible();
		await expect(c.getByText("0.80%")).toBeVisible();
		await expect(c.getByText("Row limit reached. This view is incomplete.")).toBeVisible();
		await userEvent.click(c.getByRole("combobox", { name: "Search evidence view" }));
		await userEvent.click(await within(document.body).findByRole("option", { name: "Daily totals", exact: true }));
		await expect(c.getByText("2026-10-02")).toBeVisible();
		await userEvent.click(c.getByRole("combobox", { name: "Search evidence view" }));
		await userEvent.click(await within(document.body).findByRole("option", { name: "Query × page", exact: true }));
		await userEvent.click(c.getByRole("combobox", { name: "Comparison period" }));
		await userEvent.click(await within(document.body).findByRole("option", { name: "Previous period", exact: true }));
		await expect(c.queryByText("image api")).toBeNull();
		await expect(c.getByText(/2026-09-03/)).toBeVisible();
	},
};
const report: GaPerformanceReport = {
	preset: "organicPages",
	dimensions: ["landingPage"],
	rows: [
		{
			dimensions: { landingPage: "/pricing" },
			metrics: { sessions: 10, engagedSessions: 8, keyEvents: 15, sessionKeyEventRate: 0.6 },
		},
	],
	rowCount: 1,
	limitReached: false,
	metadata: [
		{
			subjectToThresholding: true,
			dataLossFromOtherRow: false,
			sampled: false,
			restricted: false,
			timeZone: "America/New_York",
			emptyReason: "",
		},
	],
};
const ga: GaPerformance = {
	schema: "beat-geo/ga-performance@1",
	property: { id: "1", name: "Example" },
	site: "example.com",
	timeZone: "America/New_York",
	fetchedAt: "2026-11-01T00:00:00Z",
	current: {
		startDate: "2026-10-01",
		endDate: "2026-10-28",
		channels: report,
		organicPages: report,
		googleOrganicPages: report,
	},
	previous: {
		startDate: "2026-09-03",
		endDate: "2026-09-30",
		channels: { ...report, rows: [] },
		organicPages: report,
		googleOrganicPages: report,
	},
	warning: "Different measurements",
};
export const AcquisitionRates: Story = {
	render: () => <GaPerformancePanel data={ga} />,
	play: async ({ canvasElement }) => {
		const c = within(canvasElement);
		await expect(c.getByText("60.00%")).toBeVisible();
		await expect(c.queryByText("150.00%")).toBeNull();
		await userEvent.click(c.getByRole("combobox", { name: "Acquisition view" }));
		await userEvent.click(
			await within(document.body).findByRole("option", { name: "Google organic landing pages", exact: true }),
		);
		await expect(c.getByText("/pricing")).toBeVisible();
	},
};
export const ChineseLabels: Story = {
	beforeEach: () => {
		localStorage.setItem("beatgeo.ui-language", "zh");
	},
	render: () => (
		<LocaleProvider initialLocale="zh">
			<GaPerformancePanel data={ga} />
		</LocaleProvider>
	),
	play: async ({ canvasElement }) => {
		const c = within(canvasElement);
		await expect(c.getByText("获客渠道与自然搜索")).toBeVisible();
		await expect(c.getByRole("combobox", { name: "获客数据视图" })).toBeVisible();
	},
};
