/**
 * Single-step onboarding wizard.
 *
 * One LLM call returns brand info, competitors, and prompts for review before
 * saving.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { buildQuestionBank, type QuestionProfile } from "@workspace/lib/question-bank";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { AlertCircle, Play, Rocket } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { type CompetitorEntry, CompetitorsEditor, newCompetitorEntry } from "@/components/competitors-editor";
import { type EditablePrompt, newPromptEntry, PromptsListEditor } from "@/components/prompts-list-editor";
import { QuestionBankPicker } from "@/components/question-bank-picker";
import { brandKeys, useBrand } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { usePolledBrandJob } from "@/hooks/use-polled-brand-job";
import { promptsSummaryKeys } from "@/hooks/use-prompts-summary";
import { trackEvent } from "@/lib/posthog";
import { useWriteErrorMessage } from "@/lib/write-errors";
import {
	cancelAnalyzeBrandFn,
	getAnalyzeBrandStatusFn,
	getQuestionGenerationFn,
	startAnalyzeBrandFn,
	updateOnboardedBrandFn,
} from "@/server/onboarding";

interface PromptWizardProps {
	onComplete: () => void;
}

interface WizardData {
	brandName: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	competitors: CompetitorEntry[];
	prompts: EditablePrompt[];
}

const EditableTagsInput = memo(
	({
		items,
		onValueChange,
		placeholder = "Add item...",
		maxItems = 10,
	}: {
		items: string[];
		onValueChange: (value: string[]) => void;
		placeholder?: string;
		maxItems?: number;
	}) => (
		<div className="space-y-2">
			<TagsInput
				value={items}
				onValueChange={onValueChange}
				placeholder={placeholder}
				searchPlaceholder={placeholder}
				maxItems={maxItems}
			/>
			<p className="text-xs text-muted-foreground">
				<strong>
					{items.length}/{maxItems}
				</strong>{" "}
				{items.length >= maxItems ? "items added. Remove an item to add a new one." : "items entered."}
			</p>
		</div>
	),
);
EditableTagsInput.displayName = "EditableTagsInput";

export default function PromptWizard({ onComplete }: PromptWizardProps) {
	const { data: brand } = useBrand();
	const queryClient = useQueryClient();
	const router = useRouter();
	const writeError = useWriteErrorMessage();
	const [reviewing, setReviewing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [data, setData] = useState<WizardData>({
		brandName: "",
		website: "",
		additionalDomains: [],
		aliases: [],
		competitors: [],
		prompts: [],
	});

	const brandId = brand?.id;
	const [questionSource, setQuestionSource] = useState("");
	const generation = useQuery({
		queryKey: ["question-generation", brandId],
		queryFn: () => getQuestionGenerationFn({ data: { brandId: brandId! } }),
		enabled: !!brandId,
	});
	const useStarterBank = (profile: QuestionProfile) => {
		setData({
			brandName: brand?.name || "",
			website: brand?.website || "",
			additionalDomains: [],
			aliases: [],
			competitors: [],
			prompts: buildQuestionBank(profile, brand?.name || "").map((p) =>
				newPromptEntry({ value: p.prompt, tags: [...p.tags, "industry-template", "bank-v1"], enabled: true }),
			),
		});
		setQuestionSource("Industry starter set · review the fit before monitoring. Not measured search volume.");
		setReviewing(true);
		setError(null);
	};

	const analysis = usePolledBrandJob({
		queryKey: ["analyze-brand", brandId],
		start: () => {
			if (!brand?.id || !brand.website) throw new Error("Brand isn't loaded yet.");
			return startAnalyzeBrandFn({ data: { brandId: brand.id, website: brand.website, brandName: brand.name } });
		},
		poll: () => getAnalyzeBrandStatusFn({ data: { brandId: brandId! } }),
		cancel: () => cancelAnalyzeBrandFn({ data: { brandId: brandId! } }),
		onDone: ({ suggestion }) => {
			if (!suggestion.suggestedPrompts.length) {
				setError(
					"We could not identify enough website information. Try again, or choose an industry below to generate starter questions.",
				);
				return;
			}
			setQuestionSource(
				suggestion.questionProfile
					? `Website-based questions · ${suggestion.questionProfile.category} · ${suggestion.questionProfile.audience}. Suggested coverage, not measured search volume.`
					: "Website research suggestions · review before monitoring. Not measured search volume.",
			);
			setData({
				brandName: suggestion.brandName || brand?.name || "",
				website: brand?.website || suggestion.website || "",
				additionalDomains: suggestion.additionalDomains,
				aliases: suggestion.aliases,
				competitors: suggestion.competitors.map((c) =>
					newCompetitorEntry({
						name: c.name,
						domains: c.domains,
						aliases: c.aliases,
						expanded: false,
					}),
				),
				prompts: suggestion.suggestedPrompts.map((p) =>
					newPromptEntry({
						value: p.prompt,
						tags: suggestion.questionBankVersion ? [...p.tags, "website-research", "bank-v1"] : p.tags,
						enabled: true,
					}),
				),
			});
			setReviewing(true);
			trackEvent("onboarding_analyzed", {
				competitor_count: suggestion.competitors.length,
				prompt_count: suggestion.suggestedPrompts.length,
			});
		},
		onError: setError,
		startErrorFallback: "Analysis failed",
		timeoutMessage: "Brand analysis timed out. Please try again.",
	});

	const handleAnalyze = () => {
		if (!brand?.website || !brand?.id) return;
		setError(null);
		analysis.run();
	};

	const updateBrandName = useCallback((brandName: string) => setData((p) => ({ ...p, brandName })), []);
	const updateWebsite = useCallback((website: string) => setData((p) => ({ ...p, website })), []);
	const updateAliases = useCallback((aliases: string[]) => setData((p) => ({ ...p, aliases })), []);
	const updateAdditionalDomains = useCallback(
		(additionalDomains: string[]) => setData((p) => ({ ...p, additionalDomains })),
		[],
	);
	const updateCompetitors = useCallback(
		(competitors: CompetitorEntry[]) => setData((p) => ({ ...p, competitors })),
		[],
	);
	const updatePrompts = useCallback((prompts: EditablePrompt[]) => setData((p) => ({ ...p, prompts })), []);

	const previewCounts = useMemo(() => {
		const enabled = data.prompts.filter((p) => p.enabled && p.value.trim().length > 0).length;
		return { totalNew: enabled };
	}, [data.prompts]);

	const handleSubmit = useCallback(async () => {
		if (!brand?.id) return;
		setSubmitError(null);
		setIsSaving(true);
		try {
			const competitorsPayload = data.competitors
				.filter((c) => c.name.trim() && c.domains.some((d) => d.trim()))
				.map((c) => ({
					name: c.name.trim(),
					domains: c.domains.filter((d) => d.trim()),
					aliases: c.aliases,
				}));

			const promptsPayload = data.prompts
				.filter((p) => p.enabled && p.value.trim())
				.map((p) => ({ value: p.value.trim(), tags: p.tags, enabled: true }));

			await updateOnboardedBrandFn({
				data: {
					brandId: brand.id,
					brandName: data.brandName.trim() || brand.name,
					website: data.website.trim() || brand.website,
					additionalDomains: data.additionalDomains,
					aliases: data.aliases,
					competitors: competitorsPayload,
					prompts: promptsPayload,
				},
			});

			trackEvent("wizard_completed", {
				prompts_created: promptsPayload.length,
				competitors_created: competitorsPayload.length,
				skipped: false,
			});

			// Deployments without an onboardingRedirectUrlTemplate (e.g. local mode) skip the full reload, so caches fetched while !onboarded must be busted explicitly.
			queryClient.invalidateQueries({ queryKey: brandKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: promptsSummaryKeys.all });
			// The $brand route loader feeds `brand` into AppSidebar; invalidate it so the sidebar picks up onboarded=true.
			await router.invalidate();

			onComplete();
		} catch (err) {
			setSubmitError(writeError(err, "Failed to save"));
		} finally {
			setIsSaving(false);
		}
	}, [brand, data, queryClient, router, onComplete, writeError]);

	if (!reviewing) {
		return (
			<div className="max-w-2xl mx-auto space-y-3">
				<p className="text-sm text-muted-foreground">
					We'll research <strong>{brand?.website}</strong> and generate a starter question set using our shared question
					bank. Most questions test discovery without mentioning your brand. Research uses your configured API balance.
				</p>
				{error && (
					<div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
						<AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
						<span>{error}</span>
					</div>
				)}
				{generation.isPending && <p role="status">Checking research connection…</p>}
				{generation.error && (
					<p role="alert">Could not check the research connection. You can still use the starter bank.</p>
				)}
				{generation.data?.available === false && (
					<p className="text-sm">
						Connect a research provider for website-based generation, or choose an industry below.{" "}
						<ResearchSetupLink canConfigure={generation.data.canConfigure} />
					</p>
				)}
				<div className="flex flex-wrap items-center gap-2">
					<Button
						onClick={handleAnalyze}
						disabled={analysis.running || !generation.data?.available}
						className="flex items-center gap-2 cursor-pointer"
					>
						{analysis.running ? (
							<>
								<Spinner /> Generating questions…
							</>
						) : (
							<>
								<Play className="h-4 w-4" /> Generate questions from website
							</>
						)}
					</Button>
					{analysis.running && (
						<Button variant="outline" onClick={analysis.cancel} className="cursor-pointer">
							Cancel
						</Button>
					)}
				</div>
				{!analysis.running && (
					<QuestionBankPicker
						brandName={brand?.name || ""}
						researchUnavailable={!generation.data?.available}
						onUse={useStarterBank}
					/>
				)}
			</div>
		);
	}

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<div className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-2xl font-bold">Review your monitoring questions</h2>
					<Button variant="ghost" disabled={isSaving} onClick={() => setReviewing(false)}>
						Change question set
					</Button>
				</div>
				<p role="status" className="text-sm text-muted-foreground">
					{questionSource}
				</p>
				<p className="text-muted-foreground">
					Confirm the brand identity, additional domains, and aliases used for tracking.
				</p>
				<div className="space-y-3">
					<div>
						<p className="text-xs text-muted-foreground">Brand name</p>
						<Input value={data.brandName} onChange={(e) => updateBrandName(e.target.value)} placeholder="Brand name" />
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Website URL</p>
						<Input
							type="url"
							value={data.website}
							onChange={(e) => updateWebsite(e.target.value)}
							placeholder="https://example.com"
						/>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Additional domains</p>
						<EditableTagsInput
							items={data.additionalDomains}
							onValueChange={updateAdditionalDomains}
							placeholder="Add domain..."
							maxItems={10}
						/>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">Aliases</p>
						<EditableTagsInput
							items={data.aliases}
							onValueChange={updateAliases}
							placeholder="Add alias..."
							maxItems={10}
						/>
					</div>
				</div>
			</div>

			<Separator />

			<div className="space-y-3">
				<div>
					<h2 className="text-2xl font-bold">Competitors</h2>
					<p className="text-muted-foreground">Companies you want tracked alongside your brand.</p>
				</div>
				<CompetitorsEditor competitors={data.competitors} onChange={updateCompetitors} disabled={isSaving} />
			</div>

			<Separator />

			<div className="space-y-3">
				<div>
					<h2 className="text-2xl font-bold">Prompts</h2>
					<p className="text-muted-foreground">
						Pick which AI tracking prompts to start with. Untick any you don't want, edit tags, or add your own at the
						bottom.
					</p>
				</div>
				<PromptsListEditor prompts={data.prompts} onChange={updatePrompts} showSystemTags={false} />
			</div>

			{submitError && (
				<div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
					<AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
					<div className="text-sm">{submitError}</div>
				</div>
			)}

			<Button
				onClick={handleSubmit}
				disabled={isSaving || previewCounts.totalNew === 0}
				className="flex items-center gap-2 cursor-pointer"
			>
				{isSaving ? (
					<>
						<Spinner /> Saving…
					</>
				) : (
					<>
						<Rocket className="h-4 w-4" /> Start tracking ({previewCounts.totalNew} new prompts)
					</>
				)}
			</Button>
		</div>
	);
}

function ResearchSetupLink({ canConfigure }: { canConfigure: boolean }) {
	return canConfigure ? (
		<Link to="/setup" className="underline">
			Connections
		</Link>
	) : (
		<span>Ask your administrator to connect a research provider.</span>
	);
}
