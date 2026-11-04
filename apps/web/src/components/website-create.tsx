import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { useOrganizationsChanged } from "@/hooks/use-organizations";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { useT } from "@/lib/i18n";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { createBrandInOrgFn } from "@/server/brands";
import { selectLocalWebsiteFn } from "@/server/local-navigation";
import { listOrganizationsFn } from "@/server/organizations";

export function WebsiteCreate({ organization }: { organization: OrganizationSummary }) {
	const t = useT();
	const changed = useOrganizationsChanged();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	async function save(form: FormData) {
		const validation = validateWebsiteUrl(String(form.get("website") ?? ""));
		if (!validation.isValid) {
			setError(validation.error);
			return;
		}
		setBusy(true);
		setError("");
		try {
			const { brandSlug } = await createBrandInOrgFn({
				data: {
					organizationId: organization.id,
					brandName: String(form.get("name") ?? "").trim(),
					website: validation.formattedUrl,
				},
			});
			const view = await listOrganizationsFn();
			const created = view.organizations
				.find((item) => item.id === organization.id)
				?.brands.find((brand) => (brand.slug || brand.id) === brandSlug);
			if (!created) throw new Error("Website saved. Refresh to open it.");
			await selectLocalWebsiteFn({ data: { brandId: created.id } });
			await changed(() => {
				window.location.assign("/brand");
				return Promise.resolve();
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not create the brand.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="space-y-6 rounded-xl border bg-card p-6">
			<div className="space-y-2">
				<h2 className="text-lg font-semibold">{t("Website brand")}</h2>
				<p className="text-sm leading-6 text-muted-foreground">
					{t("Add your website once. Future visits open your workspace directly; the other connections are optional.")}
				</p>
			</div>
			<form action={save} className="space-y-5">
				<div className="space-y-2">
					<Label htmlFor="new-brand-name">{t("Brand Name")}</Label>
					<Input id="new-brand-name" name="name" required maxLength={200} disabled={busy} placeholder="BeatAPI" />
				</div>
				<div className="space-y-2">
					<Label htmlFor="new-brand-website">{t("Website")}</Label>
					<Input id="new-brand-website" name="website" required disabled={busy} placeholder="example.com" />
				</div>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{t(error)}
					</p>
				)}
				<Button type="submit" disabled={busy}>
					{t(busy ? "Creating..." : "Save website")}
				</Button>
			</form>
			<p className="text-xs text-muted-foreground">
				{t("You can connect Search Console and Analytics after saving your website.")}
			</p>
		</section>
	);
}
