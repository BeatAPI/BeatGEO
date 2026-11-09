/**
 * Stored answers reach the prompt detail page through `extractTextContent`
 * before they are rendered, so extraction and rendering are checked together:
 * flattened text looks identical to a broken renderer from the page's side.
 */
import { extractTextContent } from "@workspace/lib/text-extraction";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponseMarkdown } from "@/components/response-markdown";

const PROSE = "Here are the **top** trackers:";
const TABLE = "| Tool | Price |\n| --- | --- |\n| Example Tracker | $99 |";
const ANSWER = `${PROSE}\n\n${TABLE}`;

const render = (rawOutput: unknown, provider: string) =>
	renderToStaticMarkup(<ResponseMarkdown>{extractTextContent(rawOutput, provider)}</ResponseMarkdown>);

const SURFACES: [name: string, provider: string, rawOutput: unknown][] = [
	["BeatBrowser observation", "beat-browser", { status: "completed", answer: ANSWER, citations: [] }],
	["BeatAPI answer", "beatapi", { choices: [{ finish_reason: "stop", message: { content: ANSWER } }] }],
];

describe("answer rendering across providers", () => {
	it.each(SURFACES)("renders %s as markdown", (_name, provider, rawOutput) => {
		const html = render(rawOutput, provider);
		expect(html).toContain("<table>");
		expect(html).toContain("<strong>top</strong>");
	});

	it("does not load relative or protocol-relative images", () => {
		const html = renderToStaticMarkup(
			<ResponseMarkdown>{`![remote](https://images.example/favicon.png)

![root relative](/api/session)

![path relative](./pixel.png)

![protocol relative](//tracker.example/pixel.png)`}</ResponseMarkdown>,
		);

		expect(html.match(/<img /g)).toHaveLength(1);
		expect(html).toContain('src="https://images.example/favicon.png"');
		expect(html).toContain('loading="lazy"');
		expect(html).toContain('referrerPolicy="no-referrer"');
		expect(html).not.toContain("/api/session");
		expect(html).not.toContain("tracker.example");
	});
});

describe("ResponseMarkdown search highlights", () => {
	const renderWith = (markdown: string, highlight?: string) =>
		renderToStaticMarkup(<ResponseMarkdown highlight={highlight}>{markdown}</ResponseMarkdown>);

	it("marks every match regardless of case, including inside formatting", () => {
		const html = renderWith("**Acme** beats acme-lite and ACME Pro.", "acme");

		expect(html.match(/<mark /g)).toHaveLength(3);
		expect(html).toMatch(/<strong><mark [^>]*>Acme<\/mark><\/strong>/);
		expect(html).toMatch(/<mark [^>]*>ACME<\/mark> Pro/);
	});

	it("marks link text without touching the link target", () => {
		const html = renderWith("See [Acme](https://acme.com/acme).", "acme");

		expect(html).toContain('href="https://acme.com/acme"');
		expect(html).toMatch(/<mark [^>]*>Acme<\/mark><\/a>/);
	});

	it("marks nothing without a search", () => {
		expect(renderWith("**Acme** beats acme-lite.")).not.toContain("<mark");
	});
});
