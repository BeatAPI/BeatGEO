import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { reportHost, validateConnectedReport } from "@workspace/lib/ai-reports";
import { db } from "@workspace/lib/db/db";
import { brandDataSources } from "@workspace/lib/db/schema";
import { and, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { trafficBrand } from "./traffic-core";

const input = z.object({
	brandId: z.string().min(1).max(200),
	source: z.enum(["bing", "google"]),
	property: z.string().min(1).max(2048),
});
const resultSchema = z.object({
	ready: z.literal(true),
	property: z.string(),
	url: z.string().url(),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
	coverage: z.string().max(500).optional(),
	total: z.number().int().nonnegative().optional(),
	tables: z
		.array(
			z.object({
				dimension: z.enum(["page", "query", "date"]),
				rows: z
					.array(z.object({ key: z.string().max(2048), value: z.number().int().nonnegative().nullable() }))
					.max(2000),
			}),
		)
		.max(3)
		.optional(),
});
const where = (brandId: string, source: string) =>
	and(eq(brandDataSources.brandId, brandId), eq(brandDataSources.kind, `ai-connection:${source}`));

export async function reportBrowserRequest(data: { source: string; property: string; action: string }) {
	const base = new URL(process.env.BROWSER_RUNNER_URL || "http://127.0.0.1:4318");
	if (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname))
		throw new Error("The browser service must run on this computer.");
	let response: Response;
	try {
		response = await fetch(new URL("/api/reports", base), {
			method: "POST",
			redirect: "error",
			signal: AbortSignal.timeout(240_000),
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.BROWSER_RUNNER_TOKEN || ""}`,
			},
			body: JSON.stringify(data),
		});
	} catch {
		throw new Error("Browser service unavailable. Start BeatGEO locally, then check again.");
	}
	if (response.status === 404) throw new Error("Restart BeatGEO to enable report connections.");
	if (response.status === 409) throw new Error("The browser is busy. Retry after the current operation finishes.");
	const result = await response.json();
	if (!response.ok)
		throw new Error(
			"The AI report could not be read. Check website access, sign-in and report availability, then retry.",
		);
	return resultSchema.parse(result);
}

export const getAiConnectionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string().min(1) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const brand = await trafficBrand(data.brandId);
		const rows = await db
			.select({ kind: brandDataSources.kind, config: brandDataSources.config })
			.from(brandDataSources)
			.where(and(eq(brandDataSources.brandId, data.brandId), like(brandDataSources.kind, "ai-connection:%")));
		const websites = [
			...new Set(
				[brand.website, ...(brand.additionalDomains ?? [])].map(
					(site) => new URL(site.includes("://") ? site : `https://${site}`).href,
				),
			),
		];
		return {
			websites,
			connections: rows.map((row) => ({ source: row.kind.slice("ai-connection:".length), ...row.config?.aiReport })),
		};
	});

export const readAiConnectionFn = createServerFn({ method: "POST" })
	.validator(input.extend({ action: z.enum(["connect", "sync"]) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const brand = await trafficBrand(data.brandId);
		const allowed = [brand.website, ...(brand.additionalDomains ?? [])].map(reportHost);
		if (!allowed.includes(reportHost(data.property))) throw new Error("Choose a website saved in this brand.");
		return db.transaction(async (tx) => {
			const lock = await tx.execute<{ acquired: boolean }>(
				sql`select pg_try_advisory_xact_lock(hashtextextended(${`ai-reports:${data.brandId}`},0)) as acquired`,
			);
			if (!lock.rows[0]?.acquired) throw new Error("This connection is busy. Try again shortly.");
			const [saved] = await tx.select().from(brandDataSources).where(where(data.brandId, data.source));
			let config: Record<string, string | undefined> = saved?.config?.aiReport ?? {};
			try {
				const result = await reportBrowserRequest(data);
				if (result.property !== data.property) throw new Error("Report website mismatch.");
				const now = new Date().toISOString();
				config = {
					property: data.property,
					checkedAt: now,
					state: "ready",
					error: "",
					method: "browser",
					lastSyncedAt: config.property === data.property ? config.lastSyncedAt : undefined,
				};
				if (data.action === "sync") {
					await saveReports(tx, data, result, now);
					config.lastSyncedAt = now;
				}
			} catch (error) {
				config = {
					...config,
					state: "needs-attention",
					attemptedProperty: data.property,
					checkedAt: new Date().toISOString(),
					error: error instanceof Error ? error.message : "Could not sync AI report.",
				};
			}
			await tx
				.insert(brandDataSources)
				.values({
					brandId: data.brandId,
					kind: `ai-connection:${data.source}`,
					config: { site: reportHost(data.property), aiReport: config },
				})
				.onConflictDoUpdate({
					target: [brandDataSources.brandId, brandDataSources.kind],
					set: { config: { site: reportHost(data.property), aiReport: config }, updatedAt: new Date() },
				});
			return { ok: config.state === "ready", error: connectionError(config.error) };
		});
	});

export const disconnectAiConnectionFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string().min(1), source: z.enum(["bing", "google"]) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		await db.transaction(async (tx) => {
			const lock = await tx.execute<{ acquired: boolean }>(
				sql`select pg_try_advisory_xact_lock(hashtextextended(${`ai-reports:${data.brandId}`},0)) as acquired`,
			);
			if (!lock.rows[0]?.acquired) throw new Error("This connection is busy. Try again shortly.");
			await tx.delete(brandDataSources).where(where(data.brandId, data.source));
		});
		return { disconnected: true };
	});

type ReportTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function saveReports(
	tx: ReportTx,
	data: z.infer<typeof input>,
	result: z.infer<typeof resultSchema>,
	now: string,
) {
	const { startDate, endDate, tables } = result;
	if (!tables?.length || !startDate || !endDate) throw new Error("AI report unavailable or its format has changed.");
	const reports = tables.map((table) =>
		validateConnectedReport({
			...table,
			source: data.source,
			site: reportHost(data.property),
			property: data.property,
			startDate,
			endDate,
			method: "browser",
			scope: "Official AI report · default 3-month window · all filters",
			coverage: result.coverage,
			total: result.total,
		}),
	);
	for (const report of reports) {
		const id = createHash("sha256").update(JSON.stringify(report)).digest("hex");
		await tx
			.insert(brandDataSources)
			.values({
				brandId: data.brandId,
				kind: `ai-report:${id}`,
				config: { site: report.site },
				snapshot: { ...report, id, importedAt: now },
			})
			.onConflictDoUpdate({
				target: [brandDataSources.brandId, brandDataSources.kind],
				set: { updatedAt: new Date(), snapshot: { ...report, id, importedAt: now } },
			});
	}
}

function connectionError(value: unknown) {
	return typeof value === "string" ? value : "";
}
