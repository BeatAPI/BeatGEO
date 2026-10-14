export function getPageImage(slugs: string[]) {
	const segments = [...slugs, "image.png"];

	return {
		segments,
		url: `/og/docs/${segments.join("/")}`,
	};
}

export function getMarketingOgImage(opts: { title: string; description?: string; label?: string }): string {
	// The rendered card already shows the "beatgeo" logo, so a "Pricing · BeatGeo" or
	// "BeatGeo · Open Source AI Visibility" title would render the brand
	// twice. Strip the brand prefix/suffix here. The og:title meta keeps the
	// full string for crawlers — only the image gets the cleaner version.
	const cleanTitle = opts.title.replace(/^BeatGeo\s*[·\-|:]\s*/i, "").replace(/\s*[·\-|:]\s*BeatGeo$/i, "");
	const params = new URLSearchParams();
	params.set("title", cleanTitle);
	if (opts.description) params.set("description", opts.description);
	if (opts.label) params.set("label", opts.label);
	return `/og.png?${params.toString()}`;
}
