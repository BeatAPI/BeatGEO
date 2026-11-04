import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { getAuthSession, listUserOrganizations, requireBrandSession } from "@/lib/auth/helpers";
import { summarizeOrganizations } from "@/lib/organizations/summarize";
import { firstWebsite } from "@/lib/workspace-entry";

const SELECTED_WEBSITE = "beatgeo-website";

export const getLocalNavigationFn = createServerFn({ method: "GET" }).handler(async () => {
	const session = await getAuthSession();
	if (!session) return { website: null };
	const organizations = await summarizeOrganizations(await listUserOrganizations(session.user.id));
	const selected = getCookie(SELECTED_WEBSITE);
	for (const organization of organizations) {
		const brand = organization.brands.find((brand) => brand.id === selected && brand.website.trim());
		if (brand) return { website: { org: organization.slug, brand: brand.slug || brand.id } };
	}
	return { website: firstWebsite(organizations) };
});

export const selectLocalWebsiteFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string().min(1).max(200) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		setCookie(SELECTED_WEBSITE, data.brandId, {
			httpOnly: true,
			sameSite: "strict",
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
		});
	});
