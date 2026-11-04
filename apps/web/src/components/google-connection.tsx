import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { useT } from "@/lib/i18n";
import type { TrafficData } from "@/server/traffic-core";

export function GoogleConnection({
	data,
	busy,
	onConnect,
	partial,
}: {
	data: TrafficData;
	busy: boolean;
	onConnect: () => void;
	partial: boolean;
}) {
	const t = useT();
	const connected = data.ga?.connected || data.gsc?.connected;
	return (
		<Card className="mb-6">
			<CardHeader>
				<CardTitle>{t("Connect Google")}</CardTitle>
				<p className="text-sm text-muted-foreground">
					{t(
						"Authorize Search Console and Analytics together, then choose the properties for this website. Read-only access; no tracking code to install.",
					)}
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<Button disabled={busy || !data.gaReady} onClick={onConnect}>
					{t(connected ? "Reconnect Google" : "Continue with Google")}
				</Button>
				{!data.gaReady && (
					<p role="status" className="text-sm text-muted-foreground">
						{t("Google connection is not available in this build yet. You can continue using SEO and GEO without it.")}
					</p>
				)}
				{partial && (
					<p role="status" className="text-sm text-muted-foreground">
						{t(
							"Only some Google permissions were granted. Use the connected service below, or reconnect to allow both.",
						)}
					</p>
				)}
				<ol className="grid gap-3 text-sm sm:grid-cols-3">
					<li>
						{t("1. Authorize Google")} · {t(connected ? "Connected" : "Not connected")}
					</li>
					<li>
						{t("2. Choose Search Console property")} · {t(data.gsc?.config?.property ? "Selected" : "Not selected")}
					</li>
					<li>
						{t("3. Choose Analytics property")} · {t(data.ga?.config?.property ? "Selected" : "Not selected")}
					</li>
				</ol>
				<p className="text-xs text-muted-foreground">
					{t(
						"Only properties this Google account can access are listed. Reconnecting clears the selected properties and saved Google snapshots so you can choose the correct website again.",
					)}
				</p>
			</CardContent>
		</Card>
	);
}
