import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";

/** OAuth signatures cover repeated parameters and their original string values.
 * JSON search serialization would turn ba_param/resource lists into one value. */
export function parseRouterSearch(search: string): Record<string, unknown> {
	const params = new URLSearchParams(search);
	if (!params.has("sig") || !params.has("ba_param")) return defaultParseSearch(search);
	return Object.fromEntries(
		[...new Set(params.keys())].map((key) => {
			const values = params.getAll(key);
			return [key, values.length === 1 ? values[0] : values];
		}),
	);
}

export function stringifyRouterSearch(search: Record<string, unknown>): string {
	if (typeof search.sig !== "string" || !search.ba_param) return defaultStringifySearch(search);
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(search)) {
		if (value === undefined) continue;
		for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
	}
	return `?${params}`;
}
