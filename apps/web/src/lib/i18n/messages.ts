import zh from "./zh.json";
export type Locale = "en" | "zh";
export type Values = Record<string, string | number>;
export const LOCALE_KEY = "beatgeo.ui-language";
export function parseLocale(value: unknown): Locale {
	return value === "zh" ? "zh" : "en";
}
export function loadLocale(): Locale {
	try {
		return parseLocale(window.localStorage.getItem(LOCALE_KEY));
	} catch {
		return "en";
	}
}
export function saveLocale(locale: Locale) {
	try {
		window.localStorage.setItem(LOCALE_KEY, locale);
	} catch {
		/* The control still works when storage is unavailable. */
	}
}
export function translate(locale: Locale, message: string, values: Values = {}): string {
	const dictionary: Record<string, string> = zh;
	const text = locale === "zh" && Object.hasOwn(dictionary, message) ? dictionary[message] : message;
	return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) =>
		Object.hasOwn(values, key) ? String(values[key]) : match,
	);
}
