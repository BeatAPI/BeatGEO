import { IconInfoCircle } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import type { ReactNode } from "react";

interface PageHeaderProps {
	title: string;
	subtitle: string;
	infoContent?: ReactNode;
	children?: ReactNode;
}

/** Title + subtitle block. No filter state, no data fetching — callers
 *  compose the filter section and content as children. */
export function PageHeader({ title, subtitle, infoContent, children }: PageHeaderProps) {
	return (
		<div className="space-y-0">
			<div className="mb-6 space-y-1.5">
				<h1 className="beat-page-title flex items-center gap-2">
					{title}
					{infoContent && (
						<Tooltip>
							<TooltipTrigger render={<IconInfoCircle className="h-4 w-4 text-muted-foreground cursor-help" />} />
							<TooltipContent className="max-w-xs text-sm font-normal">{infoContent}</TooltipContent>
						</Tooltip>
					)}
				</h1>
				<p className="text-[15px] leading-relaxed text-muted-foreground max-w-3xl">{subtitle}</p>
			</div>
			{children}
		</div>
	);
}

/** Wrapper for the filter bar + visibility bar sitting under the page title. */
export function FilterSection({ children }: { children: ReactNode }) {
	return <div className="pt-2 pb-4">{children}</div>;
}
