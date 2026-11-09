import { Link } from "@tanstack/react-router";
import { useBrandParams } from "@/hooks/use-route-params";
import { useT } from "@/lib/i18n";
export function MonitoringStart() {
	const t = useT(),
		params = useBrandParams();
	return (
		<section className="m-4 rounded-xl border p-4 space-y-3">
			<h2 className="font-medium">{t("Your AI monitoring workflow")}</h2>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{(
					[
						["1. Check connections", "/app/org/$org/brand/$brand/settings/brand"],
						["2. Choose monitoring platforms", "/app/org/$org/brand/$brand/settings/llms"],
						["3. Review monitoring questions", "/app/org/$org/brand/$brand/settings/prompts"],
						["4. Collect and review answers", "/app/org/$org/brand/$brand/opportunities"],
					] as const
				).map(([label, to]) => (
					<Link
						key={to}
						to={to}
						params={params}
						hash={to.endsWith("opportunities") ? "actions" : undefined}
						className="rounded-lg bg-muted p-3 text-sm underline underline-offset-4"
					>
						{t(label)}
					</Link>
				))}
			</div>
			<p className="text-sm text-muted-foreground">
				{t(
					"Question monitoring measures completed answer samples. Platform reports record site impressions or citations. SEO research and referral visits are separate evidence.",
				)}
			</p>
			<Link
				to="/app/org/$org/brand/$brand/visibility"
				params={params}
				search={{ view: "reports" }}
				className="text-sm underline"
			>
				{t("Connect Bing or Google AI reports")}
			</Link>
		</section>
	);
}
