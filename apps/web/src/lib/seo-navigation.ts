export const SEO_PAGES = [
	{ view: "home", title: "Analysis workspace" },
	{ view: "domain", title: "Domain overview" },
	{ view: "keywords", title: "Keywords" },
	{ view: "backlinks", title: "Backlinks" },
	{ view: "results", title: "Reports & history" },
	{ view: "actions", title: "Content & questions" },
] as const;

export function seoPage(hash: string) {
	return SEO_PAGES.find((page) => page.view === hash) ?? SEO_PAGES[0];
}
