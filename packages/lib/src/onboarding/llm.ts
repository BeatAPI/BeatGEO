/**
 * Onboarding research and the Opportunities report run through BeatAPI: one
 * bounded web search, a few page reads and one structured completion
 * (`runStructuredResearch`). `ONBOARDING_LLM_TARGET` (parsed like a
 * SCRAPE_TARGETS entry) can point at `stub:stub` for keyless UI work.
 */
import { RESEARCH_PROVIDER_PREFERENCE } from "@workspace/config/env-registry";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import type { z } from "zod";
import { getProvider, type Provider, type StructuredResearchResult } from "../providers";
import { withStoredCredentials } from "../secrets";

export { RESEARCH_PROVIDER_PREFERENCE };

const ONBOARDING_LLM_TARGET_HELP = "Configure BEATAPI_API_KEY + BEATAPI_RESEARCH_MODEL in Brand → API Key.";

/**
 * Pick which provider the onboarding flow should use.
 *
 * Resolution order:
 *   1. `ONBOARDING_LLM_TARGET` env override (parsed `model:provider`; only
 *      the `provider` segment is honored).
 *   2. First provider in `RESEARCH_PROVIDER_PREFERENCE` that's configured AND
 *      implements `runStructuredResearch`.
 *
 * BeatAPI uses BEATAPI_RESEARCH_MODEL; the target model segment does not override it.
 */
export function resolveResearchProvider(env: Record<string, string | undefined> = withStoredCredentials()): Provider {
	const explicit = env.ONBOARDING_LLM_TARGET?.trim();
	if (explicit) {
		const [parsed] = parseScrapeTargets(explicit);
		if (!parsed) throw new Error(`Invalid ONBOARDING_LLM_TARGET: "${explicit}"`);
		const provider = getProvider(parsed.provider);
		if (parsed.provider === "beatapi" && !env.BEATAPI_RESEARCH_MODEL?.trim())
			throw new Error("Set BEATAPI_RESEARCH_MODEL for BeatAPI research.");
		if (!provider.isConfigured()) {
			throw new Error(
				`ONBOARDING_LLM_TARGET points at "${parsed.provider}" but it isn't configured. ${ONBOARDING_LLM_TARGET_HELP}`,
			);
		}
		if (!provider.runStructuredResearch) {
			throw new Error(
				`ONBOARDING_LLM_TARGET points at "${parsed.provider}", which does not support structured research. ${ONBOARDING_LLM_TARGET_HELP}`,
			);
		}
		return provider;
	}

	const preferred = RESEARCH_PROVIDER_PREFERENCE.map(getProvider).find((provider) => researchReady(provider, env));
	if (preferred) return preferred;

	throw new Error(`Onboarding research needs BeatAPI. ${ONBOARDING_LLM_TARGET_HELP}`);
}

/**
 * Run a research prompt and return a Zod-validated structured response. The
 * heavy lifting (web search, structured outputs, retry) lives inside each
 * provider's `runStructuredResearch` impl — we just pick the provider.
 */
export async function runStructuredResearchPrompt<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
	const provider = resolveResearchProvider();
	if (!provider.runStructuredResearch) {
		throw new Error(`Provider "${provider.id}" does not implement structured research`);
	}
	const result = await provider.runStructuredResearch({ prompt, schema });
	return result.object;
}

/**
 * Like {@link runStructuredResearchPrompt} but with the web-search tool OFF — a
 * single structured completion over context you assemble into the prompt. Same
 * provider selection (honors `ONBOARDING_LLM_TARGET` / the preference order),
 * no tools and no agent loop. Use when the prompt already carries all the data.
 *
 * Returns the validated object plus the resolved model id (`modelVersion`) so
 * callers can record which model produced the result.
 */
export async function runStructuredCompletionPrompt<T>(
	prompt: string,
	schema: z.ZodType<T>,
): Promise<StructuredResearchResult<T>> {
	const provider = resolveResearchProvider();
	if (!provider.runStructuredResearch) {
		throw new Error(`Provider "${provider.id}" does not implement structured research`);
	}
	return provider.runStructuredResearch({ prompt, schema, webSearch: false });
}

function researchReady(provider: Provider, env: Record<string, string | undefined>): boolean {
	if (provider.id === "beatapi" && !env.BEATAPI_RESEARCH_MODEL?.trim()) return false;
	return provider.isConfigured() && Boolean(provider.runStructuredResearch);
}
