/**
 * Server functions for the platform-picker UI on the LLMs settings page. Extracted from brands.ts so brand CRUD and platform/pick management
 * stay in separate files.
 */
import { createServerFn } from "@tanstack/react-start";
import { parseScrapeTargets, providersByModel } from "@workspace/config/scrape-targets";
import { getDefaultDelayHours, getRunsPerPrompt } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import type { ModelConfig, ProviderAccess } from "@workspace/lib/providers";
import { describeProvider, resolveProviderAccess, selectTargetsForBrand } from "@workspace/lib/providers";
import { estimateRunCostUsd } from "@workspace/lib/usage";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { expeditePromptRuns } from "@/lib/expedite-prompts";
import { addedPlatforms } from "@/lib/run-config-changes";

export type PlatformOption = {
	model: string;
	webSearch: boolean;
	/** Scraped consumer surface vs direct API call — shown as a pill. */
	access: ProviderAccess;
	/** Which vendor serves this target, and its model slug. */
	providerName: string;
	version?: string;
	/** Rough USD per provider call. */
	costPerRunUsd: number | null;
};

export type ModelPickerState = {
	/** Models this brand may choose from, with target metadata for display. */
	available: PlatformOption[];
	/** Whether the page offers checkboxes and a save bar. The one answer to "can
	 *  this be changed" — the page renders it, it does not re-derive it. */
	editable: boolean;
	/** The resolved list, never the raw `brands.enabledModels` column — null there
	 *  means "use the default", which the page once showed as "all platforms". */
	enabledModels: string[];
	/** What this brand's tracking currently costs to run, for projecting the price of a platform. */
	costBasis: { enabledPrompts: number; runsPerDay: number; replication: number };
	/**
	 * Platforms BeatGEO can track that this instance has not configured, with the
	 * providers that can serve each and where to read how.
	 */
	unconfiguredPlatforms: {
		model: string;
		/** Split by how each reaches the model: the two are not interchangeable. */
		providers: { id: string; name: string; access: ProviderAccess; docsUrl: string }[];
	}[];
};

function toOption(config: ModelConfig): PlatformOption {
	return {
		model: config.model,
		webSearch: config.webSearch,
		access: resolveProviderAccess(config),
		providerName: describeProvider(config.provider).name,
		version: config.version,
		costPerRunUsd: estimateRunCostUsd(config.provider, config.webSearch),
	};
}

/**
 * One option per model, in SCRAPE_TARGETS order. Picks are stored by model name
 * (`brands.enabledModels`), so two targets for the same model can never be
 * chosen independently — offering both would render duplicate rows whose
 * checkboxes moved together. The first configured target for each model wins.
 */
function optionsByModel(configs: ModelConfig[]): PlatformOption[] {
	const seen = new Set<string>();
	const options: PlatformOption[] = [];
	for (const config of configs) {
		if (seen.has(config.model)) continue;
		seen.add(config.model);
		options.push(toOption(config));
	}
	return options;
}

async function costBasis(brand: {
	id: string;
	delayOverrideHours: number | null;
}): Promise<ModelPickerState["costBasis"]> {
	const [row] = await db
		.select({ value: count() })
		.from(prompts)
		.where(and(eq(prompts.brandId, brand.id), eq(prompts.enabled, true)));

	const delayHours = brand.delayOverrideHours ?? getDefaultDelayHours();
	return {
		enabledPrompts: row?.value ?? 0,
		runsPerDay: 24 / Math.max(1, delayHours),
		replication: getRunsPerPrompt(),
	};
}

/**
 * Trackable platforms this instance has no target for. Derived from the combos
 * the provider status workflow exercises, so every suggestion is one we know
 * works, and ordered to match the picker above.
 */
function unconfiguredPlatforms(configs: ModelConfig[]): ModelPickerState["unconfiguredPlatforms"] {
	const configured = new Set(configs.map((config) => config.model));
	const suggestions: ModelPickerState["unconfiguredPlatforms"] = [];
	for (const [model, providerIds] of providersByModel()) {
		if (configured.has(model)) continue;
		suggestions.push({ model, providers: providerIds.map(describeProvider) });
	}
	return suggestions;
}

export const getModelPickerStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<ModelPickerState> => {
		await requireBrandSession(data.brandId);

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!brand) throw new Error("Brand not found");

		// Every configured target is offered, grounded ones included.
		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);
		const available = optionsByModel(configs);
		return {
			available,
			editable: available.length > 0,
			enabledModels: brand.enabledModels ?? available.map((option) => option.model),
			costBasis: await costBasis(brand),
			unconfiguredPlatforms: unconfiguredPlatforms(configs),
		};
	});

export const updateEnabledModelsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			/** Explicit picks, or null to follow the deployment configuration. */
			models: z.array(z.string().min(1)).max(50).nullable(),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!brand) throw new Error("Brand not found");

		const models = data.models === null ? null : [...new Set(data.models)];
		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

		// Loud validation against the configured targets (same rule the worker
		// applies), so a typo can't silently stop tracking.
		if (models !== null) selectTargetsForBrand(configs, models);

		const [updated] = await db
			.update(brands)
			.set({ enabledModels: models, updatedAt: new Date() })
			.where(eq(brands.id, data.brandId))
			.returning({ id: brands.id, enabledModels: brands.enabledModels });
		if (!updated) throw new Error("Brand not found");

		// A newly picked platform has no run history, so do not make it wait for
		// each prompt's already-scheduled next job.
		const added = addedPlatforms(
			brand.enabledModels,
			models,
			configs.map((config) => config.model),
		);
		if (added.length > 0) {
			const enabled = await db
				.select({ id: prompts.id })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)));
			await expeditePromptRuns(enabled.map((prompt) => prompt.id));
		}

		return updated;
	});
