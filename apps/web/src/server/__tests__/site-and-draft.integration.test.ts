import { db } from "@workspace/lib/db/db";
import { optimizationActions } from "@workspace/lib/db/schema";
import { afterAll, expect, it, vi } from "vitest";
import { createBrand, deleteBrand } from "@/test/integration/stats-fixtures";
import { createContentDraft, reviewContentDraft, saveContentDraft } from "../content-draft-core";
import { applyOptimizationAction } from "../monitoring-core";
import { readSiteAudit, runSiteAudit } from "../site-audit-core";

const mocks = vi.hoisted(() => ({ scan: vi.fn() }));
vi.mock("@workspace/lib/site-audit", () => ({ scanSite: mocks.scan }));
const brands: string[] = [];
afterAll(async () => {
	for (const id of brands) await deleteBrand(id);
});
it("stores website evidence per brand and reuses recent checks", async () => {
	const brand = await createBrand();
	brands.push(brand);
	const other = await createBrand();
	brands.push(other);
	mocks.scan.mockResolvedValue({
		url: "https://example.com",
		checkedAt: new Date().toISOString(),
		checks: [],
		passed: 0,
		evaluated: 0,
		total: 0,
	});
	const result = await runSiteAudit(brand);
	expect(await readSiteAudit(brand)).toEqual(result);
	expect(await readSiteAudit(other)).toBeNull();
	expect(await runSiteAudit(brand)).toEqual(result);
	expect(mocks.scan).toHaveBeenCalledTimes(1);
});
it("requires review of the exact saved draft and rejects stale or cross-brand edits", async () => {
	const brand = await createBrand();
	brands.push(brand);
	const other = await createBrand();
	brands.push(other);
	const [action] = await db
		.insert(optimizationActions)
		.values({ brandId: brand, title: "Improve FAQ", description: "Answer practical questions", baseline: [] })
		.returning();
	const outline = await createContentDraft(brand, action.id, 0, "zh", false);
	expect(outline.contentDraft).toContain("需要回答的问题");
	await expect(applyOptimizationAction(brand, action.id, "Published")).rejects.toThrow("needs review");
	await expect(saveContentDraft(other, action.id, 1, "wrong brand")).rejects.toThrow();
	await expect(saveContentDraft(brand, action.id, 0, "stale")).rejects.toThrow("changed");
	await reviewContentDraft(brand, action.id, 1);
	const edited = await saveContentDraft(brand, action.id, 1, "Verified FAQ");
	expect(edited.reviewedRevision).toBeNull();
	await expect(reviewContentDraft(brand, action.id, 1)).rejects.toThrow("Save the current draft");
	await reviewContentDraft(brand, action.id, 2);
	await applyOptimizationAction(brand, action.id, "Published the verified FAQ");
	await expect(saveContentDraft(brand, action.id, 2, "cannot alter applied evidence")).rejects.toThrow();
});
