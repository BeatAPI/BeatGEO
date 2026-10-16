import type { Icon } from "@tabler/icons-react";
import { Link, type LinkProps, useLocation, useRouter } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { useT } from "@/lib/i18n";
import { activeNavHref } from "@/lib/nav-active";

export interface NavItem {
	title: string;
	link: LinkProps;
	icon?: Icon;
	exact?: boolean;
	matchLinks?: LinkProps[];
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
	const t = useT();
	const router = useRouter();
	const { setOpenMobile } = useSidebar();
	const { pathname } = useLocation();

	const resolved = groups.map((group) => ({
		label: group.label,
		items: group.items.map((item) => ({ item, href: router.buildLocation(item.link).pathname })),
	}));

	const activeHref = activeNavHref(
		resolved.flatMap((group) =>
			group.items.map(({ item, href }) => ({
				href,
				exact: item.exact,
				aliases: item.matchLinks?.map((link) => router.buildLocation(link).pathname),
			})),
		),
		pathname,
	);

	return (
		<>
			{resolved.map((group) => (
				<SidebarGroup key={group.label}>
					<SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>
					<SidebarMenu>
						{group.items.map(({ item, href }) => (
							<SidebarMenuItem key={href}>
								<SidebarMenuButton
									render={<Link {...item.link} onClick={() => setOpenMobile(false)} />}
									tooltip={t(item.title)}
									className="text-[13px] font-normal"
									isActive={href === activeHref}
								>
									{item.icon && <item.icon />}
									<span>{t(item.title)}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			))}
		</>
	);
}
