import { useT } from "@/lib/i18n";
export function LegalConsentNotice({ action }: { action: string }) {
	const t = useT();
	return (
		<p className="text-xs text-muted-foreground">
			{t(action)}
			{t(" uses this BeatGEO instance. Its operator manages accounts, data and connected services.")}
		</p>
	);
}
