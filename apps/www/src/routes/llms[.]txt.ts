import { createFileRoute } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";

// Curated llms.txt for the marketing site, following the llmstxt.org convention:
// an H1, a one-paragraph summary, a short positioning blurb, then sections of
// annotated links. The full text of the documentation lives at /llms-full.txt.
const llmsTxt = `# BeatGEO

> BeatGEO is an open source, self-hosted AI visibility platform. Track how AI answer engines like ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot, and Grok talk about your brand — monitor mentions, analyze citations, and benchmark competitors. Because BeatGEO is open source and runs on your own infrastructure, your data stays yours and you're never locked in.

BeatGEO is Answer Engine Optimization (AEO), also called generative engine optimization (GEO), without the black box. On a schedule, it runs your prompts across every major AI answer engine, then measures how often your brand appears, which competitors show up alongside it, and which sources the models cite. The methodology is documented and every line of code is open, so each number is something you can independently verify. BeatGEO is built by Blue Whale Software, LLC — bootstrapped, transparent, and priced so AI visibility data is a commodity rather than a luxury. Self-host it for free, explore the live demo, sign up for managed cloud hosting from $${CLOUD_ENTRY_PRICE_USD}/month, or get in touch about white-label deployments.

## Product

- [BeatGEO](https://github.com/BeatAPI/BeatGEO): Know how AI talks about your brand — track visibility across any AI model, monitor mentions, analyze citations, and benchmark competitors.
- [Features](https://github.com/BeatAPI/BeatGEO): Visibility dashboard, per-prompt and per-model tracking, citation analysis, competitor intelligence, prompt management, response deep-dives, and long-term trends.
- [Pricing](https://github.com/BeatAPI/BeatGEO): Free and open source to self-host, managed cloud from $${CLOUD_ENTRY_PRICE_USD}/month, and white-label available for agencies.
- [Live Demo](https://github.com/BeatAPI/BeatGEO): Explore a fully populated BeatGEO instance — no installation required.
- [About](https://github.com/BeatAPI/BeatGEO): Company facts, founder, pricing, contract terms, and how the team works.
- [Vision](https://github.com/BeatAPI/BeatGEO): Why we believe AI visibility monitoring should be affordable, transparent, and built to last.

## Documentation

- [Documentation](https://github.com/BeatAPI/BeatGEO): Introduction to BeatGEO, the open source AI visibility platform.
- [Quick Start](https://github.com/BeatAPI/BeatGEO): Get BeatGEO running on your own infrastructure in under 5 minutes using the CLI.
- [User Guide](https://github.com/BeatAPI/BeatGEO): A complete walkthrough, from first login to daily visibility tracking, prompts, citations, competitors, and reports.
- [Developer Guide](https://github.com/BeatAPI/BeatGEO): Run, configure, integrate with, and contribute to BeatGEO, including architecture and self-hosting setup.
- [API Reference](https://github.com/BeatAPI/BeatGEO): Complete REST API documentation for BeatGEO's administrative API.
- [MCP Server](https://github.com/BeatAPI/BeatGEO): Connect Claude Code, OpenCode, or another AI client to BeatGEO over the Model Context Protocol.
- [llms-full.txt](https://github.com/BeatAPI/BeatGEO): The full text of all BeatGEO documentation in a single file.

## Resources

- [AI Visibility Tool Directory](https://github.com/BeatAPI/BeatGEO): Compare 100+ AI visibility and Answer Engine Optimization tools, with a feature matrix, pricing, and head-to-head comparisons with BeatGEO.
- [Changelog](https://github.com/BeatAPI/BeatGEO): Recent releases, improvements, and bug fixes.
- [Roadmap](https://github.com/BeatAPI/BeatGEO): What's coming next, prioritized in the open on GitHub.
- [Provider Status](https://github.com/BeatAPI/BeatGEO): Real-time status and performance monitoring for AI answer engine integrations.
- [Brand Assets](https://github.com/BeatAPI/BeatGEO): Download BeatGEO logos, icons, and brand guidelines.

## Open Source

- [GitHub Repository](https://github.com/BeatAPI/BeatGEO): Source code for BeatGEO — self-host it, read every line, and contribute.
- [Issues](https://github.com/BeatAPI/BeatGEO/issues): Report bugs, request features, and help shape the roadmap.
- [Discord Community](https://github.com/BeatAPI/BeatGEO): Get help and connect with the BeatGEO community.

## Optional

- [X / Twitter](https://x.com/trybeatgeo): Product updates and AI visibility insights.
- [LinkedIn](https://github.com/BeatAPI/BeatGEO): Company updates from BeatGEO.
- [Blue Whale Software](https://bluewhale.dev?ref=beatgeo): The team building BeatGEO.

---

If you find BeatGEO useful, please consider starring the repository on GitHub — it helps others discover the project: https://github.com/BeatAPI/BeatGEO
`;

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET() {
				return new Response(llmsTxt, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			},
		},
	},
});
