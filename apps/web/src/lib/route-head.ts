import { crumbsFor, documentTitle } from "@/lib/breadcrumbs";
import { translate } from "@/lib/i18n/messages";

interface RouteMatchContext {
	context?: {
		clientConfig?: {
			branding?: { name?: string; url?: string; icon?: string };
		};
		locale?: "en" | "zh";
	};
}

export function getAppName(match: RouteMatchContext): string {
	return match.context?.clientConfig?.branding?.name || "BeatGEO";
}

export function buildTitle(pageName: string, opts: { appName: string; subject?: string }): string {
	return [opts.subject, pageName, opts.appName].filter(Boolean).join(" · ");
}

interface HeadArgs {
	match: RouteMatchContext & { staticData?: { crumb?: string } };
	matches: Array<{ routeId: string; pathname: string; staticData?: { crumb?: string }; loaderData?: unknown }>;
}

export function pageHead(page: { title?: string; description?: string }) {
	return ({ match, matches }: HeadArgs) => {
		const locale = match.context?.locale ?? "en";
		const t = (message: string) => translate(locale, message);
		const crumbs = crumbsFor(matches, { hash: "" });
		const appName = getAppName(match);
		const fallback = page.title ? [{ label: page.title, href: "" }] : [];
		return {
			meta: [
				{ title: documentTitle(crumbs.length > 0 ? crumbs : fallback, t, appName) },
				...(page.description ? [{ name: "description", content: t(page.description) }] : []),
			],
		};
	};
}
