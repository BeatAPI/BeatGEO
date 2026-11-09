import { createFileRoute, Link } from "@tanstack/react-router";
import { AiPlatformReports } from "@/components/ai-platform-reports";
import { MonitoringStart } from "@/components/monitoring-start";
import { PromptsDisplay } from "@/components/prompts-display";
import { useBrandParams } from "@/hooks/use-route-params";
import { useT } from "@/lib/i18n";
import { coercePromptOrder, DEFAULT_PROMPT_ORDER, type PromptOrder } from "@/lib/prompt-order";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/visibility")({
	staticData: { crumb: "Visibility" },
	validateSearch: (search: Record<string, unknown>): { order?: PromptOrder; view?: "reports" } => {
		const order = coercePromptOrder(search.order);
		return {
			...(order === DEFAULT_PROMPT_ORDER ? {} : { order }),
			...(search.view === "reports" ? { view: "reports" as const } : {}),
		};
	},
	head: pageHead({ description: "Track how LLMs respond to prompts about your brand." }),
	component: VisibilityPage,
});

function VisibilityPage() {
	const t = useT();
	const params = useBrandParams();
	const { view } = Route.useSearch();

	const infoContent = (
		<>
			{t("Track how different LLMs respond to questions related to your brand, products, and")}{" "}
			<Link to="/app/org/$org/brand/$brand/settings/competitors" params={params} className="underline">
				{t("competitors")}
			</Link>
			.
		</>
	);

	return (
		<div className="min-w-0 flex-1">
			<nav aria-label={t("AI visibility views")} className="flex gap-4 border-b p-4">
				<Link
					to="."
					search={{ view: undefined }}
					className={
						!view ? "text-sm font-semibold border-b-2 border-primary pb-2" : "text-sm text-muted-foreground pb-2"
					}
					activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
					activeProps={{ "aria-current": !view ? "page" : undefined }}
				>
					{t("Question monitoring")}
				</Link>
				<Link
					to="."
					search={{ view: "reports" }}
					className={
						view ? "text-sm font-semibold border-b-2 border-primary pb-2" : "text-sm text-muted-foreground pb-2"
					}
					activeProps={{ "aria-current": view ? "page" : undefined }}
				>
					{t("AI platform reports")}
				</Link>
			</nav>
			{view === "reports" ? (
				<AiPlatformReports />
			) : (
				<>
					<MonitoringStart />
					<PromptsDisplay
						pageTitle="Visibility"
						pageDescription="See how LLMs are evaluating questions related to your brand."
						pageInfoContent={infoContent}
					/>
				</>
			)}
		</div>
	);
}
