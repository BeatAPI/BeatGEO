import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { brandLinkParams } from "@workspace/lib/app-urls";
import { validateBrandFilterSearch } from "@/hooks/use-list-filters";
import { useT } from "@/lib/i18n";
import { INSIGHT_PAGES } from "@/lib/insight-navigation";
import { activeNavHref } from "@/lib/nav-active";
import type { ShellScope } from "@/lib/shell-scope";

export function AnswerInsightNav({ section, organization, brand }: ShellScope) {
	const t = useT();
	const router = useRouter();
	const { pathname } = useLocation();
	if (section !== "brand" || !organization || !brand?.onboarded) return null;
	const params = brandLinkParams(organization, brand);
	const pages = INSIGHT_PAGES.map((page) => ({
		...page,
		href: router.buildLocation({ to: page.to, params }).pathname,
	}));
	const active = activeNavHref(pages, pathname);
	if (!active) return null;
	return (
		<nav
			aria-label={t("Answer Engine Insights")}
			className="beat-insight-nav flex shrink-0 overflow-x-auto border-b px-5 md:px-6"
		>
			{pages.map((page) => (
				<Link
					key={page.to}
					to={page.to}
					params={params}
					search={(previous) => validateBrandFilterSearch(previous)}
					aria-current={page.href === active ? "page" : undefined}
					className="shrink-0 border-b-2 border-transparent px-2 py-3 text-[13px] text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
				>
					{t(page.title)}
				</Link>
			))}
		</nav>
	);
}
