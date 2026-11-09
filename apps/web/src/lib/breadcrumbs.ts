import { useMatches } from "@tanstack/react-router";
import { usePublicHash } from "@/hooks/use-public-hash";
import { BRAND_ROUTE_ID, ORG_ROUTE_ID, routeSubjects } from "@/lib/route-subject";
import { seoPage } from "@/lib/seo-navigation";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		crumb?: string;
	}
}

export interface Crumb {
	label: string;
	href: string;
	kind?: "Brand";
}

interface CrumbMatch {
	routeId: string;
	pathname: string;
	loaderData?: unknown;
	staticData?: { crumb?: string };
}

/** Shared by the header and the server-rendered <title>, so both name a page the same way. */
export function crumbsFor(matches: CrumbMatch[], { hash }: { hash: string }): Crumb[] {
	const subjects = routeSubjects(matches);
	let brandPath = "";
	return matches.flatMap((match): Crumb[] => {
		// The one local organization is implied, so it never earns a crumb.
		if (match.routeId === ORG_ROUTE_ID) return [];
		if (match.routeId === BRAND_ROUTE_ID) {
			brandPath = match.pathname;
			const label = subjects.brand?.name;
			return label ? [{ label, href: match.pathname, kind: "Brand" }] : [];
		}
		const crumbs = pageCrumbs(match.staticData?.crumb, match.pathname, hash);
		// GEO pages sit under their section the way SEO pages do; its overview is the brand's own page.
		if (
			brandPath &&
			GEO_PAGES.has(match.staticData?.crumb ?? "") &&
			!(match.staticData?.crumb === "Opportunities" && ["search", "seo-actions", "all-actions"].includes(hash))
		)
			return [{ label: "GEO", href: brandPath.replace(/\/$/, "") }, ...crumbs];
		return crumbs;
	});
}

/** The pages the sidebar groups under GEO. */
const GEO_PAGES = new Set([
	"Overview",
	"Questions",
	"Question history",
	"Visibility",
	"Share of Voice",
	"Responses",
	"Query Fan-Out",
	"AI Traffic & Crawls",
	"Opportunities",
]);

/** Names are shown as entered; page labels are translated. */
export function documentTitle(crumbs: Crumb[], t: (message: string) => string, appName = "BeatGEO"): string {
	return [...crumbs.map((crumb) => (crumb.kind ? crumb.label : t(crumb.label))), appName].join(" · ");
}

export function useBreadcrumbs(): Crumb[] {
	const matches = useMatches();
	const hash = usePublicHash();
	return crumbsFor(matches, { hash });
}

function pageCrumbs(label: string | undefined, pathname: string, hash: string): Crumb[] {
	if (label === "Opportunities" && ["search", "seo-actions", "all-actions"].includes(hash))
		return [
			{
				label: hash === "all-actions" ? "Optimize" : "SEO",
				href: hash === "all-actions" ? pathname : pathname.replace(/opportunities$/, "seo"),
			},
			{
				label: hash === "search" ? "Search diagnosis" : hash === "seo-actions" ? "SEO actions" : "Actions & retests",
				href: `${pathname}#${hash}`,
			},
		];
	if (label === "Traffic analysis")
		return [
			{ label: "GEO", href: pathname.replace(/traffic$/, "") },
			{ label, href: pathname },
		];
	if (label === "Search performance")
		return [
			{ label: "SEO", href: pathname.replace(/search-console$/, "seo") },
			{ label, href: pathname },
		];
	if (label === "SEO")
		return [
			{ label, href: pathname },
			{ label: seoPage(hash).title, href: `${pathname}#${hash}` },
		];
	return label ? [{ label, href: pathname }] : [];
}
