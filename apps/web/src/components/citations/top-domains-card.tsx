import { IconInfoCircle, IconSearch } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@workspace/ui/components/input-group";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useMemo, useState } from "react";
import { CategoryPill } from "@/components/citations/category-breakdown";
import { UnderlineTabs } from "@/components/citations/shared";
import { TrackDomainPopover } from "@/components/citations/track-domain-popover";
import type { CitationData } from "@/components/citations/types";
import { ListPagination, usePagedList } from "@/components/list-pagination";
import { SiteIcon } from "@/components/site-icon";
import { useT } from "@/lib/i18n";

export function TopDomainsCard({
	domains,
	sourceTabs,
	maxDomains,
	brandId,
	brandName,
	competitors,
	onCompetitorAdded,
}: {
	domains: CitationData["domainDistribution"];
	sourceTabs: { key: string; label: string }[];
	maxDomains: number;
	brandId?: string;
	brandName?: string;
	competitors?: CitationData["competitors"];
	onCompetitorAdded?: () => void;
}) {
	const t = useT();
	const [domainSearch, setDomainSearch] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<string>("all");

	const filteredDomains = useMemo(() => {
		let result = domains;
		if (selectedCategory !== "all") {
			result = result.filter((d) => d.category === selectedCategory);
		}
		if (domainSearch) {
			const q = domainSearch.toLowerCase();
			result = result.filter((d) => d.domain.toLowerCase().includes(q));
		}
		return result;
	}, [domains, selectedCategory, domainSearch]);

	const { page, setPage, pageItems, totalItems } = usePagedList(filteredDomains, maxDomains);
	// Share of every domain citation, not of the filtered rows, so a tab never inflates it.
	const totalCount = useMemo(() => domains.reduce((sum, d) => sum + d.count, 0), [domains]);

	return (
		<Card className="gap-4">
			<CardHeader>
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
					<div className="space-y-1 min-w-0">
						<CardTitle className="flex items-center gap-1.5">
							{t("Top Cited Domains")}
							<Tooltip>
								<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
								<TooltipContent className="max-w-xs text-sm font-normal">
									{t(
										"The most frequently cited domains across all prompt evaluations. Each domain is colored by its category (brand, competitor, etc.).",
									)}
								</TooltipContent>
							</Tooltip>
						</CardTitle>
						<CardDescription>{t("Which domains LLMs reference most when responding to your prompts")}</CardDescription>
					</div>
					<InputGroup className="h-8 shrink-0 sm:w-48">
						<InputGroupInput
							placeholder={t("Search domains...")}
							value={domainSearch}
							onChange={(e) => {
								setDomainSearch(e.target.value);
								setPage(0);
							}}
							className="h-8 text-xs"
						/>
						<InputGroupAddon className="pl-2.5">
							<IconSearch className="size-3.5" />
						</InputGroupAddon>
					</InputGroup>
				</div>
			</CardHeader>
			<Separator />
			<CardContent>
				{sourceTabs.length > 2 && (
					<div className="mb-3">
						<UnderlineTabs
							tabs={sourceTabs}
							activeKey={selectedCategory}
							onSelect={(key) => {
								setSelectedCategory(key);
								setPage(0);
							}}
						/>
					</div>
				)}
				{/* The card itself is gated on the UNFILTERED list by the parent;
				    only the rows react to the search/tab filters, so a no-match
				    search shows this message instead of hiding the section (#322). */}
				{filteredDomains.length > 0 ? (
					<>
						<div className="-mx-6 overflow-x-auto">
							<table className="w-full min-w-[34rem] text-sm">
								<thead>
									<tr className="border-b text-left text-xs text-muted-foreground">
										<th className="w-14 py-2.5 pl-6 font-normal">{t("Rank")}</th>
										<th className="py-2.5 font-normal">{t("Domain")}</th>
										<th className="py-2.5 font-normal">{t("Category")}</th>
										<th className="py-2.5 text-right font-normal">{t("Citations")}</th>
										<th className="w-28 py-2.5 pr-6 text-right font-normal">{t("Citation share")}</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{pageItems.map((domain, index) => (
										<tr key={domain.domain} className="hover:bg-muted/40">
											<td className="py-3 pl-6 text-muted-foreground tabular-nums">{page * maxDomains + index + 1}</td>
											<td className="py-3">
												<span className="flex min-w-0 items-center gap-2.5">
													<SiteIcon domain={domain.domain} size="md" />
													<span className="truncate">{domain.domain}</span>
													{domain.category === "other" && brandId && competitors && (
														<TrackDomainPopover
															domain={domain.domain}
															brandId={brandId}
															brandName={brandName}
															competitors={competitors}
															onAdded={onCompetitorAdded}
														/>
													)}
												</span>
											</td>
											<td className="py-3">
												<CategoryPill category={domain.category || "other"} />
											</td>
											<td className="py-3 text-right tabular-nums">{domain.count}</td>
											<td className="py-3 pr-6 text-right tabular-nums">
												{totalCount > 0 ? `${((domain.count / totalCount) * 100).toFixed(1)}%` : "—"}
												<ChangeDelta change={domain.changePercent} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<ListPagination page={page} pageSize={maxDomains} totalItems={totalItems} onPageChange={setPage} />
					</>
				) : (
					<p className="text-sm text-muted-foreground text-center py-4">{t("No domains match the current filters.")}</p>
				)}
			</CardContent>
		</Card>
	);
}

/** Change against the previous period, shown only when there is one to compare. */
function ChangeDelta({ change }: { change?: number | null }) {
	if (change === undefined || change === null || !Number.isFinite(change) || change === 0) return null;
	return (
		<span className={`ml-2 text-xs ${change > 0 ? "text-emerald-400" : "text-rose-400"}`}>
			{change > 0 ? "+" : ""}
			{Math.round(change)}%
		</span>
	);
}
