import { createFileRoute, notFound } from "@tanstack/react-router";
import {
	BeatGeoCta,
	DirectoryBackLink,
	DirectoryBeatGeoBanner,
	DirectoryHero,
	DirectorySection,
} from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ToolGrid } from "@/components/tool-list";
import {
	CATEGORY_HEADINGS,
	type Competitor,
	type CompetitorCategory,
	getCategoryBeatGeoPitch,
	getCategoryBySlug,
	getCategoryFaqs,
	getCategoryVerdict,
	getComparisonSlug,
	toolsInCategory,
} from "@/lib/competitors";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

export const Route = createFileRoute("/ai-visibility-tools/category/$slug")({
	loader: ({ params }) => {
		const category = getCategoryBySlug(params.slug);
		if (!category) throw notFound();
		const tools = toolsInCategory(category);
		if (tools.length < 2) throw notFound();
		return { category, tools, heading: CATEGORY_HEADINGS[category], faqs: getCategoryFaqs(category, tools) };
	},
	head: ({ params, loaderData }) => {
		if (!loaderData) return {};
		const { heading, faqs } = loaderData;
		const title = `${heading.charAt(0).toUpperCase()}${heading.slice(1)} · BeatGeo`;
		const description = `A comparison of ${heading} for tracking your brand in AI search, including BeatGeo — the open-source, self-hosted option.`;
		const path = `/ai-visibility-tools/category/${params.slug}`;
		return {
			meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
					{ name: heading, path },
				]),
				faqJsonLd(faqs),
			],
		};
	},
	component: CategoryPage,
});

function CategoryPage() {
	const { category, tools } = Route.useLoaderData() as {
		category: CompetitorCategory;
		tools: Competitor[];
	};
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero
					eyebrow="Category"
					title={CATEGORY_HEADINGS[category]}
					lead={getCategoryVerdict(category, tools)}
				/>
				<DirectoryBeatGeoBanner
					pitch={getCategoryBeatGeoPitch(category)}
					comparison={{
						slug: getComparisonSlug(tools[0]),
						name: tools[0].name,
					}}
				/>
				<DirectorySection title="Tools in this category">
					<ToolGrid competitors={tools} />
				</DirectorySection>
				<Faq items={getCategoryFaqs(category, tools)} eyebrow="/ FAQ" />
				<BeatGeoCta />
			</main>
			<Footer />
		</div>
	);
}
