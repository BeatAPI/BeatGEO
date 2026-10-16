/**
 * Longest match wins, so a brand's Prompts doesn't lose to its Settings. An
 * `exact` entry lights only on its own page — a brand's Overview and an
 * organization's Organization are prefixes of every sibling, and matching the
 * prefix would light them everywhere below.
 */
export function activeNavHref(
	entries: Array<{ href: string; exact?: boolean; aliases?: string[] }>,
	pathname: string,
): string {
	let active = "";
	let longest = -1;
	for (const { href, exact, aliases = [] } of entries) {
		for (const candidate of [href, ...aliases]) {
			const onIt = exact ? pathname === candidate : pathname === candidate || pathname.startsWith(`${candidate}/`);
			if (onIt && candidate.length >= longest) {
				active = href;
				longest = candidate.length;
			}
		}
	}
	return active;
}
