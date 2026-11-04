import { randomUUID } from "node:crypto";
import { resetDeploymentCache } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { addSeoPrompts } from "@/server/seo-prompts";
import { createBrand, createPrompt, deleteBrand } from "@/test/integration/stats-fixtures";

const schedule = vi.hoisted(() => vi.fn(async (ids: string[]) => ids.map(() => true)));
vi.mock("@/lib/job-scheduler", () => ({ createMultiplePromptJobSchedulers: schedule }));
let brand: string;
let other: string;
beforeAll(async () => {
	resetDeploymentCache();
	brand = await createBrand({ name: "SeoFixture" });
	other = await createBrand({ name: "OtherFixture" });
});
afterAll(async () => {
	if (brand) await deleteBrand(brand);
	if (other) await deleteBrand(other);
	vi.unstubAllEnvs();
	resetDeploymentCache();
});

it("adds reviewed questions once under concurrent retries, scopes duplicates to a brand and retains source tags", async () => {
	const sourceRunId = randomUUID();
	await createPrompt(other, { value: "Which API should I use?" });
	const args = { brandId: brand, sourceRunId, questions: [{ id: "q1", text: "Which API should I use?" }] };
	const results = await Promise.all([addSeoPrompts(args), addSeoPrompts(args)]);
	expect(results.map((result) => result.added).sort()).toEqual([0, 1]);
	expect(results[0].promptIds).toEqual(results[1].promptIds);
	const rows = await db.select().from(prompts).where(eq(prompts.brandId, brand));
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({
		enabled: true,
		value: args.questions[0].text,
		tags: ["seo-research", `seo-run:${sourceRunId}`],
	});
	expect(schedule).toHaveBeenCalledWith([rows[0].id], { sendImmediate: false });
});

it("keeps existing paused questions untouched and reports them instead of reactivating", async () => {
	const id = await createPrompt(brand, { value: "Keep me paused?", enabled: false });
	const calls = schedule.mock.calls.length;
	const result = await addSeoPrompts({
		brandId: brand,
		sourceRunId: randomUUID(),
		questions: [{ id: "paused", text: "KEEP ME PAUSED?" }],
	});
	expect(result).toMatchObject({ added: 0, existing: 1, existingDisabled: 1, promptIds: [id], scheduled: 0 });
	expect(schedule.mock.calls).toHaveLength(calls);
	expect((await db.query.prompts.findFirst({ where: eq(prompts.id, id) }))?.enabled).toBe(false);
});

it("persists a paused brand's questions without scheduling and reports queue failures for an enabled brand", async () => {
	await db.update(brands).set({ enabled: false }).where(eq(brands.id, brand));
	const paused = await addSeoPrompts({
		brandId: brand,
		sourceRunId: randomUUID(),
		questions: [{ id: "q", text: "Paused brand question?" }],
	});
	expect(paused).toMatchObject({ added: 1, brandPaused: true, scheduled: 0, schedulingFailed: 0 });
	await db.update(brands).set({ enabled: true }).where(eq(brands.id, brand));
	schedule.mockResolvedValueOnce([false]);
	const args = { brandId: brand, sourceRunId: randomUUID(), questions: [{ id: "q", text: "Retry queue question?" }] };
	const failed = await addSeoPrompts(args);
	expect(failed).toMatchObject({ added: 1, schedulingFailed: 1 });
	const retry = await addSeoPrompts(args);
	expect(retry).toMatchObject({ added: 0, existing: 1, scheduled: 1, schedulingFailed: 0 });
	expect(retry.promptIds).toEqual(failed.promptIds);
});

it("rejects missing brands and invalid evidence identifiers without scheduling", async () => {
	const calls = schedule.mock.calls.length;
	await expect(
		addSeoPrompts({ brandId: randomUUID(), sourceRunId: randomUUID(), questions: [{ id: "q", text: "Question?" }] }),
	).rejects.toThrow("Brand not found");
	await expect(
		addSeoPrompts({ brandId: brand, sourceRunId: "../../other", questions: [{ id: "q", text: "Question?" }] }),
	).rejects.toThrow();
	expect(schedule.mock.calls).toHaveLength(calls);
});

it("rejects an over-cap batch atomically while allowing a duplicate-only replay", async () => {
	const fullBrand = await createBrand();
	try {
		await db
			.insert(prompts)
			.values(
				Array.from({ length: 100 }, (_, index) => ({ brandId: fullBrand, value: `Existing question ${index}?` })),
			);
		const calls = schedule.mock.calls.length;
		await expect(
			addSeoPrompts({
				brandId: fullBrand,
				sourceRunId: randomUUID(),
				questions: [{ id: "new", text: "One question too many?" }],
			}),
		).rejects.toThrow("at most 100");
		expect(await db.select().from(prompts).where(eq(prompts.brandId, fullBrand))).toHaveLength(100);
		expect(schedule.mock.calls).toHaveLength(calls);
		expect(
			await addSeoPrompts({
				brandId: fullBrand,
				sourceRunId: randomUUID(),
				questions: [{ id: "existing", text: "Existing question 0?" }],
			}),
		).toMatchObject({ added: 0, existing: 1 });
	} finally {
		await deleteBrand(fullBrand);
	}
});
