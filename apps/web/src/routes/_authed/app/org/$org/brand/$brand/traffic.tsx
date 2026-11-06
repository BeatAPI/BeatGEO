import { createFileRoute } from "@tanstack/react-router";
import { TrafficSources } from "@/components/traffic-sources";
import { pageHead } from "@/lib/route-head";
export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/traffic")({
	staticData: { crumb: "Traffic analysis" },
	validateSearch: (s: Record<string, unknown>): { google?: string; ga?: string; gsc?: string } => ({
		google: ["connected", "partial", "error", "denied"].includes(String(s.google)) ? String(s.google) : undefined,
		ga: ["connected", "error", "denied"].includes(String(s.ga)) ? String(s.ga) : undefined,
		gsc: ["connected", "error", "denied"].includes(String(s.gsc)) ? String(s.gsc) : undefined,
	}),
	head: pageHead({
		title: "Traffic analysis",
		description: "Acquisition, organic search, AI referral visits and crawler observations.",
	}),
	component: TrafficPage,
});
function TrafficPage() {
	const { ga, gsc, google } = Route.useSearch();
	return <TrafficSources result={ga} gscResult={gsc} googleResult={google} />;
}
