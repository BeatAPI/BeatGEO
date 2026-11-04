import { db } from "@workspace/lib/db/db";
import { brands, siteAudits } from "@workspace/lib/db/schema";
import { scanSite } from "@workspace/lib/site-audit";
import { desc, eq, sql } from "drizzle-orm";

export async function readSiteAudit(brandId: string) {
	const [latest] = await db
		.select()
		.from(siteAudits)
		.where(eq(siteAudits.brandId, brandId))
		.orderBy(desc(siteAudits.createdAt))
		.limit(1);
	return latest ?? null;
}

export async function runSiteAudit(brandId: string) {
	return db.transaction(async (tx) => {
		const lock = await tx.execute<{ acquired: boolean }>(
			sql`select pg_try_advisory_xact_lock(hashtextextended(${`site-audit:${brandId}`}, 0)) as acquired`,
		);
		if (!lock.rows[0]?.acquired) throw new Error("A website check is already running. Please wait.");
		const [brand] = await tx.select({ website: brands.website }).from(brands).where(eq(brands.id, brandId));
		if (!brand) throw new Error("Brand not found.");
		const [previous] = await tx
			.select()
			.from(siteAudits)
			.where(eq(siteAudits.brandId, brandId))
			.orderBy(desc(siteAudits.createdAt))
			.limit(1);
		if (previous && Date.now() - previous.createdAt.getTime() < 300_000) return previous;
		const result = await scanSite(brand.website);
		const [saved] = await tx.insert(siteAudits).values({ brandId, result }).returning();
		return saved;
	});
}
