import { IconActivity, IconArrowRight, IconClock, IconInfoCircle, IconList, IconRefresh } from "@tabler/icons-react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { labelForModelFilter } from "@workspace/config/model-filter";
import type { ClientConfig } from "@workspace/config/types";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { type ReactNode, useEffect } from "react";
import { FirstCollectionStatus } from "@/components/first-collection-status";
import { PageHeader } from "@/components/page-header";
import PromptWizard from "@/components/prompt-wizard";
import { SiteIcon } from "@/components/site-icon";
import { TrendChart, type TrendPoint } from "@/components/trend-chart";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import { useShareOfVoice } from "@/hooks/use-share-of-voice";
import { EARLY_SIGNAL_RUNS, isEarlySignal } from "@/lib/chart-utils";
import { useT } from "@/lib/i18n";
import { describeTargetSchedule, type TrackedTarget } from "@/lib/model-filter";
import { setPersonProperties } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";

function getVisibilityTextColor(value: number): string {
	if (value > 75) return "text-emerald-700 dark:text-emerald-400";
	if (value > 45) return "text-amber-700 dark:text-amber-400";
	return "text-rose-700 dark:text-rose-400";
}

/** Most recent non-null value in a daily series — matches the right end of the trend line. */
function lastValue<T>(series: T[], key: keyof T): number | null {
	for (let i = series.length - 1; i >= 0; i--) {
		const v = series[i]?.[key];
		if (typeof v === "number") return v;
	}
	return null;
}

function formatRelativeTime(dateString: string | null): string {
	if (!dateString) return "Never";

	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRunFrequency(hours: number): string {
	const weeks = Math.floor(hours / (7 * 24));
	const days = Math.floor((hours % (7 * 24)) / 24);
	const remainingHours = hours % 24;

	const parts: string[] = [];
	if (weeks > 0) parts.push(`${weeks}w`);
	if (days > 0) parts.push(`${days}d`);
	if (remainingHours > 0) parts.push(`${remainingHours}h`);

	return parts.length > 0 ? `~${parts.join(" ")}` : "~1h";
}

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/")({
	staticData: { crumb: "Overview" },
	head: pageHead({ description: "Dashboard overview of AI visibility and citations." }),
	component: DashboardPage,
});

function StatWithTooltip({
	icon: Icon,
	label,
	value,
	tooltip,
}: {
	icon: typeof IconList;
	label: string;
	value: string | number;
	tooltip: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger render={<div className="flex items-center gap-2 cursor-help" />}>
				<Icon className="h-4 w-4 flex-shrink-0" />
				<span>
					<span className="font-semibold text-foreground">{value}</span> {label}
				</span>
				<IconInfoCircle className="h-3.5 w-3.5 opacity-50" />
			</TooltipTrigger>
			<TooltipContent className="max-w-xs text-sm">{tooltip}</TooltipContent>
		</Tooltip>
	);
}

function CardTitleWithTooltip({
	title,
	tooltip,
	className = "",
}: {
	title: string;
	/** Absent while the figures it would quote are still loading. */
	tooltip?: string;
	className?: string;
}) {
	return (
		<CardTitle className={`text-sm font-medium flex items-center gap-1.5 ${className}`}>
			{title}
			{tooltip ? (
				<Tooltip>
					<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
					<TooltipContent className="max-w-xs text-sm font-normal">{tooltip}</TooltipContent>
				</Tooltip>
			) : (
				<IconInfoCircle className="h-3.5 w-3.5 opacity-70" />
			)}
		</CardTitle>
	);
}

/**
 * One dashboard band: the headline number beside the 30-day line it is the
 * latest point of. Renders its own skeletons, so the loading dashboard is the
 * same tree as the loaded one rather than a second copy of this markup.
 */
