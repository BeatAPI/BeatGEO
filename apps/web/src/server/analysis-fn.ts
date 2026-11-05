import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { applyWorkspaceOperation, workspaceOperation } from "./agent-workflow-core";
import { analysisContext, listAnalysisEvidence, readEvidenceRows } from "./analysis-core";
import { executeAnalysisRefresh, refreshPlan } from "./analysis-refresh";
import { trafficBrand } from "./traffic-core";

const brandInput = z.object({ brandId: z.string().min(1).max(200) });
export const getAnalysisFn = createServerFn({ method: "GET" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return analysisContext(data.brandId);
	});
export const getAnalysisHistoryFn = createServerFn({ method: "GET" })
	.validator(brandInput.extend({ offset: z.number().int().min(0).default(0) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return listAnalysisEvidence(data.brandId, data.offset);
	});
export const readAnalysisRowsFn = createServerFn({ method: "GET" })
	.validator(
		brandInput.extend({
			evidenceId: z.uuid(),
			dataset: z.string().max(80),
			offset: z.number().int().min(0).max(100000).default(0),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const result = await readEvidenceRows(data.brandId, data.evidenceId, data.dataset, data.offset, 50);
		return { ...result, rows: JSON.stringify(result.rows), coverage: JSON.stringify(result.coverage) };
	});
export const refreshAnalysisFn = createServerFn({ method: "POST" })
	.validator(brandInput.extend({ plan: refreshPlan, idempotencyKey: z.string().min(1).max(120) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const result = await executeAnalysisRefresh(await trafficBrand(data.brandId), data.idempotencyKey, data.plan);
		return { commandId: result.commandId, replayed: result.replayed, dataJson: JSON.stringify(result.data) };
	});
export const analysisCommandFn = createServerFn({ method: "POST" })
	.validator(brandInput.extend({ command: workspaceOperation, idempotencyKey: z.string().min(1).max(120) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const result = await applyWorkspaceOperation(await trafficBrand(data.brandId), data.idempotencyKey, data.command);
		return { commandId: result.commandId, replayed: result.replayed, dataJson: JSON.stringify(result.data) };
	});
