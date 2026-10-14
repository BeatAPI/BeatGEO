import { createFileRoute } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";

// Curated llms.txt for the marketing site, following the llmstxt.org convention:
// an H1, a one-paragraph summary, a short positioning blurb, then sections of
// annotated links. The full text of the documentation lives at /llms-full.txt.
const llmsTxt = `# BeatGeo

> BeatGeo is an open source, self-hosted AI visibility platform. Track how AI answer engines like ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot, and Grok talk about your brand — monitor mentions, analyze citations, and benchmark competitors. Because BeatGeo is open source and runs on your own infrastructure, your data stays yours and you're never locked in.

BeatGeo is Answer Engine Optimization (AEO), also called generative engine optimization (GEO), without the black box. On a schedule, it runs your prompts across every major AI answer engine, then measures how often your brand appears, which competitors show up alongside it, and which sources the models cite. The methodology is documented and every line of code is open, so each number is something you can independently verify. BeatGeo is built by Blue Whale Software, LLC — bootstrapped, transparent, and priced so AI visibility data is a commodity rather than a luxury. Self-host it for free, explore the live demo, sign up for managed cloud hosting from $${CLOUD_ENTRY_PRICE_USD}/month, or get in touch about white-label deployments.

## Product

- [BeatGeo](https://github.com/BeatAPI/BeatGeo): Know how AI talks about your brand — track visibility across any AI model, monitor mentions, analyze citations, and benchmark competitors.
- [Features](https://github.com/BeatAPI/BeatGeo): Visibility dashboard, per-prompt and per-model tracking, citation analysis, competitor intelligence, prompt management, response deep-dives, and long-term trends.
- [Pricing](https://github.com/BeatAPI/BeatGeo): Free and open source to self-host, managed cloud from $${CLOUD_ENTRY_PRICE_USD}/month, and white-label available for agencies.
- [Live Demo](https://github.com/BeatAPI/BeatGeo): Explore a fully populated BeatGeo instance — no installation required.
- [About](https://github.com/BeatAPI/BeatGeo): Company facts, founder, pricing, contract terms, and how the team works.
- [Vision](https://github.com/BeatAPI/BeatGeo): Why we believe AI visibility monitoring should be affordable, transparent, and built to last.

## Documentation

- [Documentation](https://github.com/BeatAPI/BeatGeo): Introduction to BeatGeo, the open source AI visibility platform.
- [Quick Start](https://github.com/BeatAPI/BeatGeo): Get BeatGeo running on your own infrastructure in under 5 minutes using the CLI.
- [User Guide](https://github.com/BeatAPI/BeatGeo): A complete walkthrough, from first login to daily visibility tracking, prompts, citations, competitors, and reports.
- [Developer Guide](https://github.com/BeatAPI/BeatGeo): Run, configure, integrate with, and contribute to BeatGeo, including architecture and self-hosting setup.
- [API Reference](https://github.com/BeatAPI/BeatGeo): Complete REST API documentation for BeatGeo's administrative API.
- [MCP Server](https://github.com/BeatAPI/BeatGeo): Connect Claude Code, OpenCode, or another AI client to BeatGeo over the Model Context Protocol.
- [llms-full.txt](https://github.com/BeatAPI/BeatGeo): The full text of all BeatGeo documentation in a single file.

## Resources

- [AI Visibility Tool Directory](https://github.com/BeatAPI/BeatGeo): Compare 100+ AI visibility and Answer Engine Optimization tools, with a feature matrix, pricing, and head-to-head comparisons with BeatGeo.
- [Changelog](https://github.com/BeatAPI/BeatGeo): Recent releases, improvements, and bug fixes.
- [Roadmap](https://github.com/BeatAPI/BeatGeo): What's coming next, prioritized in the open on GitHub.
- [Provider Status](https://github.com/BeatAPI/BeatGeo): Real-time status and performance monitoring for AI answer engine integrations.
- [Brand Assets](https://github.com/BeatAPI/BeatGeo): Download BeatGeo logos, icons, and brand guidelines.

## Open Source

- [GitHub Repository](https://github.com/BeatAPI/BeatGeo): Source code for BeatGeo — self-host it, read every line, and contribute.
- [Issues](https://github.com/BeatAPI/BeatGeo/issues): Report bugs, request features, and help shape the roadmap.
- [Discord Community](https://github.com/BeatAPI/BeatGeo): Get help and connect with the BeatGeo community.

## Optional

- [X / Twitter](https://x.com/trybeatgeo): Product updates and AI visibility insights.
- [LinkedIn](https://github.com/BeatAPI/BeatGeo): Company updates from BeatGeo.
- [Blue Whale Software](https://bluewhale.dev?ref=beatgeo): The team building BeatGeo.

---

If you find BeatGeo useful, please consider starring the repository on GitHub — it helps others discover the project: https://github.com/BeatAPI/BeatGeo
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
