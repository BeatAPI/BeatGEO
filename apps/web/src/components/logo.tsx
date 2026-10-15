import { useRouteContext } from "@tanstack/react-router";
import { DEFAULT_APP_ICON, DEFAULT_APP_NAME } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";
import { cn } from "@workspace/ui/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

interface LogoProps extends ComponentPropsWithoutRef<"div"> {
	iconClassName?: string;
	textClassName?: string;
}

export function Logo({ className, iconClassName, textClassName, ...props }: LogoProps) {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const branding = context.clientConfig?.branding;
	const name = branding?.name || DEFAULT_APP_NAME;
	const icon = branding?.icon && branding.icon !== DEFAULT_APP_ICON ? branding.icon : "/icons/beatgeo-mark.png";
	return (
		<div {...props} className={cn("flex items-center gap-2.5", className)}>
			<img
				src={icon}
				alt={`${name} logo`}
				width={32}
				height={32}
				className={cn("size-8 shrink-0 rounded-md bg-white object-contain", iconClassName)}
			/>
			<span className={cn("text-xl font-semibold tracking-tight group-data-[collapsible=icon]:hidden", textClassName)}>
				{name}
			</span>
		</div>
	);
}