function TrendSection({
	title,
	description,
	linkTo,
	linkLabel,
	chartTitle,
	chartLabel,
	tooltip,
	value,
	series,
	loading,
	earlySignal,
	aside,
}: {
	title: string;
	description: string;
	linkTo: "/app/org/$org/brand/$brand/visibility" | "/app/org/$org/brand/$brand/share-of-voice";
	linkLabel: string;
	chartTitle: string;
	chartLabel: string;
	tooltip?: string;
	value: number | null;
	series: TrendPoint[];
	loading: boolean;
	/** Caption that replaces the colour verdict while the sample is small. */
	earlySignal?: string;
	/** The panel beside the chart: a ranking or the tracking figures. */
	aside: ReactNode;
}) {
	const params = useBrandParams();
	const tone = value === null || earlySignal ? "text-foreground" : getVisibilityTextColor(value);
	return (
		<section className="space-y-3">
			<div className="flex items-end justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-base font-medium">{title}</h2>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				<Link
					to={linkTo}
					params={params}
					className={buttonVariants({ variant: "ghost", size: "sm", className: "h-8 shrink-0" })}
				>
					{linkLabel} <IconArrowRight className="h-4 w-4 ml-1" />
				</Link>
			</div>

			<Card className="gap-0 overflow-hidden py-0 shadow-none">
				<div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
					<div className="flex min-w-0 flex-col gap-3 p-5">
						<CardTitleWithTooltip title={chartTitle} tooltip={tooltip} />
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							{loading ? (
								<Skeleton className="h-8 w-20" />
							) : (
								<span className={`text-3xl font-medium tracking-tight tabular-nums ${tone}`}>
									{value === null ? "—" : `${value}%`}
								</span>
							)}
							{!loading && earlySignal && <span className="text-xs text-muted-foreground">{earlySignal}</span>}
						</div>
						<div className="h-[190px]">
							{loading ? (
								<Skeleton className="h-full w-full" />
							) : (
								<TrendChart data={series} label={chartLabel} color="#7d95ff" />
							)}
						</div>
					</div>
					<div className="border-t p-5 lg:border-t-0 lg:border-l">{aside}</div>
				</div>
			</Card>
		</section>
	);
}

type ShareEntry = { name: string; isBrand: boolean; share: number };

