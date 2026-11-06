/**
 * Its own module so the client graph resolves only this wrapper: a server
 * function's body is stripped on the way to the browser, and the pipeline behind
 * it never has to be browser-safe.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { generateOpportunities, type OpportunitiesResponse, resolveOpportunities } from "@/server/opportunities";
import { trafficBrand } from "./traffic-core";

export const getOpportunitiesFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), timezone: z.string().default("UTC") }))
	.handler(async ({ data }): Promise<OpportunitiesResponse> => {
		await requireBrandSession(data.brandId);
		return await resolveOpportunities(data.brandId);
	});

export const generateOpportunitiesFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string().min(1).max(200),
			timezone: z.string().max(100).default("UTC"),
			idempotencyKey: z.string().min(1).max(120),
			expectedLastEvaluatedAt: z.iso.datetime().nullable(),
		}),
	)
	.handler(async ({ data }): Promise<OpportunitiesResponse> => {
		await requireBrandSession(data.brandId);
		return generateOpportunities(
			await trafficBrand(data.brandId),
			data.idempotencyKey,
			data.timezone,
			data.expectedLastEvaluatedAt,
		);
	});
