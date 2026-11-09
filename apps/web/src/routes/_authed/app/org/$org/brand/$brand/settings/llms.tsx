import { MonitoringStart } from "@/components/monitoring-start";
import { useT } from "@/lib/i18n";
/**
 * Which platforms a brand is tracked against, grouped by what each group tells
 * you: a scraped engine shows what a visitor sees, an ungrounded API call shows
 * what a model already believes, and a grounded one shows what it finds and
 * cites. These are distinct observations and should not be presented as
 * interchangeable measures of consumer website visibility.
 *
 * Picks are buffered and saved together from the bar at the bottom, matching the
 * prompts editor. The server functions hold the real limits; this page only
 * renders them.
 */

import { IconArrowUpRight, IconExternalLink } from "@tabler/icons-react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { PROVIDERS_DOCS_URL } from "@workspace/config/constants";
import { getModelMeta } from "@workspace/config/models";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import { type ReactNode, useState } from "react";
import { formatUsd, PlatformList, PlatformPicker, projectSelectionCostUsd } from "@/components/platform-picker";
import { UnsavedChangesBar } from "@/components/unsaved-changes-bar";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrandParams, useOrganizationParams } from "@/hooks/use-route-params";
import { groupPlatformOptions, type PlatformGroup, platformGroupCopy } from "@/lib/platform-groups";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { getModelPickerStateFn, type ModelPickerState, updateEnabledModelsFn } from "@/server/platform-picks";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/llms")({
	staticData: { crumb: "Monitoring platforms" },
	loader: async ({ context }): Promise<{ picker: ModelPickerState }> => ({
		picker: await getModelPickerStateFn({ data: { brandId: context.brandId } }),
	}),
	head: pageHead({ description: "Choose which AI models this brand is tracked against." }),
	component: LlmsSettingsPage,
});

function LlmsSettingsPage() {
	const t = useT();
	const { picker } = Route.useLoaderData();

	return (
		<div className="max-w-6xl space-y-8">
			<MonitoringStart />
			<div>
				<h1 className="text-3xl font-bold">{t("Monitoring platforms")}</h1>
				<p className="text-muted-foreground">
					{t(
						"Your questions are evaluated against these AI models to track how your brand appears across different types of AI search.",
					)}
				</p>
			</div>

			{picker.editable ? <PlatformGroups picker={picker} /> : <TrackedPlatforms picker={picker} />}

			{picker.unconfiguredPlatforms.length > 0 && <AddPlatformsCard platforms={picker.unconfiguredPlatforms} />}
		</div>
	);
}

function NoPlatformsCard() {
	const t = useT();
	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Tracked platforms")}</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">{t("This brand is not tracked on any platform yet.")}</p>
			</CardContent>
		</Card>
	);
}

/** The tiers with no checkboxes, for when there is nothing to decide. */
function TrackedPlatforms({ picker }: { picker: ModelPickerState }) {
	const tracked = new Set(picker.enabledModels);
	const groups = groupPlatformOptions(picker.available.filter((option) => tracked.has(option.model)));

	return (
		<div className="space-y-4">
			{groups.length === 0 ? (
				<NoPlatformsCard />
			) : (
				<PlatformTierCard groups={groups} renderGroup={(group) => <PlatformList options={group.options} />} />
			)}
		</div>
	);
}

function PlatformTierCard({
	groups,
	renderGroup,
}: {
	groups: PlatformGroup[];
	renderGroup: (group: PlatformGroup) => ReactNode;
}) {
	const t = useT();
	return (
		<Card className="gap-0 py-0">
			{groups.map((group, index) => (
				<div key={group.id} className={cn("flex flex-col gap-6 py-6", index > 0 && "border-t")}>
					<CardHeader>
						<CardTitle>{t(group.title)}</CardTitle>
						<CardDescription>{t(group.description)}</CardDescription>
					</CardHeader>
					<CardContent>{renderGroup(group)}</CardContent>
				</div>
			))}
		</Card>
	);
}

