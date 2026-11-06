import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { db } from "@workspace/lib/db/db";
import { workspaceCommands } from "@workspace/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { readSavedSeoEvidence } from "../../../../tools/seo-geo/src/saved-evidence.mjs";
import { latestEvidence } from "./analysis-core";
import { readTraffic } from "./traffic-core";

export function googleAnalysisState(
	input: {
		connected: boolean;
		selected: boolean;
		hasSnapshot: boolean;
		observedAt: string | null;
	},
	now = Date.now(),
) {
	const status = !input.connected
		? "disconnected"
		: !input.selected
			? "select_property"
			: !input.observedAt
				? input.hasSnapshot
					? "legacy_snapshot"
					: "first_refresh"
				: now - Date.parse(input.observedAt) > 7 * 86400000
					? "stale"
					: "ready";
	return { status, canRefresh: input.connected && input.selected, observedAt: input.observedAt };
}

export async function analysisReadiness(brandId: string) {
	const [traffic, evidence, commands] = await Promise.all([
		readTraffic(brandId),
		latestEvidence(brandId),
		db
			.select({ status: workspaceCommands.status, createdAt: workspaceCommands.createdAt })
			.from(workspaceCommands)
			.where(and(eq(workspaceCommands.brandId, brandId), eq(workspaceCommands.operation, "refresh_analysis_data")))
			.orderBy(desc(workspaceCommands.createdAt))
			.limit(1),
	]);
	const sources = (["gsc", "ga"] as const).map((kind) => {
		const connection = traffic[kind];
		const payload = evidence.find((item) => item.payload.kind === kind)?.payload;
		const observedAt = payload?.kind === "gsc" || payload?.kind === "ga" ? payload.data.fetchedAt : null;
		return {
			kind,
			...googleAnalysisState({
				connected: Boolean(connection?.connected),
				selected: Boolean(connection?.config?.property),
				hasSnapshot: Boolean(connection?.snapshot),
				observedAt,
			}),
		};
	});
	let seoStatus: "ready" | "no_saved_result" | "unavailable" | "wrong_site" = "no_saved_result";
	try {
		const segment = createHash("sha256").update(brandId).digest("hex");
		const saved = await readSavedSeoEvidence(
			path.join(process.env.BEAT_GEO_SEO_DATA_DIR || path.join(os.homedir(), ".beat-geo", "seo"), segment),
		);
		if (saved) seoStatus = saved.snapshot.site === traffic.site.replace(/^www\./, "") ? "ready" : "wrong_site";
	} catch {
		seoStatus = "unavailable";
	}
	return {
		sources,
		seo: { status: seoStatus, canRefresh: seoStatus === "ready" },
		lastRefresh: commands[0] ? { status: commands[0].status, at: commands[0].createdAt.toISOString() } : null,
	};
}
