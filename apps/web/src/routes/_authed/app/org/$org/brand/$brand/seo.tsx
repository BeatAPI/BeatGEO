import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { useBrandId } from "@/hooks/use-brand-id";
import { usePublicHash } from "@/hooks/use-public-hash";
import { useLocale, useT } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";
import { SEO_PAGES, seoPage } from "@/lib/seo-navigation";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/seo")({
	staticData: { crumb: "SEO" },
	beforeLoad: ({ context }) => {
		if (!context.canManageConnections) throw notFound();
	},
	head: pageHead({
		title: "SEO",
		description: "Research search demand and add reviewed questions to GEO monitoring.",
	}),
	component: SeoPage,
});

function isSeoViewMessage(data: { type?: string; view?: string } | null) {
	return data?.type === "beatgeo:seo-view" && SEO_PAGES.some((item) => item.view === data.view);
}

function SeoPage() {
	const brandId = useBrandId();
	const t = useT();
	const { locale } = useLocale();
	const initialLocale = useRef(locale).current;
	const hash = usePublicHash();
	const page = seoPage(hash);
	const frame = useRef<HTMLIFrameElement>(null);
	const navigate = useNavigate({ from: Route.fullPath });
	const syncView = useCallback(
		(event: MessageEvent) => {
			const target = frame.current?.contentWindow;
			if (!target || event.origin !== window.location.origin || event.source !== target) return;
			if (event.data?.type === "beatgeo:seo-ready") {
				target.postMessage({ type: "beatgeo:locale", locale }, window.location.origin);
				return;
			}
			if (!isSeoViewMessage(event.data)) return;
			const next = event.data.view === "home" ? "" : event.data.view;
			if (next !== hash) void navigate({ hash: next, replace: true });
		},
		[hash, navigate, locale],
	);
	useEffect(() => {
		window.addEventListener("message", syncView);
		return () => window.removeEventListener("message", syncView);
	}, [syncView]);
	useEffect(() => {
		frame.current?.contentWindow?.postMessage({ type: "beatgeo:locale", locale }, window.location.origin);
	}, [locale]);
	return (
		<div className="min-w-0">
			<iframe
				key={brandId}
				ref={frame}
				src={`/api/seo/${encodeURIComponent(brandId)}/?lang=${initialLocale}#${page.view}`}
				title={`${t("SEO")} · ${t(page.title)}`}
				className="h-[calc(100dvh-7rem)] min-h-[640px] w-full border-0 bg-background"
			/>
		</div>
	);
}
