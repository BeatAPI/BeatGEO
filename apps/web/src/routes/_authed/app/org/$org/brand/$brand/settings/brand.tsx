import { IconInfoCircle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { brandSegment, brandSlugPrefix, normalizeSlug } from "@workspace/lib/app-urls";
import { cleanAndValidateDomain } from "@workspace/lib/citations/domain-categories";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useCallback, useState } from "react";
import { BrandSetup } from "@/components/brand-setup";
import { FormSelect } from "@/components/form-select";
import { SlugField } from "@/components/slug-field";
import { TagsInput } from "@/components/tags-input";
import { TrafficSources } from "@/components/traffic-sources";
import { useBrand } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { useOrganization, useOrganizationsChanged } from "@/hooks/use-organizations";
import { useBrandParams } from "@/hooks/use-route-params";
import { useT } from "@/lib/i18n";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { updateBrandFn } from "@/server/brands";
import { selectLocalWebsiteFn } from "@/server/local-navigation";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/brand")({
	staticData: { crumb: "Brand" },
	validateSearch: (s: Record<string, unknown>): { google?: string } => ({
		google: ["connected", "partial", "error", "denied"].includes(String(s.google)) ? String(s.google) : undefined,
	}),
	head: pageHead({ title: "Brand Settings", description: "Manage your brand name and website." }),
	component: BrandSettingsPage,
});

function BrandSettingsPage() {
	const t = useT();
	const organization = useOrganization();
	const params = useBrandParams();
	const [switchError, setSwitchError] = useState("");
	const { google } = Route.useSearch();
	return (
		<BrandSetup
			monitoringActions={
				<div className="flex flex-wrap gap-3">
					<Link
						to="/app/org/$org/brand/$brand/settings/prompts"
						params={params}
						className="rounded-lg border px-4 py-2 text-sm hover:bg-accent"
					>
						{t("Manage monitored questions")}
					</Link>
					<Link
						to="/app/org/$org/brand/$brand/settings/llms"
						params={params}
						className="rounded-lg border px-4 py-2 text-sm hover:bg-accent"
					>
						{t("Choose AI platforms")}
					</Link>
				</div>
			}
			connectedWebsite
			actions={
				<div className="flex flex-wrap items-center gap-3">
					<FormSelect
						aria-label={t("Switch website")}
						className="max-w-52"
						value={params.brand}
						onValueChange={async (value) => {
							const brand = organization.brands.find((brand) => (brand.slug || brand.id) === value);
							if (!brand) return;
							try {
								await selectLocalWebsiteFn({ data: { brandId: brand.id } });
								window.location.assign("/brand");
							} catch (error) {
								setSwitchError(error instanceof Error ? error.message : "Could not switch website.");
							}
						}}
						options={organization.brands.map((brand) => ({ value: brand.slug || brand.id, label: brand.name }))}
					/>
					<Link to="/setup" search={{ add: true }} className="text-sm underline underline-offset-4">
						{t("Add a website")}
					</Link>
					<Link
						to="/app/org/$org/brand/$brand/seo"
						params={params}
						className="rounded-lg border px-3 py-2 text-sm hover:bg-accent"
					>
						{t("Open workspace")}
					</Link>
				</div>
			}
			website={
				<>
					{switchError && (
						<p role="alert" className="text-destructive">
							{switchError}
						</p>
					)}
					<section className="rounded-xl border bg-card p-5 md:p-6">
						<BrandDetailsForm key={params.brand} />
					</section>
					<div className="space-y-3">
						<h2 className="text-lg font-semibold">Google Search Console · Analytics</h2>
						<p className="text-sm text-muted-foreground">
							{t("Optional. Connect Google to add your site's search performance and traffic data.")}
						</p>
						<TrafficSources key={params.brand} settingsOnly googleResult={google} />
					</div>
				</>
			}
		/>
	);
}

