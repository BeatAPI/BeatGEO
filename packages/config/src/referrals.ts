/**
 * Links from the product and the CLI back to our own sites.
 *
 * Each one carries a `ref` naming the surface it was clicked from, so the
 * marketing site can tell a self-hosted operator who arrived from the sign-in
 * page apart from one who arrived from `beatgeo init` — the two want different
 * things and convert at very different rates.
 */

export const MARKETING_SITE_URL = "https://github.com/BeatAPI/BeatGeo";
export const CLOUD_APP_URL = "https://github.com/BeatAPI/BeatGeo";
/** The read-only instance anyone can poke at without an account. */

/**
 * Where a link back to us was clicked. A closed set rather than free-form
 * strings: these end up in analytics, where a typo is indistinguishable from a
 * real source.
 */
export type ReferralSource =
	| "cli"
	| "self-hosted-signin"
	| "self-hosted-signup"
	| "cloud-signin"
	| "cloud-signup"
	| "marketing-cta"
	| "marketing-nav"
	| "marketing-hero"
	| "marketing-demo-frame"
	| "marketing-closing"
	| "marketing-pricing-closing"
	| "marketing-aeo-for-hero"
	| "marketing-aeo-for-closing"
	| "marketing-profound-users-hero"
	| "marketing-profound-users-closing"
	| "marketing-page-cta"
	| "marketing-vision"
	| "marketing-about"
	| "marketing-support"
	| "demo-chat"
	| "marketing-plan-starter"
	| "marketing-plan-basic"
	| "marketing-plan-pro"
	| "marketing-plan-business"
	| "marketing-pricing-starter"
	| "marketing-pricing-basic"
	| "marketing-pricing-pro"
	| "marketing-pricing-business";

function projectLink(ref: ReferralSource, anchor = "readme"): string {
	const url = new URL("https://github.com/BeatAPI/BeatGeo");
	url.searchParams.set("ref", ref);
	url.hash = anchor;
	return url.toString();
}
export function marketingUrl(_path: string, ref: ReferralSource): string {
	return projectLink(ref);
}
export function cloudAppUrl(ref: ReferralSource): string {
	return projectLink(ref, "quick-start");
}
export function cloudSignupUrl(ref: ReferralSource): string {
	return projectLink(ref, "quick-start");
}
export function cloudPricingUrl(ref: ReferralSource): string {
	return projectLink(ref, "mvp-status");
}
export function bookDemoUrl(ref: ReferralSource): string {
	return projectLink(ref, "product-flow");
}
export function demoSiteUrl(ref: ReferralSource): string {
	return projectLink(ref, "product-flow");
}
