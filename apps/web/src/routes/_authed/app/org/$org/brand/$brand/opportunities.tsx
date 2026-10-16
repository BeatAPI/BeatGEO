import { EvidenceSummary } from "@/components/evidence-summary";
import { MonitoringLoop } from "@/components/monitoring-loop";
import { SiteAudit } from "@/components/site-audit";
import { useT } from "@/lib/i18n";
/**
 * The page renders a structured opportunities report. We assemble a deterministic
 * digest of the brand's tracked citation data (per-query standing vs the leading
 * competitor over 7d + 30d, citation difficulty, where answers are sourced, and
 * per-platform visibility) and make a single structured LLM completion (no web
 * search) to turn it into categorized opportunities. The report is cached
 * server-side and regenerated only when stale — see server/opportunities.ts.
 */

import { IconClock } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { useState } from "react";
import { OpportunitiesReport } from "@/components/opportunities-report";
import { PageHeader } from "@/components/page-header";
import { useBrandId } from "@/hooks/use-brand-id";
import { useOpportunities } from "@/hooks/use-opportunities";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/opportunities")({
	staticData: { crumb: "Opportunities" },
	head: pageHead({ description: "AI-generated opportunities to earn more AI citations." }),
	component: OpportunitiesPage,
});

function OpportunitiesPage() {
	const t = useT();
	const brandId = useBrandId();
	const [tab, setTab] = useState<string>("recommendations");
	const { data, isLoading, error, refetch, isFetching } = useOpportunities(brandId);
	const { clientConfig, canManageConnections } = Route.useRouteContext();

	const infoContent = "Recommendations based on your visibility and citation metrics. Refreshed weekly.";

	let content: React.ReactNode;
	if (isLoading) {
		content = <LoadingState />;
	} else if (error) {
		content = (
			<EmptyCard>
				<p>{t("Couldn't generate recommendations right now. Use Refresh recommendations to try again.")}</p>
				<p className="mt-3">{t("Your saved actions and collected answers are still available in the other tabs.")}</p>
			</EmptyCard>
		);
	} else if (!data || data.reason === "insufficient-data" || !data.report) {
		content = (
			<EmptyCard>
				<h2 className="text-lg font-semibold text-foreground">{t("Start with real answers")}</h2>
				<p className="mt-2">{t("Collect your questions to find citation gaps and decide what to improve.")}</p>
				<div className="mt-5 flex flex-wrap justify-center gap-3">
					<Button onClick={() => setTab("actions")}>{t("Collect a question")}</Button>
					{clientConfig?.mode === "local" && canManageConnections && (
						<Link to="/setup" className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
							{t("Check connections")}
						</Link>
					)}
				</div>
			</EmptyCard>
		);
	} else {
		content = <OpportunitiesReport report={data.report} onSaved={() => setTab("actions")} />;
	}

	return (
		<PageHeader
			title={t("Opportunities")}
			subtitle={t(
				"What to create, pitch, and seed to earn more AI citations — generated from your tracked answer data.",
			)}
			infoContent={t(infoContent)}
		>
			<Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="beat-section-tabs gap-6">
				<TabsList
					className="h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0"
					aria-label={t("AEO workflow")}
				>
					<TabsTrigger value="recommendations">{t("Recommendations")}</TabsTrigger>
					<TabsTrigger value="actions">{t("Actions & retests")}</TabsTrigger>
					<TabsTrigger value="evidence">{t("Observed answers")}</TabsTrigger>
					<TabsTrigger value="website">{t("Website check")}</TabsTrigger>
				</TabsList>
				<TabsContent value="recommendations" keepMounted className="space-y-5">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-xs text-muted-foreground">
							{t("AI recommendations use your research provider and may use API credits.")}
						</p>
						<Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
							{t(isFetching ? "Analyzing…" : "Refresh recommendations")}
						</Button>
					</div>
					{data?.report && data.lastEvaluatedAt && <LastEvaluatedAt date={data.lastEvaluatedAt} />}
					{content}
				</TabsContent>
				<TabsContent value="actions" keepMounted>
					<MonitoringLoop brandId={brandId} />
				</TabsContent>
				<TabsContent value="evidence" keepMounted>
					<EvidenceSummary brandId={brandId} />
				</TabsContent>
				<TabsContent value="website" keepMounted>
					<SiteAudit brandId={brandId} />
				</TabsContent>
			</Tabs>
		</PageHeader>
	);
}

function LastEvaluatedAt({ date }: { date: string }) {
	const t = useT();
	return (
		<p className="flex items-center gap-1.5 text-sm text-muted-foreground">
			<IconClock className="size-4" aria-hidden />
			{t("Last evaluated")}{" "}
			<time dateTime={date}>
				{new Date(date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
			</time>
		</p>
	);
}

function EmptyCard({ children }: { children: React.ReactNode }) {
	return (
		<div className="mx-auto max-w-lg px-4 py-20 text-center text-sm leading-relaxed text-muted-foreground">
			{children}
		</div>
	);
}

function LoadingState() {
	const t = useT();
	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Spinner />
				{t("Analyzing your citation landscape and drafting your opportunities…")}
			</div>
			<div className="space-y-2">
				<Skeleton className="h-6 w-2/3" />
				<Skeleton className="h-4 w-full max-w-[70ch]" />
				<Skeleton className="h-4 w-1/2" />
			</div>
			<div className="space-y-3">
				{[0, 1, 2].map((i) => (
					<Skeleton key={i} className="h-28 w-full rounded-xl" />
				))}
			</div>
		</div>
	);
}
