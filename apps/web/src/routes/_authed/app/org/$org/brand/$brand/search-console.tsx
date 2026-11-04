import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { TrafficSources } from "@/components/traffic-sources";
import { useT } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";
export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/search-console")({
	staticData: { crumb: "Search performance" },
	head: pageHead({
		title: "Search performance",
		description: "Google Search Console queries, clicks, impressions and rankings.",
	}),
	component: SearchConsolePage,
});
function SearchConsolePage() {
	const t = useT();
	return (
		<PageHeader
			title={t("Search performance")}
			subtitle={t(
				"Your site's Google search queries, clicks, impressions and rankings. These are search results, not AI answer visibility.",
			)}
		>
			<TrafficSources view="gsc" />
		</PageHeader>
	);
}
