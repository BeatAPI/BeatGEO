import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { assertAllowed, decidePromptCap, withQuotaLock } from "@workspace/lib/limits";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";

export const seoPromptInput = z.object({
	brandId: z.string().min(1).max(128),
	sourceRunId: z.uuid(),
	questions: z
		.array(z.object({ id: z.string().trim().min(1).max(100), text: z.string().trim().min(1).max(2000) }))
		.min(1)
		.max(100),
});

type SeoPromptInput = z.infer<typeof seoPromptInput>;
type StoredQuestion = { id: string; value: string; enabled: boolean; tags: string[] };
const questionKey = (text: string) => text.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

export function planSeoPromptImport(questions: SeoPromptInput["questions"], existing: StoredQuestion[]) {
	const byId = new Map<string, string>();
	const selected = new Map<string, string>();
	for (const question of questions) {
		const key = questionKey(question.text);
		if (byId.has(question.id) && byId.get(question.id) !== key)
			throw new Error("One question ID refers to different texts. Review the selected questions and try again.");
		byId.set(question.id, key);
		if (!selected.has(key)) selected.set(key, question.text.trim().replace(/\s+/gu, " "));
	}
	const byText = new Map(existing.map((question) => [questionKey(question.value), question]));
	return {
		selected,
		byText,
		additions: [...selected].filter(([key]) => !byText.has(key)).map(([, value]) => value),
	};
}

async function saveQuestions(input: SeoPromptInput) {
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
	if (!brand) throw new Error("Brand not found.");
	return withQuotaLock(brand.organizationId, async (tx) => {
		const current = await tx.query.brands.findFirst({ where: eq(brands.id, input.brandId) });
		if (!current || current.organizationId !== brand.organizationId) throw new Error("Brand not found.");
		const existing = await tx
			.select({ id: prompts.id, value: prompts.value, enabled: prompts.enabled, tags: prompts.tags })
			.from(prompts)
			.where(eq(prompts.brandId, input.brandId));
		const plan = planSeoPromptImport(input.questions, existing);
		assertAllowed(decidePromptCap(existing.length, plan.additions.length));
		const sourceTag = `seo-run:${input.sourceRunId}`;
		if (plan.additions.length) {
			const inserted = await tx
				.insert(prompts)
				.values(
					plan.additions.map((value) => ({
						brandId: current.id,
						value,
						enabled: true,
						tags: ["seo-research", sourceTag],
						systemTags: computeSystemTags(value, current.name, current.website),
					})),
				)
				.returning({ id: prompts.id, value: prompts.value, enabled: prompts.enabled, tags: prompts.tags });
			for (const question of inserted) plan.byText.set(questionKey(question.value), question);
		}
		const selected = [...plan.selected.keys()].map((key) => {
			const question = plan.byText.get(key);
			if (!question) throw new Error("A selected question could not be saved. Try again.");
			return question;
		});
		return {
			added: plan.additions.length,
			existing: input.questions.length - plan.additions.length,
			existingDisabled: selected.filter((question) => !question.enabled).length,
			promptIds: selected.map((question) => question.id),
			brandPaused: !current.enabled,
			// A retry may repair scheduling for this import, but never changes unrelated or paused questions.
			scheduleIds: current.enabled
				? selected
						.filter((question) => question.enabled && question.tags.includes(sourceTag))
						.map((question) => question.id)
				: [],
		};
	});
}

/** The caller must authenticate brand access before entering this persistence boundary. */
export async function addSeoPrompts(raw: SeoPromptInput) {
	const input = seoPromptInput.parse(raw);
	const { scheduleIds, ...saved } = await saveQuestions(input);
	const scheduled = scheduleIds.length
		? await createMultiplePromptJobSchedulers(scheduleIds, { sendImmediate: false }).catch(() =>
				scheduleIds.map(() => false),
			)
		: [];
	return {
		...saved,
		scheduled: scheduled.filter(Boolean).length,
		schedulingFailed: scheduled.filter((success) => !success).length,
	};
}
