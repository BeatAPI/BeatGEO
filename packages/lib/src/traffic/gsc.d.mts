export const GSC_SCOPE: string;
export type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
export type GscSummary = {
	schema: "beat-geo/gsc-summary@1";
	site: string;
	siteUrl: string;
	startDate: string;
	endDate: string;
	fetchedAt: string;
	totals: GscRow | null;
	pages: GscRow[];
	queries: GscRow[];
	limitReached: boolean;
	warning: string;
};
export function listGscProperties(
	token: string,
	options?: { fetchImpl?: typeof fetch },
): Promise<Array<{ siteUrl: string; permissionLevel: string }>>;
export function fetchGsc(options: {
	token: string;
	siteUrl: string;
	startDate: string;
	endDate: string;
	fetchImpl?: typeof fetch;
}): Promise<GscSummary>;
