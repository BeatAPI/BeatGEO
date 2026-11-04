export interface CrawlCounts {
	requests: number;
	statuses: Record<string, number>;
	firstSeen: string | null;
	lastSeen: string | null;
	get2xx: number;
	head: number;
	notModified: number;
	denied: number;
	errors5xx: number;
}
export interface CrawlSummary {
	schema: "beat-geo/crawl-summary@1";
	generatedAt: string;
	site: string;
	synthetic: boolean;
	ruleVersion: string;
	input: {
		total: number;
		parsed: number;
		rejected: number;
		otherHost: number;
		outsideWindow: number;
		inWindow: number;
		unrecognized: number;
		ambiguous: number;
		errors: Array<{ line: number; code: string }>;
	};
	observation: {
		state: string;
		coverage: string;
		requestedFrom: string | null;
		requestedTo: string | null;
		observedFrom: string | null;
		observedTo: string | null;
		configuredHostRequests: number;
	};
	totals: CrawlCounts & { pages: number; identities: number; verifiedRequests: null };
	crawlers: Array<
		CrawlCounts & { id: string; name: string; platform: string; purpose: string; pages: number; verification: string }
	>;
	pages: Array<CrawlCounts & { crawlerId: string; name: string; path: string }>;
	requests: Array<{
		line: number;
		time: string;
		path: string;
		method: string;
		status: number;
		crawlerId: string;
		verification: string;
	}>;
	ambiguous: Array<{ line: number; time: string; path: string; candidates: string[] }>;
}
export const MAX_LOG_BYTES: number;
export function siteHostname(input: unknown): string;
export function logTime(input: unknown): string;
export function analyzeCrawls(
	content: string,
	options: { site: string; format?: "auto" | "combined" | "json" | "jsonl"; from?: string; to?: string; now?: number },
): CrawlSummary;
