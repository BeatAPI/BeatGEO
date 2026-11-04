import zh from "./zh.json";
export type Locale = "en" | "zh";
export type Values = Record<string, string | number>;
export const LOCALE_KEY = "beatgeo.ui-language";
// The server can't read localStorage, so the choice is mirrored in a cookie to render the first paint in it.
export const LOCALE_COOKIE = "beatgeo-ui-language";
export function parseLocale(value: unknown): Locale {
	return value === "zh" ? "zh" : "en";
}
function readCookie(): string | null {
	try {
		const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
		return match ? decodeURIComponent(match[1]) : null;
	} catch {
		return null;
	}
}
/** The saved choice, or null when the viewer has never picked one. */
export function storedLocale(): Locale | null {
	let saved: string | null = null;
	try {
		saved = window.localStorage.getItem(LOCALE_KEY);
	} catch {
		/* Fall back to the cookie when storage is blocked. */
	}
	saved ??= readCookie();
	return saved === null ? null : parseLocale(saved);
}
export function loadLocale(): Locale {
	return storedLocale() ?? "en";
}
export function saveLocale(locale: Locale) {
	try {
		window.localStorage.setItem(LOCALE_KEY, locale);
	} catch {
		/* The control still works when storage is unavailable. */
	}
	try {
		document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
	} catch {
		/* Without cookies the server renders English first, then the saved choice applies. */
	}
}
export function translate(locale: Locale, message: string, values: Values = {}): string {
	const dictionary: Record<string, string> = zh;
	const text = locale === "zh" && Object.hasOwn(dictionary, message) ? dictionary[message] : message;
	return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) =>
		Object.hasOwn(values, key) ? String(values[key]) : match,
	);
}
