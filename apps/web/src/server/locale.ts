import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { LOCALE_COOKIE, parseLocale } from "@/lib/i18n/messages";

export const getRequestLocaleFn = createServerFn({ method: "GET" }).handler(async () =>
	parseLocale(getCookie(LOCALE_COOKIE)),
);
