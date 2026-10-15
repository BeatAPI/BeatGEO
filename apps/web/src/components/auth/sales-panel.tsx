import type { ReferralSource } from "@workspace/config/referrals";

type SalesPanelVariant = "local" | "cloud" | "self-hosted";
export function SalesPanel(_props: { variant: SalesPanelVariant; source: ReferralSource }) {
	return (
		<section className="space-y-5 p-8">
			<h2 className="text-3xl font-semibold">BeatGEO</h2>
			<p className="text-muted-foreground">Understand how AI answers mention and cite your brand.</p>
			<ul className="space-y-3">
				<li>Inspect original answers and citations.</li>
				<li>Compare brands and track questions over time.</li>
				<li>Keep failed collections separate from missing mentions.</li>
			</ul>
			<a className="underline" href="https://github.com/BeatAPI/BeatGEO">
				Open-source project and setup guide
			</a>
		</section>
	);
}
export function SalesFooterLinks(_props: { source: ReferralSource }) {
	return (
		<a className="text-sm text-muted-foreground underline" href="https://github.com/BeatAPI/BeatGEO">
			BeatGEO documentation
		</a>
	);
}
