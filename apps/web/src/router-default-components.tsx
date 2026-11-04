import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { AlertCircle } from "lucide-react";
import { useContext, useEffect } from "react";
import { WorkspaceShellContext } from "@/contexts/workspace-shell-context";
import { useT } from "@/lib/i18n";
import FullPageCard from "./components/full-page-card";

export function DefaultPendingComponent() {
	return (
		<div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
			<div className="space-y-2">
				<Skeleton className="h-9 w-48" />
				<Skeleton className="h-5 w-80" />
			</div>
			<div className="space-y-4">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-64 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		</div>
	);
}

export function DefaultErrorComponent({ error }: ErrorComponentProps) {
	const t = useT();
	const inWorkspace = useContext(WorkspaceShellContext);
	useEffect(() => {
		console.error(error);
	}, [error]);

	if (inWorkspace) return <WorkspaceError />;
	return (
		<FullPageCard
			title={t("Something went wrong")}
			subtitle={t("An unexpected error occurred while loading this page.")}
			showBackButton={true}
		/>
	);
}

export function WorkspaceError() {
	const t = useT();
	return (
		<section role="alert" className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-16 text-center">
			<div className="rounded-xl border bg-muted/30 p-3">
				<AlertCircle className="size-5 text-muted-foreground" />
			</div>
			<div className="space-y-2">
				<h1 className="text-xl font-semibold">{t("This page couldn't load")}</h1>
				<p className="text-sm leading-6 text-muted-foreground">
					{t("Reload to try again. Your saved data and connections are unchanged.")}
				</p>
			</div>
			<Button variant="outline" onClick={() => window.location.reload()}>
				{t("Reload page")}
			</Button>
		</section>
	);
}
