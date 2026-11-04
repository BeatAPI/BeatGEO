import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { readSiteAudit, runSiteAudit } from "./site-audit-core";

const input = z.object({ brandId: z.string().min(1) });
export const getSiteAuditFn = createServerFn({ method: "GET" })
	.validator(input)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return readSiteAudit(data.brandId);
	});
export const runSiteAuditFn = createServerFn({ method: "POST" })
	.validator(input)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return runSiteAudit(data.brandId);
	});
