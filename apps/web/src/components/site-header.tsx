import { Link } from "@tanstack/react-router";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Separator } from "@workspace/ui/components/separator";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { cn } from "@workspace/ui/lib/utils";
import { Fragment, useEffect } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { type Crumb, documentTitle, useBreadcrumbs } from "@/lib/breadcrumbs";
import { useT } from "@/lib/i18n";

// `transition-none` overrides the link's own `transition-colors`: the rail and
// the menu take their hover at once, and a crumb easing into one reads as lag.
const CRUMB = "flex min-w-0 items-center rounded-md px-2 py-1.5 leading-5 transition-none";

function CrumbLabel({ crumb }: { crumb: Crumb }) {
	const t = useT();
	if (!crumb.kind) return <>{t(crumb.label)}</>;

	return (
		<span className="truncate font-medium" title={crumb.label}>
			<span className="sr-only">{t(crumb.kind)}: </span>
			{crumb.label}
		</span>
	);
}

export function SiteHeader() {
	const t = useT();
	const crumbs = useBreadcrumbs();
	const pageTitle = documentTitle(crumbs, t);
	useEffect(() => {
		document.title = pageTitle;
	}, [pageTitle]);

	return (
		<header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14">
			<div className="flex min-w-0 w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger aria-label={t("Toggle sidebar")} className="-ml-1 cursor-pointer" />
				<Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
				<Breadcrumb className="-ml-2 min-w-0 flex-1">
					<BreadcrumbList className="flex-nowrap gap-1 overflow-hidden sm:gap-2">
						{crumbs.map((crumb, index) => {
							const isLast = index === crumbs.length - 1;
							return (
								<Fragment key={`${crumb.href}:${crumb.label}`}>
									{index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
									<BreadcrumbItem className={isLast ? "min-w-0 truncate" : "hidden min-w-0 max-w-48 shrink md:flex"}>
										{isLast ? (
											<BreadcrumbPage className={cn(CRUMB, "truncate")}>
												<CrumbLabel crumb={crumb} />
											</BreadcrumbPage>
										) : (
											<BreadcrumbLink
												className={cn(CRUMB, "hover:bg-accent hover:text-accent-foreground")}
												render={<Link to={crumb.href} />}
											>
												<CrumbLabel crumb={crumb} />
											</BreadcrumbLink>
										)}
									</BreadcrumbItem>
								</Fragment>
							);
						})}
					</BreadcrumbList>
				</Breadcrumb>
				<div className="ml-auto flex shrink-0 items-center gap-2">
					<LanguageSwitch />
				</div>
			</div>
		</header>
	);
}
