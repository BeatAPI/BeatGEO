import { createContext } from "react";
import type { Locale } from "./messages";

// Keep the context identity independent of hot-reloaded providers and translations.
export const LocaleContext = createContext<{
	locale: Locale;
	setLocale: (locale: Locale) => void;
	ready: boolean;
}>({ locale: "en", setLocale: () => {}, ready: false });
