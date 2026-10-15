import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LOCALE_KEY, type Locale, loadLocale, saveLocale, translate, type Values } from "./messages";

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; ready: boolean }>({
	locale: "en",
	ready: false,
	setLocale: () => {},
});

export function LocaleProvider({ children, initialLocale = "en" }: { children: ReactNode; initialLocale?: Locale }) {
	const [ready, setReady] = useState(false);
	const [locale, setCurrent] = useState<Locale>(initialLocale);
	useEffect(() => {
		setCurrent(loadLocale());
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