function PlatformGroups({ picker }: { picker: ModelPickerState }) {
	const t = useT();
	const brandId = useBrandId();
	const router = useRouter();
	const writeError = useWriteErrorMessage();

	const stored = new Set(picker.enabledModels);
	const [selected, setSelected] = useState<Set<string>>(stored);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const groups = groupPlatformOptions(picker.available);
	const costBasis = picker.costBasis;
	const spend = {
		saved: projectSelectionCostUsd(picker.available, stored, costBasis),
		next: projectSelectionCostUsd(picker.available, selected, costBasis),
	};
	const isDirty = selected.size !== stored.size || [...selected].some((m) => !stored.has(m));

	const save = async () => {
		setSaving(true);
		setError(null);
		try {
			await updateEnabledModelsFn({ data: { brandId, models: [...selected] } });
			await router.invalidate();
		} catch (err) {
			setError(writeError(err, "Could not save platform picks"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-4">
			{/* The figure that decides a pick is what the whole selection costs, not one row of it. */}
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
				<p className="text-sm text-muted-foreground">
					{t(
						"Estimated provider spend for this brand: {prompts} tracked questions, sampled {runs}× a day across the platforms below.",
						{ prompts: costBasis.enabledPrompts, runs: costBasis.runsPerDay },
					)}
				</p>
				<Badge variant="secondary" className="font-mono tabular-nums">
					≈{formatUsd(spend.saved)}
					{t("/month")}
				</Badge>
			</div>

			<PlatformTierCard
				groups={groups}
				renderGroup={(group) => (
					<PlatformPicker
						options={group.options}
						selected={selected}
						onSelectedChange={setSelected}
						disabled={saving}
					/>
				)}
			/>

			{selected.size === 0 && (
				<Alert variant="destructive">
					<AlertDescription>{t("Pick at least one platform — a brand with none is not tracked.")}</AlertDescription>
				</Alert>
			)}

			<UnsavedChangesBar
				isDirty={isDirty && selected.size > 0}
				isSaving={saving}
				summary={summarizeSelection(selected.size, spend, t)}
				error={error}
				onSave={save}
				onDiscard={() => {
					setSelected(stored);
					setError(null);
				}}
			/>
		</div>
	);
}

/** What the bar says: how many platforms, and where saving leaves the bill. */
function summarizeSelection(count: number, spend: { saved: number; next: number }, t: ReturnType<typeof useT>): string {
	const platforms = t("{count} platforms selected", { count });
	const direction = spend.next > spend.saved ? "up from" : spend.next < spend.saved ? "down from" : "unchanged from";
	return `${platforms} · ≈${formatUsd(spend.next)}${t("/month")}, ${t(direction)} ${formatUsd(spend.saved)}`;
}

/**
 * Self-hosted only: what else BeatGEO can track, and which provider account each
 * one needs. The provider status workflow exercises every suggested combination.
 *
 * Scrapers and direct APIs are separate columns because they are not
 * interchangeable — Perplexity through BrightData returns the surface a visitor
 * sees, while Perplexity through OpenRouter returns the model's own answer. A
 * single list of provider names hid that choice.
 */
const PROVIDER_COLUMNS = [
	{ access: "scraped", header: "Scrapers" },
	{ access: "api", header: "Direct APIs" },
] as const;

const PROVIDER_GRID = "grid grid-cols-[minmax(7rem,1fr)_1.5fr_1fr] gap-x-4";

function AddPlatformsCard({ platforms }: { platforms: ModelPickerState["unconfiguredPlatforms"] }) {
	const t = useT();
	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Track more platforms")}</CardTitle>
				<CardDescription>
					{t("Add these to ")}
					<code className="font-mono text-xs">SCRAPE_TARGETS</code>
					{t(
						" to start tracking them. One account is enough, but which kind you pick changes the data: a scraper reads the product a visitor uses, an API asks the model directly.",
					)}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className={`${PROVIDER_GRID} gap-y-2 border-b pb-2 text-xs font-medium text-muted-foreground`}>
					<span>{t("Platform")}</span>
					{PROVIDER_COLUMNS.map((column) => (
						<span key={column.access}>{t(column.header)}</span>
					))}
				</div>
				<div className="divide-y">
					{platforms.map((platform) => (
						<div key={platform.model} className={`${PROVIDER_GRID} items-start gap-y-1 py-2`}>
							<span className="flex items-center gap-2 text-sm font-medium">
								<ModelIcon iconId={getModelMeta(platform.model).iconId} className="size-4 shrink-0" />
								<span className="truncate">{getModelMeta(platform.model).label}</span>
							</span>
							{PROVIDER_COLUMNS.map((column) => (
								<ProviderLinks
									key={column.access}
									providers={platform.providers.filter((provider) => provider.access === column.access)}
								/>
							))}
						</div>
					))}
				</div>
				<a
					href={PROVIDERS_DOCS_URL}
					target="_blank"
					rel="noopener noreferrer"
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					{t("Provider setup guide")}
					<IconExternalLink className="h-4 w-4" />
				</a>
			</CardContent>
		</Card>
	);
}

/** A cell's providers, or a dash when a platform can't be reached that way. */
function ProviderLinks({ providers }: { providers: ModelPickerState["unconfiguredPlatforms"][number]["providers"] }) {
	const t = useT();
	if (providers.length === 0) return <span className="text-sm text-muted-foreground">—</span>;

	return (
		<span className="flex flex-wrap gap-x-2 gap-y-1">
			{providers.map((provider) => (
				<a
					key={provider.id}
					href={provider.docsUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="text-sm text-muted-foreground underline decoration-dotted hover:text-foreground"
				>
					{t(provider.name)}
				</a>
			))}
		</span>
	);
}
