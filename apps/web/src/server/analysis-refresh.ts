import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { db } from "@workspace/lib/db/db";
import { type brands, workspaceCommands } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { readSavedSeoEvidence } from "../../../../tools/seo-geo/src/saved-evidence.mjs";
import { captureAnalysisPages, saveAnalysisEvidence } from "./analysis-core";
import { readTraffic, syncGa, syncGsc } from "./traffic-core";
import { workspaceCommand } from "./workspace-command";

export const refreshPlan = z
	.object({
		source: z.enum(["gsc", "ga", "pages", "saved_seo"]),
		pages: z.array(z.url().max(2048)).max(3).default([]),
		runId: z.uuid().optional(),
	})
	.strict();
export type RefreshPlan = z.infer<typeof refreshPlan>;
export async function previewAnalysisRefresh(brandId: string, plan: RefreshPlan) {
	const traffic = await readTraffic(brandId);
	const source = plan.source === "gsc" ? traffic.gsc : traffic.ga;
	const ready =
		plan.source === "pages"
			? plan.pages.length > 0
			: plan.source === "saved_seo" || Boolean(source?.connected && source.config?.property);
	return {
		plan,
		ready,
		maxCostUsd: 0,
		maxRowsPerDataset: 2000,
		legacyAggregateRowLimits: { gsc: 10000, gaAiReferrals: 50000 },
		networkDeadlineSeconds: 180,
		maxPages: 3,
		maxGoogleRequests: plan.source === "gsc" ? 56 : plan.source === "ga" ? 165 : 0,
		note: "One-shot, no recurring schedule or paid model calls. Google periods use their source timezones. Saved SEO imports existing workbench results without buying data. Execution is awaited and durably recorded; interruption never silently retries.",
	};
}
export async function executeAnalysisRefresh(brand: typeof brands.$inferSelect, key: string, raw: RefreshPlan) {
	const plan = refreshPlan.parse(raw);
	return workspaceCommand(
		{
			organizationId: brand.organizationId,
			brandId: brand.id,
			operation: "refresh_analysis_data",
			idempotencyKey: key,
			args: plan,
		},
		async () => {
			if (!(await previewAnalysisRefresh(brand.id, plan)).ready)
				throw new Error("Connect and select the source in Brand settings, or select candidate pages first.");
			if (plan.source === "pages") return captureAnalysisPages(brand.id, plan.pages);
			if (plan.source === "saved_seo") return importSeo(brand, plan.runId);
			if (plan.source === "gsc") await syncGsc(brand.id);
			else await syncGa(brand.id);
			return { status: "completed", source: plan.source };
		},
	);
}
async function importSeo(brand: typeof brands.$inferSelect, runId?: string) {
	const segment = createHash("sha256").update(brand.id).digest("hex");
	const evidence = await readSavedSeoEvidence(
		path.join(process.env.BEAT_GEO_SEO_DATA_DIR || path.join(os.homedir(), ".beat-geo", "seo"), segment),
		runId,
	);
	if (!evidence) throw new Error("Run SEO research in the workbench first.");
	const hostname = new URL(brand.website.includes("://") ? brand.website : `https://${brand.website}`).hostname.replace(
		/^www\./,
		"",
	);
	if (evidence.snapshot.site !== hostname) throw new Error("SEO evidence does not match the current brand website.");
	const saved = await saveAnalysisEvidence(brand.id, { kind: "seo", data: evidence });
	return { status: "completed", evidenceId: saved.id, runId: evidence.runId };
}
export async function analysisRefreshStatus(brandId: string, id: string) {
	const [row] = await db
		.select({
			id: workspaceCommands.id,
			status: workspaceCommands.status,
			createdAt: workspaceCommands.createdAt,
			finishedAt: workspaceCommands.finishedAt,
			result: workspaceCommands.result,
			error: workspaceCommands.error,
		})
		.from(workspaceCommands)
		.where(
			and(
				eq(workspaceCommands.brandId, brandId),
				eq(workspaceCommands.id, id),
				eq(workspaceCommands.operation, "refresh_analysis_data"),
			),
		);
	if (!row) throw new Error("Refresh command is unavailable for this brand.");
	return {
		...row,
		note: "A running command may have been interrupted if the local process stopped. Inspect source snapshots before using a new key; the same key never repeats network work.",
	};
}
