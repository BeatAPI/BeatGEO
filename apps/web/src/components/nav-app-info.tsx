import { IconBrandGithub } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useT } from "@/lib/i18n";

export function NavAppInfo() {
	const t = useT();

	const linkClass =
		"text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors";

	return (
		<div className="mx-2 mt-1 flex items-center gap-2 border-t border-sidebar-border/60 px-1 pt-2">
			<span className="flex-1 text-xs font-medium text-muted-foreground">{t("Local workspace")}</span>
			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger
						render={
							<a
								href="https://github.com/BeatAPI/BeatGEO"
								target="_blank"
								rel="noreferrer"
								className={linkClass}
								aria-label={t("View on GitHub")}
							/>
						}
					>
						<IconBrandGithub className="size-4" />
					</TooltipTrigger>
					<TooltipContent>{t("View on GitHub")}</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
