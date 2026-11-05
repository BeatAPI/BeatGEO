export interface GaRow {
	source: string;
	medium: string;
	channel: string;
	platform: string;
	basis: string;
	path?: string;
	sessions: number;
	engagedSessions: number;
	keyEvents: number;
}
export interface GaSummary {
	performance?: GaPerformance;
	schema: "beat-geo/ga-summary@1";
	generatedAt: string;
	synthetic: boolean;
	property: { id: string; name: string };
	site: string;
	dates: { startDate: string; endDate: string };
	timeZone: string | null;
	fetchedAt: string | null;
	warnings: string[];
	totals: { sessions: number; engagedSessions: number; keyEvents: number };
	platforms: Array<{ platform: string; sessions: number; engagedSessions: number; keyEvents: number }>;
	sources: GaRow[];
	pages: GaRow[];
	observation: string;
}
export const GA_SCOPE: string;
export const GA_DIMENSIONS: string[];
export const GA_METRICS: string[];
export const AI_SOURCES: Array<[string, string[]]>;
export function classifyGaSource(source: string, channel: string): { platform: string; basis: string } | null;
export function gaProperty(value: unknown): string;
export function gaDates(options?: { start?: string; end?: string }): { startDate: string; endDate: string };
export function resolveGaDates(
	dates: { startDate: string; endDate: string },
	timeZone: string,
	now?: number,
): { startDate: string; endDate: string };
export function gaRequest(options: {
	site: string;
	dates: { startDate: string; endDate: string };
	landing?: boolean;
	offset?: number;
	limit?: number;
}): unknown;
export function googleJson(
	url: string | URL,
	options?: { token?: string; body?: unknown; fetchImpl?: typeof fetch },
): Promise<unknown>;
export function listGaProperties(
	token: string,
	options?: { fetchImpl?: typeof fetch },
): Promise<Array<{ id: string; name: string }>>;
export function listGaSites(token: string, property: string, options?: { fetchImpl?: typeof fetch }): Promise<string[]>;
export function analyzeGa(snapshot: unknown): GaSummary;
export function fetchGa(options: {
	token: string;
	property: { id: string; name: string };
	site: string;
	start?: string;
	end?: string;
	fetchImpl?: typeof fetch;
}): Promise<{ summary: GaSummary; snapshot: unknown }>;
export type GaPerformanceReport = {
	preset: string;
	dimensions: string[];
	rows: Array<{ dimensions: Record<string, string>; metrics: Record<string, number> }>;
	rowCount: number;
	limitReached: boolean;
	metadata: Array<{
		subjectToThresholding: boolean;
		dataLossFromOtherRow: boolean;
		sampled: boolean;
		restricted: boolean;
		timeZone: string;
		emptyReason: string;
	}>;
};
export type GaPerformanceWindow = {
	startDate: string;
	endDate: string;
	channels: GaPerformanceReport;
	organicPages: GaPerformanceReport;
	googleOrganicPages: GaPerformanceReport;
};
export type GaPerformance = {
	schema: "beat-geo/ga-performance@1";
	property: { id: string; name: string };
	site: string;
	timeZone: string;
	fetchedAt: string;
	current: GaPerformanceWindow;
	previous: GaPerformanceWindow;
	warning: string;
};
export function fetchGaPerformance(options: {
	token: string;
	property: { id: string; name: string };
	site: string;
	start?: string;
	end?: string;
	maxRows?: number;
	fetchImpl?: typeof fetch;
}): Promise<GaPerformance>;
