import type { MissingEnvVar } from "@workspace/config/env";
import FullPageCard from "@/components/full-page-card";
import { useT } from "@/lib/i18n";

interface MissingEnvPageProps {
	missing: MissingEnvVar[];
}

export default function MissingEnvPage({ missing }: MissingEnvPageProps) {
	const t = useT();
	const sortedMissing = [...missing].sort((a, b) => a.label.localeCompare(b.label));

	return (
		<FullPageCard title={t("Missing environment configuration")} className="max-w-2xl">
			<div className="space-y-4 text-sm">
				<p>{t("Set these via the CLI.")}</p>
				<ul className="space-y-3 rounded-md border bg-background p-4">
					{sortedMissing.map((item) => (
						<li key={item.id} className="flex flex-col gap-1">
							<span className="font-mono text-xs text-foreground">{item.label}</span>
							{item.description ? <span className="text-muted-foreground">{item.description}</span> : null}
						</li>
					))}
				</ul>
			</div>
		</FullPageCard>
	);
}
