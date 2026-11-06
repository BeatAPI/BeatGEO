import type { Meta, StoryObj } from "@storybook/react";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ComponentType, ReactNode } from "react";
import { expect, within } from "storybook/test";
import { Route } from "@/routes/_authed/app/org/$org/brand/$brand/opportunities";

// The route file exports only `Route` (route files must, for code-splitting).
// Render its component via the route options — the mock exposes `options`.
const OpportunitiesPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

import {
	getMockOpportunitiesCalls,
	resetMockOpportunitiesCalls,
	setMockOpportunities,
} from "./_mocks/server-opportunities";
import { setMockBrand } from "./_mocks/use-brands";
import { mockOpportunities } from "./analytics-fixtures";

const onboardedBrand = {
	id: "brand-1",
	name: "Acme",
	website: "https://acme.com",
	onboarded: true,
	enabled: true,
	prompts: [{ id: "p1", value: "best crm", enabled: true }],
	effectiveModels: ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro"],
	earliestDataDate: "2026-05-05",
	delayOverrideHours: 24,
};

function Shell({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider>
			<div className="bg-background text-foreground antialiased flex min-h-svh flex-col">
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}

const meta = {
	title: "Pages/Opportunities",
	component: OpportunitiesPage,
	parameters: { layout: "fullscreen" },
	beforeEach: () => {
		localStorage.setItem("beatgeo.ui-language", "en");
		resetMockOpportunitiesCalls();
	},
	decorators: [
		(Story, context) => {
			setMockBrand(onboardedBrand);
			setMockOpportunities(
				context.parameters.emptyReport
					? { report: null, reason: "not-generated", generatedFor: null, lastEvaluatedAt: null, model: null }
					: mockOpportunities,
			);
			return (
				<Shell>
					<Story />
				</Shell>
			);
		},
	],
} satisfies Meta<typeof OpportunitiesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		const c = within(canvasElement);
		await expect(await c.findByText(mockOpportunities.report.summary[0])).toBeVisible();
		expect(getMockOpportunitiesCalls().reads).toBeGreaterThan(0);
		expect(getMockOpportunitiesCalls().generations).toBe(0);
	},
};
export const NotGenerated: Story = {
	parameters: { emptyReport: true },
	play: async ({ canvasElement }) => {
		const c = within(canvasElement);
		await expect(await c.findByText("No saved recommendations yet")).toBeVisible();
		await expect(c.getByRole("button", { name: "Generate recommendations · uses API credits" })).toBeVisible();
		expect(getMockOpportunitiesCalls().reads).toBeGreaterThan(0);
		expect(getMockOpportunitiesCalls().generations).toBe(0);
	},
};
