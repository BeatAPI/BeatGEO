import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { createContentDraft, reviewContentDraft, saveContentDraft } from "./content-draft-core";

const input = z.object({ brandId: z.string().min(1), id: z.uuid(), revision: z.number().int().min(0) });
export const saveContentDraftFn = createServerFn({ method: "POST" })
	.validator(input.extend({ content: z.string().trim().min(1).max(24_000) }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return saveContentDraft(data.brandId, data.id, data.revision, data.content);
	});
export const reviewContentDraftFn = createServerFn({ method: "POST" })
	.validator(input)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return reviewContentDraft(data.brandId, data.id, data.revision);
	});
export const createContentDraftFn = createServerFn({ method: "POST" })
	.validator(input.extend({ language: z.enum(["en", "zh"]), useAi: z.boolean() }))
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		return createContentDraft(data.brandId, data.id, data.revision, data.language, data.useAi);
	});
