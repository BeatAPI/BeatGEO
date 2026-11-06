import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { type ActionKindFilter, MonitoringLoop } from "@/components/monitoring-loop";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("@/server/monitoring-fn", () => ({
	getMonitoringFn: vi.fn(),
	applyOptimizationActionFn: vi.fn(),
	retestOptimizationActionFn: vi.fn(),
}));
vi.mock("@/components/collection-check", () => ({ CollectionCheck: () => <div>Question collection controls</div> }));
vi.mock("@/components/workspace-control", () => ({ WorkspaceControl: () => <div>GEO runtime controls</div> }));
vi.mock("@/components/content-draft", () => ({ ContentDraft: () => <div>Draft editor</div> }));

const seoAction = {
	id: "seo-1",
	kind: "seo",
	title: "Improve the pricing snippet",
	description: "Reviewed pricing page",
	status: "applied",
	implementationNote: "Updated title",
	comparison: null,
	seoComparison: {
		status: "waiting",
		reasonCode: "waiting_period",
		reason: "Wait for an equally long, non-overlapping full period after implementation (Search Console timezone).",
		windows: {
			baseline: { startDate: "2026-10-01", endDate: "2026-10-28" },
			current: { startDate: "2026-10-03", endDate: "2026-10-30" },
		},
	},
};
const geoAction = {
	...seoAction,
	id: "geo-1",
	kind: "geo",
	title: "Improve citation coverage",
	seoComparison: null,
};

function render(kind: ActionKindFilter, actions = [seoAction, geoAction], locale: "en" | "zh" = "en") {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(["monitoring", "brand-1"], {
		actions,
		attempts: [],
		questions: [],
		runtime: { worker: "ready" },
	});
	return renderToStaticMarkup(
		<LocaleProvider initialLocale={locale}>
			<QueryClientProvider client={client}>
				<MonitoringLoop brandId="brand-1" initialKind={kind} />
			</QueryClientProvider>
		</LocaleProvider>,
	);
}

describe("SEO and GEO action journeys", () => {
	it("keeps SEO actions focused on search periods and gives a route back to diagnosis", () => {
		const html = render("seo");
		expect(html).toContain("Improve the pricing snippet");
		expect(html).not.toContain("Improve citation coverage");
		expect(html).not.toContain("Question collection controls");
		expect(html).not.toContain("GEO runtime controls");
		expect(html).not.toContain("Retest · uses configured providers");
		expect(html).toContain("2026-10-01");
		expect(html).toContain("2026-10-30");
		expect(html).toContain("non-overlapping full period");
		expect(html).toContain('href="/opportunities#search"');
		expect(html).toContain('id="optimization-action-seo-1"');
	});

	it("preserves question collection and retesting for GEO", () => {
		const html = render("geo");
		expect(html).toContain("Question collection controls");
		expect(html).toContain("Retest · uses configured providers");
		expect(html).toContain("Improve citation coverage");
		expect(html).not.toContain("Improve the pricing snippet");
	});

	it("shows both types when all actions are selected", () => {
		const html = render("all");
		expect(html).toContain("Improve the pricing snippet");
		expect(html).toContain("Improve citation coverage");
	});

	it("directs an empty SEO list to diagnosis rather than question collection", () => {
		const html = render("seo", []);
		expect(html).toContain("No SEO actions yet. Review search diagnosis and save a candidate.");
		expect(html).toContain('href="/opportunities#search"');
		expect(html).not.toContain("Collect a baseline");
	});

	it("localizes persisted SEO comparison reasons", () => {
		expect(render("seo", [seoAction], "zh")).toContain("请等待实施后的完整等长周期");
	});
});
