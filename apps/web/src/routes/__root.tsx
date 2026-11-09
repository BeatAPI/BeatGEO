/// <reference types="vite/client" />

import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { BEAT_GEO_THEME_COLOR, DEFAULT_APP_ICON } from "@workspace/config/constants";
import type { MissingEnvVar } from "@workspace/config/env";
import MissingEnvPage from "@/components/missing-env-page";
import { NotFoundPage } from "@/components/not-found-page";
import queryDevtools from "@/integrations/tanstack-query/devtools";
import { rootConfigQuery } from "@/lib/config/queries";
import { LocaleProvider, useLocale } from "@/lib/i18n";
import { type Locale, loadLocale, translate } from "@/lib/i18n/messages";
import type { PublicClientConfig } from "@/server/config";
import { getRequestLocaleFn } from "@/server/locale";
import appCss from "../styles.css?url";

// clientConfig and envValidation are optional because the router renders against
// its base context — which has neither — until this route's beforeLoad resolves.
interface RouterContext {
	localNavigation?: { website: { org: string; brand: string } | null } | null;
	queryClient: QueryClient;
	clientConfig?: PublicClientConfig;
	envValidation?: {
		missing: MissingEnvVar[];
		isValid: boolean;
	};
	/** Interface language, read from the viewer's cookie so the server renders it first. */
	locale?: Locale;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	notFoundComponent: NotFoundPage,
	beforeLoad: async ({ context }) => {
		const [config, locale] = await Promise.all([
			context.queryClient.ensureQueryData(rootConfigQuery),
			typeof window === "undefined" ? getRequestLocaleFn() : loadLocale(),
		]);
		return { ...config, locale };
	},
	head: ({ match }) => {
		const branding = match.context?.clientConfig?.branding;

		const hasCustomIcon = Boolean(branding?.icon && branding.icon !== DEFAULT_APP_ICON);
		const appName = branding?.name || "BeatGEO";
		const themeColor = hasCustomIcon ? "#000000" : BEAT_GEO_THEME_COLOR;
		const appUrl = branding?.url ? branding.url.replace(/\/$/, "") : undefined;

		const locale = match.context?.locale ?? "en";
		const title = appName;
		const description = translate(locale, "Track and optimize your brand's visibility across AI models.");
		// Don't pass `title` to /api/og — the renderer already shows the brand
		// (BeatGEO logo or a custom icon + name), so a "Brand - AI Search Optimization"
		// title would render redundantly. Pages that override og:image can supply
		// a page-specific title via the query param.
		const ogImageParams = new URLSearchParams({ description });
		const ogImagePath = `/api/og?${ogImageParams.toString()}`;
		const ogImage = appUrl ? `${appUrl}${ogImagePath}` : ogImagePath;
		// og:logo is non-standard but used by some unfurlers (LinkedIn). Falls back
		// to the absolute branding icon URL when available.
		const ogLogo = (() => {
			if (!branding?.icon) return undefined;
			if (branding.icon.startsWith("http")) return branding.icon;
			return appUrl ? `${appUrl}${branding.icon}` : undefined;
		})();

		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ name: "theme-color", content: themeColor },
				{ name: "apple-mobile-web-app-title", content: appName },
				{ property: "og:site_name", content: appName },
				{ property: "og:locale", content: locale === "zh" ? "zh_CN" : "en_US" },
				{ property: "og:title", content: title },
				{ property: "og:description", content: description },
				{ property: "og:image", content: ogImage },
				{ property: "og:image:width", content: "1200" },
				{ property: "og:image:height", content: "630" },
				{ property: "og:type", content: "website" },
				...(appUrl ? [{ property: "og:url", content: appUrl }] : []),
				...(ogLogo ? [{ property: "og:logo", content: ogLogo }] : []),
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:title", content: title },
				{ name: "twitter:description", content: description },
				{ name: "twitter:image", content: ogImage },
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "manifest", href: "/api/manifest" },
				// A custom APP_ICON serves as both favicon and iOS touch icon;
				// the BeatGEO default uses the committed SVG + opaque 180×180 PNG.
				...(hasCustomIcon && branding?.icon
					? [
							{ rel: "icon", type: "image/png", href: branding.icon },
							{ rel: "apple-touch-icon", href: branding.icon },
						]
					: [
							// Icons live under /icons/ (not the root) so browsers' default
							// probes for /favicon.ico and /apple-touch-icon.png 404 when a
							// custom icon is set instead of picking up BeatGEO assets.
							{ rel: "icon", type: "image/svg+xml", href: "/icons/beatgeo-icon.svg?v=product" },
							{ rel: "icon", type: "image/png", sizes: "96x96", href: "/icons/beatgeo-icon-96.png?v=product" },
							{ rel: "icon", type: "image/x-icon", href: "/icons/favicon.ico?v=product" },
							{ rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png?v=product" },
						]),
			],
		};
	},
	component: RootComponent,
});

function RootComponent() {
	const { locale } = Route.useRouteContext();
	return (
		<LocaleProvider initialLocale={locale}>
			<RootContent />
		</LocaleProvider>
	);
}

function RootContent() {
	const { locale } = useLocale();
	const { envValidation } = Route.useRouteContext();

	// Only swap in the missing-env page once we actually know env is invalid —
	// envValidation is absent while a navigation's root beforeLoad is in flight.
	if (envValidation && !envValidation.isValid) {
		return (
			<html lang={locale === "zh" ? "zh-CN" : "en"} className="dark">
				<head>
					<HeadContent />
				</head>
				<body className="font-sans antialiased">
					<MissingEnvPage missing={envValidation.missing} />
					<Scripts />
				</body>
			</html>
		);
	}

	return (
		<html lang={locale === "zh" ? "zh-CN" : "en"} className="dark">
			<head>
				<HeadContent />
			</head>
			<body className="font-sans antialiased">
				<Outlet />
				{import.meta.env.DEV && import.meta.env.VITE_DEVTOOLS === "true" && (
					<TanStackDevtools plugins={[queryDevtools]} />
				)}
				<Scripts />
			</body>
		</html>
	);
}
