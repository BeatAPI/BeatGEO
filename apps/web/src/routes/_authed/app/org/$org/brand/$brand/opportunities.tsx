import { IconClock } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { useState } from "react";
import { EvidenceSummary } from "@/components/evidence-summary";
import { MonitoringLoop } from "@/components/monitoring-loop";
import { OpportunitiesReport } from "@/components/opportunities-report";
import { PageHeader } from "@/components/page-header";
import { SearchAnalysisPanel } from "@/components/search-analysis-panel";
import { SiteAudit } from "@/components/site-audit";
import { useBrandId } from "@/hooks/use-brand-id";
import { useOpportunities } from "@/hooks/use-opportunities";
import { usePublicHash } from "@/hooks/use-public-hash";
import { useLocale, useT } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/opportunities")({
	staticData: { crumb: "Opportunities" },
	head: pageHead({ description: "AI-generated opportunities to earn more AI citations." }),
	component: OpportunitiesPage,
});

function actionTabDestination(next: string, current: string) {
	if (next !== "actions") return next;
	if (["search", "seo-actions"].includes(current)) return "seo-actions";
	return current === "all-actions" ? "all-actions" : "actions";
}

function OpportunitiesPage() {
	const t = useT();
	const brandId = useBrandId();
	const hash = usePublicHash();
	const navigate = Route.useNavigate();
	const [focusActionId, setFocusActionId] = useState<string>();
	const tab = ["seo-actions", "all-actions"].includes(hash)
		? "actions"
		: ["search", "actions", "evidence", "website"].includes(hash)
			? hash
			: "recommendations";
	const actionKind =
		({ "seo-actions": "seo", "all-actions": "all" } as const)[hash as "seo-actions" | "all-actions"] ?? "geo";
	const setTab = (next: string) => {
		void navigate({ hash: actionTabDestination(next, hash) });
	};
	const reportQuery = useOpportunities(brandId);
	const { data, isLoading, generate, isGenerating, generationError } = reportQuery;
	const { canManageConnections } = Route.useRouteContext();

	const infoContent =
		"Saved recommendations are read without model calls. Generate a new report only when you choose to spend API credits.";

	return (
		<PageHeader
			title={t(
				tab === "search" || hash === "seo-actions"
					? "SEO improvements"
					: hash === "all-actions"
						? "All improvement actions"
						: "GEO opportunities",
			)}
			subtitle={t("Find search and AI visibility opportunities, review evidence, and track implemented improvements.")}
			infoContent={t(
				tab === "search" || hash === "seo-actions"
					? "Search diagnosis uses saved search evidence. Refresh sources explicitly, review candidates, then track implemented changes."
					: infoContent,
			)}
		>
			<Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="beat-section-tabs gap-6">
				<TabsList
					className="h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0"
					aria-label={t("SEO and GEO improvement workflow")}
				>
					<TabsTrigger value="recommendations">{t("GEO recommendations")}</TabsTrigger>
					<TabsTrigger value="search">{t("Search diagnosis")}</TabsTrigger>
					<TabsTrigger value="actions">{t("Actions & retests")}</TabsTrigger>
					<TabsTrigger value="evidence">{t("Observed answers")}</TabsTrigger>
					<TabsTrigger value="website">{t("Website check")}</TabsTrigger>
				</TabsList>
				<TabsContent value="recommendations" keepMounted className="space-y-5">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<p className="text-xs text-muted-foreground">
							{t("AI recommendations use your research provider and may use API credits.")}
						</p>
						<Button variant="outline" size="sm" disabled={isGenerating || isLoading} onClick={() => void generate()}>
							{t(isGenerating ? "Analyzing…" : "Generate recommendations · uses API credits")}
						</Button>
					</div>
					{generationError && (
						<p role="alert">
							{t("Could not generate recommendations. Check your research connection and retry explicitly.")}
						</p>
					)}
					{data?.report && data.lastEvaluatedAt && <LastEvaluatedAt date={data.lastEvaluatedAt} />}
					<RecommendationsContent
						query={reportQuery}
						canManageConnections={Boolean(canManageConnections)}
						setTab={setTab}
					/>
				</TabsContent>
				<TabsContent value="search">
					<SearchAnalysisPanel
						brandId={brandId}
						onActionCreated={(id) => {
							setFocusActionId(id);
							setTab("seo-actions");
						}}
					/>
				</TabsContent>
				<TabsContent value="actions" keepMounted>
					<MonitoringLoop
						brandId={brandId}
						initialKind={actionKind}
						onKindChange={(kind) => {
							void navigate({ hash: { seo: "seo-actions", all: "all-actions", geo: "actions" }[kind] });
						}}
						onOpenSearch={() => setTab("search")}
						focusActionId={focusActionId}
					/>
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

function RecommendationsContent({
	query,
	canManageConnections,
	setTab,
}: {
	query: ReturnType<typeof useOpportunities>;
	canManageConnections: boolean;
	setTab: (value: string) => void;
}) {
	const t = useT();
	const { data, isLoading, error, refetch } = query;
	let content: React.ReactNode;
	if (isLoading) {
		content = <LoadingState />;
	} else if (error) {
		content = (
			<EmptyCard>
				<p>{t("Could not load saved recommendations.")}</p>
				<Button variant="outline" onClick={() => void refetch()}>
					{t("Retry")}
				</Button>
				<p className="mt-3">{t("Your saved actions and collected answers are still available in the other tabs.")}</p>
			</EmptyCard>
		);
	} else if (data?.reason === "not-generated") {
		content = (
			<EmptyCard>
				<h2 className="text-lg font-semibold text-foreground">{t("No saved recommendations yet")}</h2>
				<p className="mt-2">{t("Search diagnosis and saved actions are available without generating an AI report.")}</p>
				<Button className="mt-4" variant="outline" onClick={() => setTab("search")}>
					{t("Open search diagnosis")}
				</Button>
			</EmptyCard>
		);
	} else if (!data || !data.report) {
		content = (
			<EmptyCard>
				<h2 className="text-lg font-semibold text-foreground">{t("Start with real answers")}</h2>
				<p className="mt-2">{t("Collect your questions to find citation gaps and decide what to improve.")}</p>
				<div className="mt-5 flex flex-wrap justify-center gap-3">
					<Button onClick={() => setTab("actions")}>{t("Collect a question")}</Button>
					{canManageConnections && (
						<Link to="/setup" className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
							{t("Check connections")}
						</Link>
					)}
				</div>
			</EmptyCard>
		);
	} else {
		content = (
			<>
				{data.reason === "insufficient-data" && (
					<p role="status">
						{t("Not enough recent answers to generate a new report. Your saved report is shown below.")}
					</p>
				)}
				<OpportunitiesReport report={data.report} onSaved={() => setTab("actions")} />
			</>
		);
	}

	return content;
}

function LastEvaluatedAt({ date }: { date: string }) {
	const t = useT();
	const { locale } = useLocale();
	return (
		<p className="flex items-center gap-1.5 text-sm text-muted-foreground">
			<IconClock className="size-4" aria-hidden />
			{t("Last evaluated")}{" "}
			<time dateTime={date}>
				{new Date(date).toLocaleDateString(locale, { month: "long", day: "numeric", year: "numeric" })}
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
				{t("Loading saved recommendations…")}
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