function BrandDetailsForm() {
	const t = useT();
	const { data: brand, isLoading, refetch: refetchBrand } = useBrand();
	const queryClient = useQueryClient();
	const organization = useOrganization();
	const organizationsChanged = useOrganizationsChanged();
	const brandParams = useBrandParams();
	const navigate = useNavigate();
	const writeError = useWriteErrorMessage();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [additionalDomains, setAdditionalDomains] = useState<string[]>([]);
	const [aliases, setAliases] = useState<string[]>([]);
	const [slug, setSlug] = useState("");

	// Reseed the fields when the brand changes server-side, without discarding
	// whatever is being typed in between.
	const [seededFrom, setSeededFrom] = useState<Date | null>(null);
	if (brand && brand.updatedAt !== seededFrom) {
		setSeededFrom(brand.updatedAt);
		setAdditionalDomains(brand.additionalDomains || []);
		setAliases(brand.aliases || []);
		setSlug(brandSegment(brand));
	}

	const validateDomain = useCallback((val: string): true | string => {
		const cleaned = cleanAndValidateDomain(val);
		if (!cleaned) return `"${val}" is not a valid domain`;
		return true;
	}, []);
	const handleAliasesChange = useCallback((values: string[]) => setAliases(values), []);

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div>
					<h2 className="text-lg font-semibold">{t("Website brand")}</h2>
					<p className="text-muted-foreground">{t("Loading...")}</p>
				</div>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<div>
					<h2 className="text-lg font-semibold">{t("Website brand")}</h2>
					<p className="text-destructive">{t("Brand not found")}</p>
				</div>
			</div>
		);
	}

	const currentSlug = brandSegment(brand);

	const handleSubmit = async (formData: FormData) => {
		setIsSubmitting(true);
		setError("");
		setSuccess("");

		try {
			const name = formData.get("name") as string;
			const website = formData.get("website") as string;

			const nextSlug = normalizeSlug(slug);
			const slugMoved = nextSlug !== currentSlug;
			await updateBrandFn({
				data: {
					brandId: brand.id,
					name,
					website,
					...(slugMoved && { slug: nextSlug }),
					additionalDomains,
					aliases,
				},
			});

			// Domain/alias changes affect citation categorization and mention detection
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });

			setSuccess("Brand details updated successfully!");
			await refetchBrand();
			await organizationsChanged(
				slugMoved
					? () =>
							navigate({
								to: "/app/org/$org/brand/$brand/settings/brand",
								params: { ...brandParams, brand: nextSlug },
								replace: true,
							})
					: undefined,
			);
		} catch (err) {
			setError(writeError(err, "Failed to save the brand."));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-semibold">{t("Website brand")}</h2>
				<p className="text-muted-foreground">{t("Manage your brand name and website")}</p>
			</div>

			<form action={handleSubmit} className="space-y-6">
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">{t("Brand Name")}</Label>
						<Input
							id="name"
							name="name"
							type="text"
							placeholder={t("Brand Name")}
							defaultValue={brand.name}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">{t("Enter your brand's name")}</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="website">{t("Website")}</Label>
						<Input
							id="website"
							name="website"
							type="text"
							placeholder={t("example.com")}
							defaultValue={brand.website}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">{t("Your brand's primary website")}</p>
					</div>

					<details className="space-y-4">
						<summary className="cursor-pointer text-sm text-muted-foreground">
							{t("Aliases and advanced settings")}
						</summary>
						<div className="space-y-2">
							<Label className="flex items-center gap-1.5">
								{t("Additional Domains")}
								<Tooltip>
									<TooltipTrigger
										render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />}
									/>
									<TooltipContent className="max-w-xs text-xs font-normal">
										{t(
											"Other domains your brand owns (e.g. blog.example.com, shop.example.com). Citations from these domains will be counted as your brand's citations. ",
										)}
										<strong>{t("Updates retroactively")}</strong>
										{t(" — existing citations will be reclassified immediately.")}
									</TooltipContent>
								</Tooltip>
							</Label>
							<TagsInput
								value={additionalDomains}
								onValueChange={setAdditionalDomains}
								placeholder={t("Add domain...")}
								searchPlaceholder="Add domain..."
								maxItems={10}
								normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
								onValidate={validateDomain}
							/>
						</div>

						<div className="space-y-2">
							<Label className="flex items-center gap-1.5">
								{t("Brand Aliases")}
								<Tooltip>
									<TooltipTrigger
										render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />}
									/>
									<TooltipContent className="max-w-xs text-xs font-normal">
										{t(
											"Alternative names for your brand (sub-brands, product lines, abbreviations). Used for mention detection in ",
										)}
										<strong>{t("future")}</strong>
										{t(" question runs only — does not apply retroactively to past results.")}
									</TooltipContent>
								</Tooltip>
							</Label>
							<TagsInput
								value={aliases}
								onValueChange={handleAliasesChange}
								placeholder={t("Add alias...")}
								searchPlaceholder="Add alias..."
								maxItems={10}
							/>
						</div>
					</details>
				</div>

				{error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
				{success && <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{success}</div>}

				<div className="flex gap-2">
					<Button type="submit" disabled={isSubmitting} className="cursor-pointer">
						{isSubmitting ? t("Saving...") : t("Save Changes")}
					</Button>
				</div>
			</form>
		</div>
	);
}
