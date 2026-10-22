import { CATEGORY_CONFIG, type CitationCategory } from "@workspace/lib/citations/domain-categories";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { useT } from "@/lib/i18n";

/** A category's colour as a tinted label, so every citation section names categories the same way. */
export function CategoryPill({ category }: { category: string }) {
	const t = useT();
	const config = CATEGORY_CONFIG[category as CitationCategory] ?? CATEGORY_CONFIG.other;
	return (
		<span
			className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
			style={{
				color: config.chartColor,
				backgroundColor: `${config.chartColor}1f`,
				borderColor: `${config.chartColor}40`,
			}}
		>
			{t(config.label)}
		</span>
	);
}

/** One bar for the whole period: each category's share of every citation counted. */
export function CategoryBreakdown({
	categoryCounts,
	categories,
	totalCitations,
}: {
	categoryCounts: Record<CitationCategory, number>;
	categories: CitationCategory[];
	totalCitations: number;
}) {
	const t = useT();
	const parts = categories
		.map((category) => ({ category, count: categoryCounts[category] ?? 0 }))
		.filter((part) => part.count > 0)
		.sort((a, b) => b.count - a.count);
	if (totalCitations === 0 || parts.length === 0) return null;

	return (
		<Card className="gap-4">
			<CardHeader>
				<CardTitle>{t("Citation breakdown")}</CardTitle>
				<CardDescription>{t("Share of all citations in the selected period, by source category")}</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex gap-1.5">
					{parts.map(({ category, count }) => {
						const share = (count / totalCitations) * 100;
						const color = CATEGORY_CONFIG[category].chartColor;
						return (
							<div key={category} className="min-w-12 space-y-2" style={{ flexGrow: count, flexBasis: 0 }}>
								<div
									className="flex h-9 items-center justify-center rounded-md text-sm font-medium tabular-nums text-[#0b0c0e]"
									style={{ backgroundColor: color }}
									title={`${count}`}
								>
									{share.toFixed(share < 10 ? 1 : 0)}%
								</div>
								<p className="truncate text-center text-xs text-muted-foreground">
									{t(CATEGORY_CONFIG[category].label)}
								</p>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
