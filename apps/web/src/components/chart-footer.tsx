import { Button } from "@workspace/ui/components/button";
import { CardFooter } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Download } from "lucide-react";
import { useT } from "@/lib/i18n";
import { HistoryButton } from "./history-button";

interface ChartFooterProps {
	children: React.ReactNode;
	className?: string;
}

function ChartFooter({ children, className = "" }: ChartFooterProps) {
	return (
		<>
			<Separator className="py-0 my-0" />
			<CardFooter className={`flex justify-between items-center px-3 pt-3 pb-0 ${className}`}>{children}</CardFooter>
		</>
	);
}

function DownloadButton({ onDownload, isDownloading }: { onDownload: () => void; isDownloading: boolean }) {
	const t = useT();
	return (
		<Button
			onClick={onDownload}
			disabled={isDownloading}
			size="sm"
			variant="secondary"
			className="text-xs cursor-pointer h-6 flex items-center px-2"
			title={t("Download chart as PNG")}
		>
			<Download className="size-3 mr-0.5" />
			<span className="text-xs font-normal">{isDownloading ? t("Exporting...") : t("Export (PNG)")}</span>
		</Button>
	);
}

export function ChartDownloadFooter({ onDownload, isDownloading }: { onDownload: () => void; isDownloading: boolean }) {
	return (
		<div className="print:hidden">
			<ChartFooter>
				<DownloadButton onDownload={onDownload} isDownloading={isDownloading} />
			</ChartFooter>
		</div>
	);
}

interface ChartActionsFooterProps {
	promptId?: string;
	brandId?: string;
	onDownload?: () => void;
	isDownloading?: boolean;
}

export function ChartActionsFooter({ promptId, brandId, onDownload, isDownloading = false }: ChartActionsFooterProps) {
	if (!promptId || !brandId) return null;

	return (
		<ChartFooter>
			<div className="flex flex-wrap items-center gap-2">
				<HistoryButton promptId={promptId} />
				{onDownload && <DownloadButton onDownload={onDownload} isDownloading={isDownloading} />}
			</div>
		</ChartFooter>
	);
}
