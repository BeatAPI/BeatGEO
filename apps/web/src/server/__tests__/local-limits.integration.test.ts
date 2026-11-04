import { randomUUID } from "node:crypto";
import { MAX_PROMPTS } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { prompts } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { createBrand as createBrandAggregate } from "@/server/onboarding-core";
import { createPrompts, updatePrompt } from "@/server/prompts-core";
import { addSeoPrompts } from "@/server/seo-prompts";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";

const schedule = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/job-scheduler", () => ({
	createPromptJobScheduler: schedule,
	removePromptJobScheduler: schedule,
	createMultiplePromptJobSchedulers: vi.fn(async (ids: string[]) => ids.map(() => true)),
}));

it("serializes API/MCP and SEO additions competing for the last brand slot", async () => {
	const id = await createBrand();
	const brand = { id, organizationId: id, name: "Acme", website: "https://acme.example" };
	try {
		await db
			.insert(prompts)
			.values(Array.from({ length: MAX_PROMPTS - 1 }, (_, i) => ({ brandId: id, value: `Existing ${i}` })));
		const results = await Promise.allSettled([
			createPrompts(brand, { prompts: [{ value: "API question", enabled: false }] }),
			addSeoPrompts({ brandId: id, sourceRunId: randomUUID(), questions: [{ id: "seo", text: "SEO question" }] }),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		const denied = results.find((result) => result.status === "rejected");
		expect(denied?.status === "rejected" && denied.reason).toMatchObject({ status: 409, code: "prompt-cap" });
		expect(await db.select().from(prompts).where(eq(prompts.brandId, id))).toHaveLength(MAX_PROMPTS);
	} finally {
		await deleteBrand(id);
	}
});

it("rejects an oversized batch atomically and still permits editing an existing full brand", async () => {
	const id = await createBrand();
	const brand = { id, organizationId: id, name: "Acme", website: "https://acme.example" };
	try {
		const existing = await db
			.insert(prompts)
			.values(Array.from({ length: MAX_PROMPTS - 1 }, (_, i) => ({ brandId: id, value: `Existing ${i}` })))
			.returning();
		await expect(createPrompts(brand, { prompts: [{ value: "First" }, { value: "Second" }] })).rejects.toMatchObject({
			status: 409,
		});
		expect(await db.select().from(prompts).where(eq(prompts.brandId, id))).toHaveLength(MAX_PROMPTS - 1);
		await createPrompts(brand, { prompts: [{ value: "Last", enabled: false }] });
		await expect(
			updatePrompt(brand, existing[0].id, { value: "Edited at the cap", enabled: false }),
		).resolves.toMatchObject({ value: "Edited at the cap", enabled: false });
	} finally {
		await deleteBrand(id);
	}
});

it("rolls back a new brand when its initial questions exceed the local cap", async () => {
	const workspace = await createBrand();
	try {
		const id = `limit-${randomUUID()}`;
		await expect(
			createBrandAggregate({
				id,
				name: "Oversized",
				organizationId: workspace,
				website: "https://example.com",
				prompts: Array.from({ length: MAX_PROMPTS + 1 }, (_, i) => ({
					value: `Question ${i}`,
					tags: [],
					enabled: true,
				})),
			}),
		).rejects.toMatchObject({ status: 409, code: "prompt-cap" });
		expect(await db.query.brands.findFirst({ where: (brands, { eq }) => eq(brands.id, id) })).toBeUndefined();
		expect(await db.query.organization.findFirst({ where: (org, { eq }) => eq(org.id, workspace) })).toBeDefined();
	} finally {
		await deleteBrand(workspace);
	}
});