/** Brand and competitors by share of the mentions, the brand marked as yours. */
function ShareRanking({
	entries,
	loading,
	domains,
}: {
	entries: ShareEntry[];
	loading: boolean;
	/** Website per brand or competitor name, for its icon. */
	domains: Record<string, string | undefined>;
}) {
	const t = useT();
	const ranked = [...entries].sort((a, b) => b.share - a.share).slice(0, 6);
	return (
		<div className="space-y-3">
			<p className="text-sm font-medium">{t("Share of voice rank")}</p>
			{loading ? (
				<Skeleton className="h-40 w-full" />
			) : ranked.length === 0 ? (
				<p className="text-sm text-muted-foreground">{t("No brand or competitor mentions yet.")}</p>
			) : (
				<ol className="divide-y">
					{ranked.map((entry, index) => (
						<li key={entry.name} className="flex items-center gap-3 py-2.5 text-sm">
							<span className="w-4 text-muted-foreground tabular-nums">{index + 1}</span>
							<SiteIcon domain={domains[entry.name]} size="md" />
							<span className="min-w-0 truncate">{entry.name}</span>
							{entry.isBrand && (
								<span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
									{t("Yours")}
								</span>
							)}
							<span className="ml-auto tabular-nums">{Math.round(entry.share * 100)}%</span>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

const STAT_PLACEHOLDERS = [
	{ label: "prompts tracked", icon: IconList },
	{ label: "evaluations", icon: IconActivity },
	{ label: "run frequency", icon: IconClock },
	{ label: "last updated", icon: IconRefresh },
];

function TrackingStats({
	loading,
	totalPrompts,
	totalRuns,
	lastUpdatedAt,
	delayHours,
	trackedTargets,
}: {
	loading: boolean;
	totalPrompts: number;
	totalRuns: number;
	lastUpdatedAt: string | null;
	delayHours: number;
	trackedTargets: TrackedTarget[];
}) {
	const t = useT();
	if (loading) {
		return (
			<div className="flex flex-col gap-4 text-sm text-muted-foreground">
				{STAT_PLACEHOLDERS.map(({ label, icon: Icon }) => (
					<div key={label} className="flex items-center gap-2">
						<Icon className="h-4 w-4 flex-shrink-0" />
						<Skeleton className="h-4 w-28" />
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 text-sm text-muted-foreground">
			<p className="text-sm font-medium text-foreground">{t("Tracking")}</p>
			<StatWithTooltip
				icon={IconList}
				label={t("prompts tracked")}
				value={totalPrompts.toLocaleString()}
				tooltip={
					trackedTargets.length > 0 ? (
						<>
							<p>{t("Prompts monitored for AI visibility, each evaluated on:")}</p>
							<ul className="mt-1 space-y-0.5">
								{trackedTargets.map((target) => (
									<li key={target.value}>{labelForModelFilter(target.value)}</li>
								))}
							</ul>
						</>
					) : (
						"Prompts monitored for AI visibility. No platforms are configured for this brand yet."
					)
				}
			/>
			<StatWithTooltip
				icon={IconActivity}
				label={t("evaluations (30d)")}
				value={totalRuns.toLocaleString()}
				tooltip="Total number of times we have evaluated prompts against LLMs in the last 30 days. Each prompt is evaluated multiple times across different AI models."
			/>
			<StatWithTooltip
				icon={IconClock}
				label={t("run frequency")}
				value={formatRunFrequency(delayHours)}
				tooltip={
					trackedTargets.length > 0 ? (
						<>
							{/* One rate for the brand is a summary, not the truth: a
							    grounded call samples far less often than a scraped one,
							    and self-hosted repeats every sample. */}
							<p>{t("How often each platform is sampled:")}</p>
							<ul className="mt-1 space-y-0.5">
								{trackedTargets.map((target) => (
									<li key={target.value}>{describeTargetSchedule(target)}</li>
								))}
							</ul>
						</>
					) : (
						"No platforms are configured for this brand yet."
					)
				}
			/>
			<StatWithTooltip
				icon={IconRefresh}
				label={t("last updated")}
				value={formatRelativeTime(lastUpdatedAt)}
				tooltip={
					lastUpdatedAt
						? `The last prompts we evaluated for your brand were run on ${new Date(lastUpdatedAt).toLocaleString()}`
						: "No evaluations have been run yet."
				}
			/>
		</div>
	);
}

/**
 * Shown until the first evaluation lands. What to do next depends on whether
 * any prompt is configured, and whether any of them are enabled.
 */
function AwaitingFirstEvaluation({ totalPrompts, hasPrompts }: { totalPrompts: number; hasPrompts: boolean }) {
	const t = useT();
	const params = useBrandParams();
	const hasEnabledPrompts = totalPrompts > 0;
	const message = hasEnabledPrompts
		? "Your questions are saved. Collection status appears below; the local worker and browser must stay connected."
		: hasPrompts
			? "You have prompts configured but none are currently enabled. Add or enable some prompts to start tracking your AI visibility."
			: "Set up prompts to start tracking your AI visibility. Once configured, we'll evaluate them against AI models automatically.";

	return (
		<div className="flex flex-1 flex-col items-center justify-center p-8 max-w-xl mx-auto text-center">
			<div className="rounded-full bg-muted p-4 mb-6">
				<IconClock className="h-10 w-10 text-muted-foreground" />
			</div>
			<h2 className="text-2xl font-bold mb-3">{hasEnabledPrompts ? t("First collection") : t("No Data Yet")}</h2>
			<p className="text-muted-foreground mb-6 text-balance">{t(message)}</p>
			<div className="flex flex-col gap-3 w-full">
				{hasEnabledPrompts && (
					<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
						<div className="flex items-center gap-2">
							<IconList className="h-5 w-5 text-muted-foreground" />
							<span className="text-sm">{t("Prompts configured and enabled")}</span>
						</div>
						<span className="font-semibold">{totalPrompts.toLocaleString()}</span>
					</div>
				)}
				<Link
					to="/app/org/$org/brand/$brand/settings/prompts"
					params={params}
					className={buttonVariants({ variant: "outline", className: "w-full" })}
				>
					{hasEnabledPrompts ? t("View Your Prompts") : hasPrompts ? t("Edit Prompts") : t("Set Up Prompts")}{" "}
					<IconArrowRight className="h-4 w-4 ml-1" />
				</Link>
			</div>
			{hasEnabledPrompts && <FirstCollectionStatus />}
		</div>
	);
}

function ResearchBrandData({ brandId, clientConfig }: { brandId: string; clientConfig?: ClientConfig }) {
	const t = useT();
	return (
		<div className="space-y-6 max-w-2xl p-4">
			<div className="space-y-2">
				<h2 className="text-2xl font-bold">{t("Set up brand monitoring")}</h2>
				<p className="text-muted-foreground text-balance">
					{t("Generate questions from your website, review the suggested set, then start monitoring.")}
				</p>
			</div>
			<PromptWizard
				onComplete={() => {
					const template = clientConfig?.branding.onboardingRedirectUrlTemplate;
					if (template) window.location.href = template.replace("{brandId}", brandId);
				}}
			/>
		</div>
	);
}

/** Everything the two trend sections plot, plus the loading flags they key off.
 *  Reads only; the analytics write lives in `useReportedPromptCount`. */
function useDashboardMetrics(brandId: string | undefined) {
	const { data: dashboardSummary, isLoading: isLoadingSummary } = useDashboardSummary(brandId, "1m");
	const { data: sovData, isLoading: isLoadingSov } = useShareOfVoice(brandId, { lookback: "1m" });

	return {
		isLoadingSummary,
		isLoadingSov,
		totalRuns: dashboardSummary?.totalRuns || 0,
		totalPrompts: dashboardSummary?.totalPrompts,
		visibilityTimeSeries: dashboardSummary?.visibilityTimeSeries || [],
		sovTimeSeries: sovData?.shareTimeSeries ?? [],
		sovEntries: sovData?.entries ?? [],
		nonBrandedVisibility: dashboardSummary?.nonBrandedVisibility || 0,
		lastUpdatedAt: dashboardSummary?.lastUpdatedAt || null,
	};
}

/** Mirrors the brand's active prompt count onto the PostHog person. */
function useReportedPromptCount(totalPrompts: number | undefined) {
	useEffect(() => {
		if (totalPrompts != null) setPersonProperties({ active_prompt_count: totalPrompts });
	}, [totalPrompts]);
}

const visibilityTooltipText = (nonBrandedVisibility: number) =>
	`The percentage of AI answers to your prompts that mention your brand — the big number is the latest point on this line. For prompts that don't name your brand, it's ${nonBrandedVisibility}%. Visibility shifts as AI models, the prompts you track, or the sites AI scans change; the line is smoothed for staggered prompt schedules.`;

const SOV_TOOLTIP =
	"Your brand's share of all brand and competitor mentions across the AI answers to your prompts — the big number is the latest point on this line. It shifts as AI models change, as you and competitors publish, or as the sites AI scans move; the line is smoothed for staggered prompt schedules.";

/** The hero caption while the sample is too small for a red/amber/green verdict. */
function useEarlySignalCaption(loading: boolean, totalRuns: number): string | undefined {
	const t = useT();
	if (loading || !isEarlySignal(totalRuns)) return undefined;
	return t("Early signal · {count} answers so far", { count: totalRuns });
}

/** Website per brand or competitor name, so the ranking can show each one's icon. */
function rankingDomainsFor(brand: BrandWithPrompts | undefined): Record<string, string | undefined> {
	if (!brand) return {};
	return Object.fromEntries([[brand.name, brand.website], ...brand.competitors.map((c) => [c.name, c.domains[0]])]);
}

function BaselineNotice({ totalRuns }: { totalRuns: number }) {
	const t = useT();
	return (
		<div className="rounded-xl border bg-card px-4 py-3 text-sm">
			<p className="font-medium">{t("Collecting a baseline")}</p>
			<p className="text-muted-foreground">
				{t(
					"{count} answers collected so far. Percentages move a lot until about {target} answers are in, so read them as a first look rather than a score.",
					{ count: totalRuns, target: EARLY_SIGNAL_RUNS },
				)}
			</p>
		</div>
	);
}

function DashboardPage() {
	const t = useT();
	const brandId = useBrandId();
	const { data: brand, isLoading: isLoadingBrand } = useBrand();
	// The footer reports what this brand actually runs, resolved server-side.
	const trackedTargets = brand?.trackedTargets ?? [];
	const {
		isLoadingSummary,
		isLoadingSov,
		totalRuns,
		totalPrompts,
		visibilityTimeSeries,
		sovTimeSeries,
		sovEntries,
		nonBrandedVisibility,
		lastUpdatedAt,
	} = useDashboardMetrics(brand?.id);
	useReportedPromptCount(totalPrompts);
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;

	const loadingVisibility = isLoadingBrand || isLoadingSummary;
	const loadingSov = isLoadingBrand || isLoadingSov;

	const earlySignal = useEarlySignalCaption(loadingVisibility, totalRuns);
	const rankingDomains = rankingDomainsFor(brand);

	if (!isLoadingBrand && !brand?.onboarded) {
		return <ResearchBrandData brandId={brandId} clientConfig={clientConfig} />;
	}

	// No runs yet: the dashboard has nothing to plot, so point at what to do next.
	if (!loadingVisibility && totalRuns === 0) {
		return <AwaitingFirstEvaluation totalPrompts={totalPrompts ?? 0} hasPrompts={(brand?.prompts?.length ?? 0) > 0} />;
	}

	return (
		<div className="flex flex-1 flex-col">
			<div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3">
				<PageHeader title={t("Overview")} subtitle={t("How AI answers mention and cite your brand.")} />
				{earlySignal && <BaselineNotice totalRuns={totalRuns} />}
				<p className="text-xs text-muted-foreground">
					{t(
						"Trend estimates may carry earlier answers across missing days. They are not fresh daily observations; see Observed answers in Opportunities for actual sample counts and timestamps.",
					)}
				</p>
				<TrendSection
					title={t("AI Visibility")}
					description={t("How often AI answers mention your brand")}
					linkTo="/app/org/$org/brand/$brand/visibility"
					linkLabel={t("View Visibility")}
					chartTitle={t("Visibility Trends (30d)")}
					chartLabel={t("AI Visibility (7d avg)")}
					// The tooltips quote live figures, so they stay off until those have loaded.
					tooltip={loadingVisibility ? undefined : visibilityTooltipText(nonBrandedVisibility)}
					// "Current" = the latest plotted point, so the hero number always
					// matches the right end of the chart beside it (rather than the
					// whole-window average).
					value={lastValue(visibilityTimeSeries, "overall")}
					series={visibilityTimeSeries.map((p) => ({ date: p.date, value: p.overall }))}
					loading={loadingVisibility}
					earlySignal={earlySignal}
					aside={
						<TrackingStats
							loading={loadingVisibility}
							totalPrompts={totalPrompts ?? 0}
							totalRuns={totalRuns}
							lastUpdatedAt={lastUpdatedAt}
							delayHours={brand?.delayOverrideHours ?? clientConfig?.defaultDelayHours ?? 24}
							trackedTargets={trackedTargets}
						/>
					}
				/>

				<TrendSection
					title={t("Share of Voice")}
					description={t("Your share of brand and competitor mentions")}
					linkTo="/app/org/$org/brand/$brand/share-of-voice"
					linkLabel={t("View Share of Voice")}
					chartTitle={t("Share of Voice Trends (30d)")}
					chartLabel={t("Share of Voice")}
					tooltip={loadingSov ? undefined : SOV_TOOLTIP}
					value={lastValue(sovTimeSeries, "share")}
					series={sovTimeSeries.map((p) => ({ date: p.date, value: p.share }))}
					loading={loadingSov}
					earlySignal={earlySignal}
					aside={<ShareRanking entries={sovEntries} loading={loadingSov} domains={rankingDomains} />}
				/>
			</div>
		</div>
	);
}
