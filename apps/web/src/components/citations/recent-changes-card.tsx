import {
	IconArrowDownRight,
	IconExternalLink,
	IconInfoCircle,
	IconPlus,
	IconSwitchHorizontal,
} from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { formatPeriodLabel, formatUrlForDisplay, UnderlineTabs } from "@/components/citations/shared";
import type { CitationData } from "@/components/citations/types";
import { useT } from "@/lib/i18n";

type WhatsChanged = NonNullable<CitationData["whatsChanged"]>;

type ChangeType = "new_pages" | "dropped_pages" | "title" | "new_domains" | "dropped_domains";

type Change =
	| ({ type: "new_pages" } & WhatsChanged["newUrls"][number])
	| ({ type: "dropped_pages" } & WhatsChanged["droppedUrls"][number])
	| ({ type: "title" } & WhatsChanged["titleChanges"][number])
	| ({ type: "new_domains" } & WhatsChanged["newDomains"][number])
	| ({ type: "dropped_domains" } & WhatsChanged["droppedDomains"][number]);

const CHANGE_TYPE_TABS: { key: ChangeType; label: string }[] = [
	{ key: "new_pages", label: "New Pages" },
	{ key: "dropped_pages", label: "Dropped Pages" },
	{ key: "title", label: "Title Changes" },
	{ key: "new_domains", label: "New Domains" },
	{ key: "dropped_domains", label: "Dropped Domains" },
];

const CHANGE_ICONS: Record<ChangeType, ReactNode> = {
	new_pages: <IconPlus className="h-3.5 w-3.5 text-green-600" />,
	new_domains: <IconPlus className="h-3.5 w-3.5 text-green-600" />,
	dropped_pages: <IconArrowDownRight className="h-3.5 w-3.5 text-red-600" />,
	dropped_domains: <IconArrowDownRight className="h-3.5 w-3.5 text-red-600" />,
	title: <IconSwitchHorizontal className="h-3.5 w-3.5 text-amber-600" />,
};

const MAX_VISIBLE_CHANGES = 6;

function describeChange(
	change: Change,
	t: (message: string, values?: Record<string, string | number>) => string,
): { id: string; label: string; url: string; description: ReactNode } {
	switch (change.type) {
		case "new_pages":
			return {
				id: change.url,
				label: formatUrlForDisplay(change.url),
				url: change.url,
				description: t(
					change.promptCount === 1
						? "0 → {count} citations across 1 prompt"
						: "0 → {count} citations across {prompts} prompts",
					{ count: change.count, prompts: change.promptCount },
				),
			};
		case "dropped_pages":
			return {
				id: change.url,
				label: formatUrlForDisplay(change.url),
				url: change.url,
				description: t("{before} → {after} citations", { before: change.previousCount, after: change.currentCount }),
			};
		case "title":
			return {
				id: change.url,
				label: formatUrlForDisplay(change.url),
				url: change.url,
				description: (
					<>
						<span className="line-through opacity-60">{change.previousTitle}</span>
						{" → "}
						<span className="font-medium text-foreground">{change.currentTitle}</span>
					</>
				),
			};
		case "new_domains":
			return {
				id: change.domain,
				label: change.domain,
				url: `https://${change.domain}`,
				description: t(
					change.count === 1 ? "1 citation in the current period" : "{count} citations in the current period",
					{
						count: change.count,
					},
				),
			};
		case "dropped_domains":
			return {
				id: change.domain,
				label: change.domain,
				url: `https://${change.domain}`,
				description: t(
					change.previousCount === 1 ? "1 citation last period, none now" : "{count} citations last period, none now",
					{ count: change.previousCount },
				),
			};
	}
}

function ChangeRow({ icon, label, url, description }: { icon: ReactNode } & ReturnType<typeof describeChange>) {
	return (
		<a href={url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 py-2 group">
			<div className="shrink-0 mt-0.5">{icon}</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="text-sm font-medium truncate text-foreground group-hover:underline">{label}</span>
					<IconExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
				</div>
				<p className="text-xs text-muted-foreground mt-0.5">{description}</p>
			</div>
		</a>
	);
}

export function RecentChangesCard({ whatsChanged, days }: { whatsChanged: WhatsChanged; days: number }) {
	const t = useT();
	const [changeTypeFilter, setChangeTypeFilter] = useState<ChangeType>("new_pages");

	const visibleChanges = useMemo((): Change[] => {
		const byType: Record<ChangeType, Change[]> = {
			new_pages: whatsChanged.newUrls.map((u) => ({ type: "new_pages", ...u })),
			dropped_pages: whatsChanged.droppedUrls.map((u) => ({ type: "dropped_pages", ...u })),
			title: whatsChanged.titleChanges.map((u) => ({ type: "title", ...u })),
			new_domains: whatsChanged.newDomains.map((d) => ({ type: "new_domains", ...d })),
			dropped_domains: whatsChanged.droppedDomains.map((d) => ({ type: "dropped_domains", ...d })),
		};
		return byType[changeTypeFilter].slice(0, MAX_VISIBLE_CHANGES);
	}, [whatsChanged, changeTypeFilter]);

	const period = t(formatPeriodLabel(days), { days });

	return (
		<Card className="h-full flex flex-col">
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5">
					{t("Recent Changes")}
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">
							{t(
								"Compares this {period} with the {period} before it. Shows new and dropped pages, title changes, and new and dropped domains.",
								{ period },
							)}
						</TooltipContent>
					</Tooltip>
				</CardTitle>
				<CardDescription>{t("How AI citations have shifted over the past {period}", { period })}</CardDescription>
			</CardHeader>
			<Separator />
			<CardContent className="flex-1">
				<UnderlineTabs
					tabs={CHANGE_TYPE_TABS}
					activeKey={changeTypeFilter}
					onSelect={(key) => setChangeTypeFilter(key)}
				/>
				<div className="divide-y divide-border/50">
					{visibleChanges.map((change) => {
						const described = describeChange(change, t);
						return <ChangeRow key={`${change.type}-${described.id}`} icon={CHANGE_ICONS[change.type]} {...described} />;
					})}
					{visibleChanges.length === 0 && (
						<p className="text-sm text-muted-foreground text-center py-4">
							{t("No changes of this kind in this period.")}
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
