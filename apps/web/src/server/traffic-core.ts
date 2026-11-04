import { brandLinkParams } from "@workspace/lib/app-urls";
import { db } from "@workspace/lib/db/db";
import { brandDataSources, brands, organization } from "@workspace/lib/db/schema";
import { analyzeCrawls, siteHostname } from "@workspace/lib/traffic/crawls";
import { fetchGa, type GaSummary, gaProperty, listGaProperties } from "@workspace/lib/traffic/ga";
import { fetchGsc, listGscProperties } from "@workspace/lib/traffic/gsc";
import { and, eq, sql } from "drizzle-orm";
import { type GaTokens, gaClient, sealGa, usableGaTokens } from "./ga-oauth-core";
import type { GoogleGrant } from "./google-oauth-core";
import { type GscTokens, sealGsc, usableGscTokens } from "./gsc-oauth-core";

function sourceWhere(brandId: string, kind: string) {
	return and(eq(brandDataSources.brandId, brandId), eq(brandDataSources.kind, kind));
}
export async function trafficBrand(brandId: string) {
	const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
	if (!brand) throw new Error("Brand not found.");
	return brand;
}
export function brandHostname(website: string) {
	return siteHostname(new URL(website.includes("://") ? website : `https://${website}`).origin);
}
export async function trafficReturnTo(brandId: string) {
	const brand = await trafficBrand(brandId);
	const [org] = await db.select().from(organization).where(eq(organization.id, brand.organizationId));
	if (!org) throw new Error("Organization not found.");
	const params = brandLinkParams(org, brand);
	return `/app/org/${encodeURIComponent(params.org)}/brand/${encodeURIComponent(params.brand)}/traffic`;
}
export async function readTraffic(brandId: string) {
	const brand = await trafficBrand(brandId);
	const rows = await db
		.select({
			kind: brandDataSources.kind,
			config: brandDataSources.config,
			snapshot: brandDataSources.snapshot,
			updatedAt: brandDataSources.updatedAt,
			connected: sql<boolean>`${brandDataSources.encryptedCredentials} is not null`,
		})
		.from(brandDataSources)
		.where(eq(brandDataSources.brandId, brandId));
	return {
		site: brandHostname(brand.website),
		gaReady: gaClient().ready,
		ga: rows.find((r) => r.kind === "ga") ?? null,
		gsc: rows.find((r) => r.kind === "gsc") ?? null,
		crawls: rows.find((r) => r.kind === "crawls") ?? null,
	};
}
type TrafficTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function withTrafficLock<T>(brandId: string, operation: (tx: TrafficTx) => Promise<T>) {
	return db.transaction(async (tx) => {
		const lock = await tx.execute<{ acquired: boolean }>(
			sql`select pg_try_advisory_xact_lock(hashtextextended(${`traffic:${brandId}`},0)) as acquired`,
		);
		if (!lock.rows[0]?.acquired) throw new Error("This connection is busy. Try again shortly.");
		return operation(tx);
	});
}
async function withGa<T>(
	brandId: string,
	operation: (tx: TrafficTx, row: typeof brandDataSources.$inferSelect) => Promise<T>,
) {
	return withTrafficLock(brandId, async (tx) => {
		const [row] = await tx.select().from(brandDataSources).where(sourceWhere(brandId, "ga"));
		if (!row?.encryptedCredentials) throw new Error("Connect Google Analytics first.");
		return operation(tx, row);
	});
}
export async function saveGaAuthorization(brandId: string, tokens: GaTokens) {
	const encryptedCredentials = await sealGa(tokens, brandId);
	const site = brandHostname((await trafficBrand(brandId)).website);
	await withTrafficLock(brandId, async (tx) =>
		tx
			.insert(brandDataSources)
			.values({ brandId, kind: "ga", encryptedCredentials, config: { site } })
			.onConflictDoUpdate({
				target: [brandDataSources.brandId, brandDataSources.kind],
				set: { encryptedCredentials, config: { site }, snapshot: null, updatedAt: new Date() },
			}),
	);
}
export async function saveGoogleAuthorization(brandId: string, grant: GoogleGrant) {
	if (!grant.ga && !grant.gsc) throw new Error("No Google data access was granted.");
	const site = brandHostname((await trafficBrand(brandId)).website);
	const values: Array<{ brandId: string; kind: "ga" | "gsc"; encryptedCredentials: string; config: { site: string } }> =
		[];
	if (grant.ga)
		values.push({ brandId, kind: "ga", encryptedCredentials: await sealGa(grant.tokens, brandId), config: { site } });
	if (grant.gsc)
		values.push({ brandId, kind: "gsc", encryptedCredentials: await sealGsc(grant.tokens, brandId), config: { site } });
	await withTrafficLock(brandId, async (tx) => {
		for (const value of values)
			await tx
				.insert(brandDataSources)
				.values(value)
				.onConflictDoUpdate({
					target: [brandDataSources.brandId, brandDataSources.kind],
					set: {
						encryptedCredentials: value.encryptedCredentials,
						config: value.config,
						snapshot: null,
						updatedAt: new Date(),
					},
				});
	});
}
export async function gaProperties(brandId: string) {
	return withGa(brandId, async (tx, row) => {
		const tokens = await usableGaTokens(row.encryptedCredentials!, brandId);
		const properties = await listGaProperties(tokens.accessToken);
		await tx
			.update(brandDataSources)
			.set({ encryptedCredentials: await sealGa(tokens, brandId) })
			.where(sourceWhere(brandId, "ga"));
		return properties;
	});
}
export async function syncGa(brandId: string, propertyId?: string, siteInput?: string) {
	return withGa(brandId, async (tx, row) => {
		const tokens = await usableGaTokens(row.encryptedCredentials!, brandId);
		const property = propertyId ? { id: gaProperty(propertyId), name: "" } : row.config?.property;
		if (!property) throw new Error("Choose a GA property first.");
		const allowed = await listGaProperties(tokens.accessToken);
		const selected = allowed.find((p) => p.id === property.id);
		if (!selected) throw new Error("This Google account cannot read the selected property.");
		const brand = await trafficBrand(brandId);
		const site = siteHostname(siteInput ?? row.config?.site ?? brandHostname(brand.website));
		const owned = [brandHostname(brand.website), ...(brand.additionalDomains ?? []).map(brandHostname)];
		if (!owned.includes(site)) throw new Error("Choose a hostname saved in this brand's settings.");
		const { summary } = await fetchGa({ token: tokens.accessToken, property: selected, site });
		await tx
			.update(brandDataSources)
			.set({
				config: { property: selected, site },
				snapshot: summary,
				encryptedCredentials: await sealGa(tokens, brandId),
				updatedAt: new Date(),
			})
			.where(sourceWhere(brandId, "ga"));
		return summary;
	});
}
export async function disconnectGa(brandId: string) {
	await withGa(brandId, async (tx) => {
		await tx.delete(brandDataSources).where(sourceWhere(brandId, "ga"));
	});
}
async function withGsc<T>(
	brandId: string,
	operation: (tx: TrafficTx, row: typeof brandDataSources.$inferSelect) => Promise<T>,
) {
	return withTrafficLock(brandId, async (tx) => {
		const [row] = await tx.select().from(brandDataSources).where(sourceWhere(brandId, "gsc"));
		if (!row?.encryptedCredentials) throw new Error("Connect Google Search Console first.");
		return operation(tx, row);
	});
}
export async function saveGscAuthorization(brandId: string, tokens: GscTokens) {
	const encryptedCredentials = await sealGsc(tokens, brandId);
	const site = brandHostname((await trafficBrand(brandId)).website);
	await withTrafficLock(brandId, async (tx) =>
		tx
			.insert(brandDataSources)
			.values({ brandId, kind: "gsc", encryptedCredentials, config: { site } })
			.onConflictDoUpdate({
				target: [brandDataSources.brandId, brandDataSources.kind],
				set: { encryptedCredentials, config: { site }, snapshot: null, updatedAt: new Date() },
			}),
	);
}
export async function gscProperties(brandId: string) {
	return withGsc(brandId, async (tx, row) => {
		const tokens = await usableGscTokens(row.encryptedCredentials!, brandId);
		const properties = await listGscProperties(tokens.accessToken);
		await tx
			.update(brandDataSources)
			.set({ encryptedCredentials: await sealGsc(tokens, brandId) })
			.where(sourceWhere(brandId, "gsc"));
		return properties;
	});
}
export async function syncGsc(brandId: string, property?: string) {
	return withGsc(brandId, async (tx, row) => {
		const tokens = await usableGscTokens(row.encryptedCredentials!, brandId);
		const selected = property ?? row.config?.property?.id;
		if (!selected) throw new Error("Choose a Search Console property first.");
		const now = new Date();
		const date = (days: number) =>
			new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)).toISOString().slice(0, 10);
		const snapshot = await fetchGsc({
			token: tokens.accessToken,
			siteUrl: selected,
			startDate: date(31),
			endDate: date(4),
		});
		await tx
			.update(brandDataSources)
			.set({
				config: { site: row.config?.site ?? "", property: { id: selected, name: selected } },
				snapshot,
				encryptedCredentials: await sealGsc(tokens, brandId),
				updatedAt: new Date(),
			})
			.where(sourceWhere(brandId, "gsc"));
		return snapshot;
	});
}
export async function disconnectGsc(brandId: string) {
	await withGsc(brandId, async (tx) => {
		await tx.delete(brandDataSources).where(sourceWhere(brandId, "gsc"));
	});
}
export async function importCrawlTraffic(
	brandId: string,
	content: string,
	format: "auto" | "combined" | "json" | "jsonl",
) {
	const site = brandHostname((await trafficBrand(brandId)).website);
	const summary = analyzeCrawls(content, { site, format });
	if (summary.observation.state === "invalid")
		throw new Error("No valid site records were parsed. Check the log format; this is not zero AI traffic.");
	// Keep bounded request evidence, while aggregate counts cover the entire import.
	summary.requests = summary.requests.slice(0, 200);
	summary.ambiguous = summary.ambiguous.slice(0, 200);
	await db
		.insert(brandDataSources)
		.values({ brandId, kind: "crawls", config: { site }, snapshot: summary })
		.onConflictDoUpdate({
			target: [brandDataSources.brandId, brandDataSources.kind],
			set: { config: { site }, snapshot: summary, updatedAt: new Date() },
		});
	return summary;
}
export type TrafficData = Awaited<ReturnType<typeof readTraffic>>;
