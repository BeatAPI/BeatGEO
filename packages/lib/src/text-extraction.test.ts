import { describe, expect, it } from "vitest";
import {
	CITATION_TITLE_MAX_LENGTH,
	extractCitations,
	extractTextContent,
	normalizeCitationTitle,
} from "./text-extraction";

const browserRun = (overrides: Record<string, unknown> = {}) => ({
	status: "completed",
	answer: "Browser answer",
	citations: [
		{ url: "https://example.com/a", title: "A" },
		{ url: "https://example.com/a", title: "duplicate" },
		{ url: "not-a-url" },
		{ url: "https://www.example.org/b" },
	],
	...overrides,
});

describe("text-extraction", () => {
	describe("extractTextContent", () => {
		it("reads a completed BeatBrowser observation", () => {
			expect(extractTextContent(browserRun(), "beat-browser")).toBe("Browser answer");
		});

		it("shows no answer for an unfinished browser run instead of a stale one", () => {
			expect(extractTextContent(browserRun({ status: "timeout" }), "beat-browser")).toBe("");
		});

		it("reads a BeatAPI chat completion", () => {
			const raw = { model: "m", choices: [{ finish_reason: "stop", message: { content: "API answer" } }] };
			expect(extractTextContent(raw, "beatapi")).toBe("API answer");
		});

		it("falls back to plain text and says when a format is unknown", () => {
			expect(extractTextContent("plain", "chatgpt")).toBe("plain");
			expect(extractTextContent(null, "chatgpt")).toBe("No content.");
			expect(extractTextContent({ odd: true }, "chatgpt")).toContain("Unknown provider format");
		});
	});

	describe("extractCitations", () => {
		it("keeps each valid browser citation once, in order", () => {
			const citations = extractCitations(browserRun(), "beat-browser");
			expect(citations.map((c) => [c.url, c.domain, c.citationIndex])).toEqual([
				["https://example.com/a", "example.com", 0],
				["https://www.example.org/b", "example.org", 1],
			]);
		});

		it("reports no citations for unfinished runs or API answers", () => {
			expect(extractCitations(browserRun({ status: "failed" }), "beat-browser")).toEqual([]);
			expect(extractCitations({ choices: [] }, "beatapi")).toEqual([]);
		});
	});

	describe("citation titles", () => {
		it("keeps titles that are already a sensible length", () => {
			expect(normalizeCitationTitle("A perfectly normal page title")).toBe("A perfectly normal page title");
		});

		it("treats a missing or empty title as absent", () => {
			expect(normalizeCitationTitle(undefined)).toBeUndefined();
			expect(normalizeCitationTitle("")).toBeUndefined();
			expect(normalizeCitationTitle(12345)).toBeUndefined();
		});

		it("bounds titles so an oversized one cannot fail the citation insert", () => {
			expect(normalizeCitationTitle("x".repeat(11_325))).toHaveLength(CITATION_TITLE_MAX_LENGTH);
		});

		it("truncates on whole characters so multi-byte titles stay valid", () => {
			const truncated = normalizeCitationTitle("\u{1D518}".repeat(CITATION_TITLE_MAX_LENGTH + 50));
			expect(truncated).toBe("\u{1D518}".repeat(CITATION_TITLE_MAX_LENGTH));
		});

		it("bounds titles arriving from a browser observation", () => {
			const citations = extractCitations(
				browserRun({ citations: [{ url: "https://example.com/manual.pdf", title: "y".repeat(8000) }] }),
				"beat-browser",
			);
			expect(citations).toHaveLength(1);
			expect(citations[0].title).toHaveLength(CITATION_TITLE_MAX_LENGTH);
		});
	});
});
