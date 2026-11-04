import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { applyWorkspaceOperation, getWorkspaceControl, workspaceOperation } from "./agent-workflow-core";

export const getWorkspaceControlFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string().min(1) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return getWorkspaceControl(data.brandId);
	});

export const applyWorkspaceOperationFn = createServerFn({ method: "POST" })
	.validator(
		z.object({ brandId: z.string().min(1), idempotencyKey: z.string().min(1).max(120), command: workspaceOperation }),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const { brand } = await getWorkspaceControl(data.brandId);
		const result = await applyWorkspaceOperation(brand, data.idempotencyKey, data.command);
		return { commandId: result.commandId, replayed: result.replayed };
	});
