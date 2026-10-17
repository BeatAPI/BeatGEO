import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import type { CSSProperties, ReactNode } from "react";

export function AppShell({
	sidebar,
	header,
	children,
}: {
	sidebar: ReactNode;
	header: ReactNode;
	children: ReactNode;
}) {
	return (
		<SidebarProvider style={{ "--sidebar-width": "15rem" } as CSSProperties}>
			{sidebar}
			{/* Clip horizontal overflow without changing the sticky header's scroll parent. */}
			<SidebarInset className="beat-workspace overflow-clip">
				{header}
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}

export function PageContent({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-1 flex-col">
			<div className="@container/main flex flex-1 flex-col gap-2">
				<div className="flex flex-1 flex-col gap-4 p-5 md:gap-6 md:px-6 md:py-5">{children}</div>
			</div>
		</div>
	);
}
