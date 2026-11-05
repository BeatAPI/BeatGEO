import { randomUUID } from "node:crypto";
import pg from "pg";
import { brandUrl, DATABASE_URL, TEST_BRAND_ID } from "../../fixtures";
import { expect, test } from "../../test";

test("saved search evidence becomes a reviewable SEO action without AI questions", async ({ page }, info) => {
  const target = new URL(DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || !target.pathname.endsWith("_test")) throw new Error("A disposable test database is required.");
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  const id = randomUUID();
  const dataset = { dimensions: ["query", "page"], rows: [{ keys: ["image api demo", "https://example.com/pricing"], clicks: 4, impressions: 500, ctr: 0.008, position: 7 }], returnedRows: 1, limitReached: false, providerLimited: true };
  const current = { schema: "beat-geo/gsc-summary@1", site: "https://example.com/", siteUrl: "https://example.com/", startDate: "2026-10-01", endDate: "2026-10-28", fetchedAt: "2026-11-01T00:00:00Z", totals: null, pages: [], queries: [], limitReached: false, warning: "Synthetic browser acceptance fixture", queryPages: dataset, daily: { ...dataset, rows: [] }, dailyPages: { ...dataset, rows: [] } };
  const payload = { kind: "gsc", data: { ...current, analysis: { schema: "beat-geo/gsc-analysis@1", timezone: "America/Los_Angeles", current, previous: { ...current, startDate: "2026-09-03", endDate: "2026-09-30", queryPages: { ...dataset, rows: [] } } } } };
  try {
    await client.query("INSERT INTO analysis_evidence (id, brand_id, kind, payload) VALUES ($1,$2,'gsc',$3)", [id, TEST_BRAND_ID, JSON.stringify(payload)]);
    await page.goto(`${brandUrl()}/opportunities`);
    await page.getByRole("tab", { name: "Search diagnosis", exact: true }).click();
    await expect(page.getByText("image api demo", { exact: true })).toBeVisible();
    await expect(page.getByText("0.80%", { exact: true })).toBeVisible();
    await expect(page.getByText("Current period: 2026-10-01 – 2026-10-28", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("search-diagnosis.png"), fullPage: true });
    await page.getByRole("button", { name: "Create SEO action", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved. Review the updated evidence or action." })).toBeVisible();
    await page.getByRole("tab", { name: "Actions & retests", exact: true }).click();
    const card = page.locator('[data-slot="card"]').filter({ hasText: "image api demo" });
    await expect(card).toBeVisible();
    await card.locator("summary").filter({ hasText: "Content draft" }).click();
    await card.getByRole("button", { name: "Create outline · free", exact: true }).click();
    await expect(card.getByRole("textbox", { name: "Content draft", exact: true })).toContainText("image api demo");
    await card.getByRole("textbox", { name: /Implementation note/ }).fill("Synthetic test: updated page title");
    await expect(card.getByRole("button", { name: "Mark implemented", exact: true })).toBeDisabled();
    await card.getByRole("button", { name: "Approve draft", exact: true }).click();
    await expect(card.getByRole("button", { name: "Mark implemented", exact: true })).toBeEnabled();
    await card.getByRole("button", { name: "Mark implemented", exact: true }).click();
    await expect(card.getByText(/SEO comparison/)).toBeVisible();
    await expect(card.getByRole("button", { name: "Retest · uses configured providers", exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByRole("tab", { name: "Actions & retests", exact: true }).click();
    await expect(card.getByText(/SEO comparison/)).toBeVisible();
    await page.screenshot({ path: info.outputPath("seo-action-reviewed.png"), fullPage: true });
  } finally {
    await client.query("DELETE FROM optimization_actions WHERE brand_id=$1 AND kind='seo' AND seo_baseline->'evidenceIds' ? $2", [TEST_BRAND_ID, id]);
    await client.query("DELETE FROM analysis_evidence WHERE id=$1", [id]);
    await client.end();
  }
});
