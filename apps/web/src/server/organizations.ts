import { createServerFn } from "@tanstack/react-start";
import { getAuthSession, listUserOrganizations } from "@/lib/auth/helpers";
import { summarizeOrganizations } from "@/lib/organizations/summarize";
import type { OrganizationsView } from "@/lib/organizations/types";

export type { OrganizationsView } from "@/lib/organizations/types";

export const listOrganizationsFn = createServerFn({ method: "GET" }).handler(async (): Promise<OrganizationsView> => {
	const session = await getAuthSession();
	if (!session) return { signedIn: false, organizations: [] };
	return { signedIn: true, organizations: await summarizeOrganizations(await listUserOrganizations(session.user.id)) };
});
