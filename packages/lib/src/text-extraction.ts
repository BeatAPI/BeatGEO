/**
 * Functions for extracting text content and citations from stored rawOutput.
 *
 * BeatBrowser stores the collector run; BeatAPI stores an OpenAI-shaped chat
 * completion. These read that stored data back for display in the UI (prompt
 * detail pages, reports). New runs are normalized into ScrapeResult at write
 * time by Provider.run().
 */

/**
 * Extract text content from stored rawOutput.
 * Dispatches based on provider (how data was fetched), falling back to engine
 * because persisted runs may not identify a provider.
 */
export function extractTextContent(rawOutput: any, providerOrEngine: string): string {
	if (providerOrEngine === "beat-browser")
		return rawOutput?.status === "completed" && typeof rawOutput.answer === "string" ? rawOutput.answer : "";
	return tryGenericExtraction(rawOutput);
}

function tryGenericExtraction(rawOutput: any): string {
	if (!rawOutput) return "No content.";
	if (typeof rawOutput === "string") return rawOutput;
	if (rawOutput?.choices?.[0]?.message?.content) return rawOutput.choices[0].message.content;
	if (typeof rawOutput?.answer === "string" && rawOutput.answer.trim()) return rawOutput.answer;
	if (rawOutput?.answer_markdown) return rawOutput.answer_markdown;
	if (rawOutput?.answer_text) return rawOutput.answer_text;
	if (rawOutput?.content?.[0]?.text) return rawOutput.content[0].text;
	return "Unknown provider format - cannot extract text content.";
}

// ============================================================================
// Citation extraction by provider
// ============================================================================

export type Citation = {
	url: string;
	title?: string;
	domain: string;
	citationIndex: number;
};

export const CITATION_TITLE_MAX_LENGTH = 256;

export function normalizeCitationTitle(title: unknown): string | undefined {
	if (typeof title !== "string" || !title) return undefined;
	const chars = Array.from(title);
	return chars.length > CITATION_TITLE_MAX_LENGTH ? chars.slice(0, CITATION_TITLE_MAX_LENGTH).join("") : title;
}

function parseCitationUrl(url: string, title: string | undefined, idx: number): Citation | null {
	try {
		const parsed = new URL(url);
		return {
			url,
			title: normalizeCitationTitle(title),
			domain: parsed.hostname.replace(/^www\./, ""),
			citationIndex: idx,
		};
	} catch {
		return null;
	}
}

type AddCitation = (url: unknown, title?: unknown) => void;

/** Read a payload field that should hold a list but may be missing or malformed. */
function asArray(value: unknown): any[] {
	return Array.isArray(value) ? value : [];
}

/**
 * Validating, de-duplicating and indexing citations is the same work for every
 * stored payload, so it lives here. `traverse` walks the payload and hands each candidate
 * to `add`; a payload malformed enough to throw yields no citations rather than
 * failing the run that produced it.
 */
function collectCitations(traverse: (add: AddCitation) => void): Citation[] {
	const citations: Citation[] = [];
	const seen = new Set<string>();
	const add: AddCitation = (url, title) => {
		if (typeof url !== "string" || !url.startsWith("http") || seen.has(url)) return;
		seen.add(url);
		const citation = parseCitationUrl(url, typeof title === "string" ? title : undefined, citations.length);
		if (citation) citations.push(citation);
	};
	try {
		traverse(add);
	} catch {
		return [];
	}
	return citations;
}

/**
 * Extract citations from stored rawOutput. BeatAPI tracked runs ask the model
 * without web search, so only browser observations carry citations.
 */
export function extractCitations(rawOutput: any, providerOrEngine: string): Citation[] {
	if (providerOrEngine !== "beat-browser") return [];
	return collectCitations((add) => {
		if (rawOutput?.status !== "completed") return;
		for (const citation of asArray(rawOutput.citations)) add(citation?.url, citation?.title);
	});
}
