import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { type AiReport, parseAiReport, reportHost } from "@workspace/lib/ai-reports";
import { db } from "@workspace/lib/db/db";
import { brandDataSources } from "@workspace/lib/db/schema";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { trafficBrand } from "./traffic-core";

const brandInput = z.object({ brandId: z.string().min(1).max(200) });
const reportWhere = (brandId: string) =>
	and(eq(brandDataSources.brandId, brandId), like(brandDataSources.kind, "ai-report:%"));
export const listAiReportsFn = createServerFn({ method: "GET" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const rows = await db
			.select({ snapshot: brandDataSources.snapshot })
			.from(brandDataSources)
			.where(reportWhere(data.brandId))
			.orderBy(desc(brandDataSources.updatedAt))
			.limit(100);
		return rows.map((r) => r.snapshot).filter((r): r is AiReport => r?.schema === "beat-geo/ai-report@1");
	});
export const importAiReportFn = createServerFn({ method: "POST" })
	.validator(
		brandInput.extend({
			source: z.enum(["bing", "google"]),
			dimension: z.enum(["page", "query", "date"]),
			site: z.string().max(2048),
			startDate: z.string().max(10),
			endDate: z.string().max(10),
			scope: z.string().min(1).max(500),
			content: z.string().max(2_000_000),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const brand = await trafficBrand(data.brandId);
		const parsed = parseAiReport(data);
		const hosts = [brand.website, ...(brand.additionalDomains ?? [])].map(reportHost);
		if (!hosts.includes(parsed.site)) throw new Error("Choose a website saved in this brand.");
		const id = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
		const report: AiReport = { ...parsed, id, importedAt: new Date().toISOString() };
		return db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ai-reports:${data.brandId}`},0))`);
			const existing = await tx
				.select({ kind: brandDataSources.kind })
				.from(brandDataSources)
				.where(reportWhere(data.brandId));
			if (existing.some((r) => r.kind === `ai-report:${id}`)) return { id, duplicate: true };
			if (existing.length >= 100) throw new Error("Report limit reached. Remove an unused import first.");
			await tx
				.insert(brandDataSources)
				.values({ brandId: data.brandId, kind: `ai-report:${id}`, config: { site: parsed.site }, snapshot: report });
			return { id, duplicate: false };
		});
	});
export const deleteAiReportFn = createServerFn({ method: "POST" })
	.validator(brandInput.extend({ id: z.string().regex(/^[a-f0-9]{64}$/) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await db
			.delete(brandDataSources)
			.where(and(eq(brandDataSources.brandId, data.brandId), eq(brandDataSources.kind, `ai-report:${data.id}`)));
		return { deleted: true };
	});
