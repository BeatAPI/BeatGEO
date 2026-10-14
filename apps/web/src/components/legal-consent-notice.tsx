export function LegalConsentNotice({ action }: { action: string }) {
	return (
		<p className="text-xs text-muted-foreground">
			{action} uses this BeatGeo instance. Its operator manages accounts, data and connected services.
		</p>
	);
}
