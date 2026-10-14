import { createFileRoute, notFound } from "@tanstack/react-router";
import { CompetitorComparison } from "@/components/competitor-comparison";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { type Competitor, competitors, getComparisonFaqs, getComparisonSlug, isLowDR } from "@/lib/competitors";
import {
	BEAT_GEO_LISTING,
	breadcrumbJsonLd,
	canonicalUrl,
	comparisonJsonLd,
	faqJsonLd,
	ogMeta,
	softwareApplicationJsonLd,
} from "@/lib/seo";

export const Route = createFileRoute("/ai-visibility-tools/$slug")({
	loader: ({ params }) => {
		const competitor = competitors.find((c) => getComparisonSlug(c) === params.slug);
		if (!competitor) throw notFound();
		return { competitor, faqs: getComparisonFaqs(competitor), noindex: isLowDR(competitor) };
	},
	head: ({ params, loaderData }) => {
		if (!loaderData) return {};
		const { competitor, faqs, noindex } = loaderData;
		const title = `BeatGeo vs ${competitor.name} | AI Visibility Tool Comparison · BeatGeo`;
		const description = `Compare BeatGeo and ${competitor.name} for AI visibility tracking. Feature-by-feature breakdown, pricing, and key differences.`;
		const path = `/ai-visibility-tools/${params.slug}`;
		const meta = [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })];
		if (noindex) {
			meta.push({ name: "robots", content: "noindex, follow" });
		}
		return {
			meta,
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
					{ name: `BeatGeo vs ${competitor.name}`, path },
				]),
				faqJsonLd(faqs),
				comparisonJsonLd([BEAT_GEO_LISTING, { name: competitor.name, url: competitor.url }]),
				softwareApplicationJsonLd(),
			],
		};
	},
	component: ComparisonPage,
});

function ComparisonPage() {
	const { competitor } = Route.useLoaderData() as { competitor: Competitor };
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<CompetitorComparison competitor={competitor} />
			</main>
			<Footer />
		</div>
	);
}
