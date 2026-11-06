/**
 * A whitelist on purpose: the stored `report` column is model output, and
 * returning it whole would make whatever the generator wrote part of this
 * contract.
 */
import type { CitedPage, ReportOpportunity } from "./opportunities";
import { resolveOpportunities } from "./opportunities";

/** Absence of a generated report does not imply absence of observed answers. */
type OpportunitiesStatus = "ready" | "not-generated";

interface PublishedOpportunity {
	category: ReportOpportunity["category"];
	title: string;
	why: string;
	relatedPrompts: Array<{ text: string; promptId: string | null }>;
	yourCitations: CitedPage[];
	competitorCitations: CitedPage[];
}

export interface PublishedOpportunities {
	brandId: string;
	status: OpportunitiesStatus;
	generatedAt: string | null;
	model: string | null;
	summary: string[];
	opportunities: PublishedOpportunity[];
	risks: string[];
}

export async function publishedOpportunities(brandId: string): Promise<PublishedOpportunities> {
	const result = await resolveOpportunities(brandId);
	const opportunities = result.report?.opportunities ?? [];

	return {
		brandId,
		status: result.report ? "ready" : "not-generated",
		generatedAt: result.lastEvaluatedAt,
		model: result.model,
		summary: result.report?.summary ?? [],
		opportunities: opportunities.map((item) => ({
			category: item.category,
			title: item.title,
			why: item.why,
			relatedPrompts: (item.relatedPrompts ?? []).map((prompt) => ({
				text: prompt.text,
				promptId: prompt.promptId,
			})),
			yourCitations: item.yourCitations ?? [],
			competitorCitations: item.competitorCitations ?? [],
		})),
		risks: result.report?.risks ?? [],
	};
}
