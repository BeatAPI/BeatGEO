import type { LookbackPeriod } from "@/lib/lookback";

export interface CitationFilters {
	lookback?: LookbackPeriod;
	tags?: string[];
	model?: string;
}

export const citationKeys = {
	all: ["citations"] as const,
	list: (brandId: string, filters?: CitationFilters) => [...citationKeys.all, brandId, filters] as const,
};
