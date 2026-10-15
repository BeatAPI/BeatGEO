import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import {
	applyOptimizationAction,
	createOptimizationAction,
	readMonitoring,
	retestOptimizationAction,
} from "./monitoring-core";

const brandInput = z.object({ brandId: z.string().min(1) });
const actionInput = brandInput.extend({ id: z.uuid() });

export const getMonitoringFn = createServerFn({ method: "GET" })
	.validator(brandInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return readMonitoring(data.brandId);
	});

export const createOptimizationActionFn = createServerFn({ method: "POST" })
	.validator(
		brandInput.extend({
			title: z.string().trim().min(1).max(200),
			description: z.string().trim().max(4000),
			promptIds: z.array(z.uuid()).min(1).max(20),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return createOptimizationAction(data);
	});

export const applyOptimizationActionFn = createServerFn({ method: "POST" })
	.validator(actionInput.extend({ implementationNote: z.string().trim().min(1).max(2000) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return applyOptimizationAction(data.brandId, data.id, data.implementationNote);
	});

export const retestOptimizationActionFn = createServerFn({ method: "POST" })
	.validator(actionInput)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return retestOptimizationAction(data.brandId, data.id);
	});
