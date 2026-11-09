import { ENV_REGISTRY } from "@workspace/config/env-registry";
import { getCredential } from "../secrets";
import type { ModelConfig } from "./types";

export function configuredWhen(...credentialKeys: string[]): () => boolean {
	return () => credentialKeys.every((key) => !!getCredential(key));
}

/** Output cap for one BeatAPI tracked run, covering reasoning tokens as well as visible text. */
export const API_PROVIDER_MAX_OUTPUT_TOKENS = 8000;

export function validateScrapeTargets(
	configs: ModelConfig[],
	getProvider: (
		id: string,
	) => { isConfigured(): boolean; validateTarget?(config: ModelConfig): string | null } | undefined,
): void {
	const errors = new Set<string>();
	for (const config of configs) {
		const provider = getProvider(config.provider);
		if (!provider) {
			errors.add(`SCRAPE_TARGETS: unknown provider "${config.provider}"`);
			continue;
		}
		if (!provider.isConfigured()) {
			const keys = ENV_REGISTRY.filter((spec) => spec.provider === config.provider && !getCredential(spec.name)).map(
				(spec) => spec.name,
			);
			const keyList = keys.length > 0 ? `: ${keys.join(", ")}` : " (see docs)";
			errors.add(`SCRAPE_TARGETS: provider "${config.provider}" requires API key(s) to be configured${keyList}`);
		}
		const targetError = provider.validateTarget?.(config);
		if (targetError) errors.add(`SCRAPE_TARGETS: invalid target "${config.model}:${config.provider}": ${targetError}`);
	}
	if (errors.size > 0) throw new Error([...errors].join("\n"));
}
