import { useLocale, useT } from "@/lib/i18n";

export function LanguageSwitch() {
	const t = useT();
	const { locale, setLocale, ready } = useLocale();
	return (
		<fieldset
			aria-label={t("Interface language")}
			className="inline-flex shrink-0 gap-0.5 rounded-lg border bg-muted/60 p-1 text-xs"
		>
			{(
				[
					["en", "EN"],
					["zh", "中文"],
				] as const
			).map(([value, label]) => (
				<button
					key={value}
					type="button"
					lang={value === "zh" ? "zh-CN" : "en"}
					aria-pressed={locale === value}
					disabled={!ready}
					onClick={() => setLocale(value)}
					className={`rounded-md px-2.5 py-1.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${locale === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
				>
					{label}
				</button>
			))}
		</fieldset>
	);
}
