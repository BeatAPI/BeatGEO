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
