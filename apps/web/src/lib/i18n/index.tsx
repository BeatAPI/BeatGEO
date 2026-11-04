import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LocaleContext } from "./context";
import { LOCALE_KEY, type Locale, loadLocale, saveLocale, storedLocale, translate, type Values } from "./messages";

export function LocaleProvider({ children, initialLocale = "en" }: { children: ReactNode; initialLocale?: Locale }) {
	const [ready, setReady] = useState(false);
	const [locale, setCurrent] = useState<Locale>(initialLocale);
	useEffect(() => {
		// A choice saved before the cookie existed is copied into it so the next server render matches.
		const saved = storedLocale();
		if (saved) {
			saveLocale(saved);
			setCurrent(saved);
		}
		setReady(true);
		const sync = (event: StorageEvent) => {
			if (event.key === LOCALE_KEY || event.key === null) setCurrent(loadLocale());
		};
		window.addEventListener("storage", sync);
		return () => window.removeEventListener("storage", sync);
	}, []);
	const setLocale = useCallback((next: Locale) => {
		setCurrent(next);
		saveLocale(next);
	}, []);
	const value = useMemo(() => ({ locale, setLocale, ready }), [locale, setLocale, ready]);
	return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale() {
	return useContext(LocaleContext);
}
export function useT() {
	const { locale } = useLocale();
	return useCallback((message: string, values?: Values) => translate(locale, message, values), [locale]);
}
