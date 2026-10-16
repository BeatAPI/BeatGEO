import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { getEvidenceSummaryFn } from "@/server/evidence-summary";
export function EvidenceSummary({ brandId }: { brandId: string }) {
	const t = useT();
	const query = useQuery({
		queryKey: ["evidence-summary", brandId],
		queryFn: () => getEvidenceSummaryFn({ data: { brandId } }),
		refetchInterval: 30_000,
	});
	return (
		<section className="space-y-3 rounded-xl border p-5" aria-label={t("Observed answers")}>
			<h2 className="font-semibold">{t("Observed answers · 30 days")}</h2>
			<p className="text-xs text-muted-foreground">
				{t(
					"Mention rate = answers mentioning your brand / completed answers. Share of voice = your brand mentions / your brand and competitor mentions. Failures are excluded, not counted as zero. No carried-forward samples.",
				)}
			</p>
			{query.error && <p role="alert">{t("Evidence summary unavailable.")}</p>}
			{query.data?.truncated && <p className="text-xs">{t("Showing the latest 5,000 answers only.")}</p>}
			{query.data?.groups.length === 0 && (
				<p className="text-sm text-muted-foreground">{t("No completed answers in this period.")}</p>
			)}
			<div className="overflow-x-auto">
				<table className="w-full text-left text-sm">
					<thead>
						<tr className="border-b">
							<th className="p-2">{t("Target / question type")}</th>
							<th className="p-2">{t("Mentions / answers")}</th>
							<th className="p-2">{t("Mention rate")}</th>
							<th className="p-2">{t("Share of voice")}</th>
							<th className="p-2">{t("Last observed")}</th>
						</tr>
					</thead>
					<tbody>
						{query.data?.groups.map((group) => (
							<tr key={group.key} className="border-b">
								<td className="max-w-64 break-words p-2">
									{group.model} · {group.provider}
									<span className="block text-xs text-muted-foreground">
										{group.version} · {t(group.branded ? "Branded questions" : "Non-branded questions")} ·{" "}
										{t(group.webSearch ? "Search on" : "Search off")}
									</span>
								</td>
								<td className="p-2">
									{group.mentions}/{group.answers}
								</td>
								<td className="p-2">{group.mentionRate.toFixed(1)}%</td>
								<td className="p-2">{group.shareOfVoice === null ? "—" : `${group.shareOfVoice.toFixed(1)}%`}</td>
								<td className="p-2 text-xs">
									<time dateTime={group.lastSeen}>{new Date(group.lastSeen).toLocaleString()}</time>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="text-xs text-muted-foreground">
				{t(
					"Question types use current saved tags. Provider and model versions stay separate; API replies are not consumer website visibility. Competitor changes make historical share of voice non-comparable.",
				)}
			</p>
		</section>
	);
}
