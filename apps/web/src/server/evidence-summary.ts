import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { promptRuns, prompts } from "@workspace/lib/db/schema";
import { summarizeObservedAnswers } from "@workspace/lib/observed-metrics";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { isBrandedPrompt } from "@/lib/prompt-tags";
export const getEvidenceSummaryFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string().min(1) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const rows = await db
			.select({
				id: promptRuns.id,
				provider: promptRuns.provider,
				model: promptRuns.model,
				version: promptRuns.version,
				webSearchEnabled: promptRuns.webSearchEnabled,
				brandMentioned: promptRuns.brandMentioned,
				competitorsMentioned: promptRuns.competitorsMentioned,
				createdAt: promptRuns.createdAt,
				tags: prompts.tags,
				systemTags: prompts.systemTags,
			})
			.from(promptRuns)
			.innerJoin(prompts, eq(prompts.id, promptRuns.promptId))
			.where(and(eq(promptRuns.brandId, data.brandId), gt(promptRuns.createdAt, new Date(Date.now() - 30 * 86400_000))))
			.orderBy(desc(promptRuns.createdAt))
			.limit(5001);
		return {
			truncated: rows.length > 5000,
			groups: summarizeObservedAnswers(rows.slice(0, 5000).map((row) => ({ ...row, branded: isBrandedPrompt(row) }))),
		};
	});
