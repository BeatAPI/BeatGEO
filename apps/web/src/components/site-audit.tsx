import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { getSiteAuditFn, runSiteAuditFn } from "@/server/site-audit-fn";

const labels: Record<string, string> = {
	page: "Homepage",
	title: "Page title",
	description: "Description",
	heading: "Main heading",
	indexing: "Indexing directives",
	canonical: "Canonical URL",
	structured_data: "Structured data",
	robots: "Crawler rules",
	sitemap: "Sitemap",
};
export function SiteAudit({ brandId }: { brandId: string }) {
	const t = useT();
	const client = useQueryClient();
	const queryKey = ["site-audit", brandId];
	const query = useQuery({ queryKey, queryFn: () => getSiteAuditFn({ data: { brandId } }) });
	const mutation = useMutation({
		mutationFn: () => runSiteAuditFn({ data: { brandId } }),
		onSuccess: (data) => client.setQueryData(queryKey, data),
	});
	return (
		<section className="space-y-5" aria-label={t("Website check")}>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-semibold">{t("Website check")}</h2>
				<button
					type="button"
					className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
					disabled={mutation.isPending}
					onClick={() => mutation.mutate()}
				>
					{t(mutation.isPending ? "Checking website…" : "Check website")}
				</button>
			</div>
			<p className="text-sm text-muted-foreground">
				{t(
					"Checks public HTML, robots.txt and sitemap.xml. No API credits. Results are cached for 5 minutes. This is a technical check, not an AI visibility score.",
				)}
			</p>
			{(query.error || mutation.error) && (
				<p role="alert">{t(mutation.error?.message || "Website check unavailable.")}</p>
			)}
			{query.data && (
				<>
					<p className="text-sm">
						{t("{passed} passed · {evaluated} checked · {unknown} unknown", {
							passed: query.data.result.passed,
							evaluated: query.data.result.evaluated,
							unknown: query.data.result.total - query.data.result.evaluated,
						})}{" "}
						·{" "}
						<time dateTime={query.data.result.checkedAt}>{new Date(query.data.result.checkedAt).toLocaleString()}</time>
					</p>
					<div className="divide-y">
						{query.data.result.checks.map((check) => (
							<details key={check.id} className="py-3">
								<summary className="flex cursor-pointer justify-between gap-4 text-sm">
									<span>{t(labels[check.id] || check.id)}</span>
									<span>
										{t(check.state === "pass" ? "Passed" : check.state === "issue" ? "Needs improvement" : "Unknown")}
									</span>
								</summary>
								<p className="mt-2 break-words text-xs text-muted-foreground">{check.evidence}</p>
								<p className="mt-2 text-sm">{t(check.suggestion)}</p>
							</details>
						))}
					</div>
				</>
			)}
		</section>
	);
}
