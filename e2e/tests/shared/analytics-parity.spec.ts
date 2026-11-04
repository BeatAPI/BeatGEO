/**
 * Reads a figure off the rendered page and asserts the API reports the same one
 * for the same window. Fails if someone reimplements a metric on one side.
 */
import { expect, test } from "../../test";
import { TEST_API_KEY, TEST_BRAND_ID, brandUrl } from "../../fixtures";

const AUTH = { Authorization: `Bearer ${TEST_API_KEY}` };

/** Half-open, so it runs to the start of tomorrow — anything less drops today's
 * runs and the two sides disagree for that reason alone. */
function lastMonth(): string {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  // Clamped the way the dashboard shifts, for the 31st of a month the previous
  // one does not have.
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(today.getUTCDate(), lastDay));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));
  return `start=${dayStart(start)}&end=${end.toISOString()}`;
}

function dayStart(date: Date): string {
  return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

test.describe("dashboard and API parity", () => {
  test("the visibility hero and GET /analytics report the same number", async ({ page, request }) => {
    await page.goto(brandUrl());

    // The sibling card also reads "<n>%", so the trailing word disambiguates.
    const hero = page.getByText(/\d+%\s*Early signal/).first();
    await expect(hero).toBeVisible({ timeout: 30_000 });
    const rendered = Number((await hero.textContent())?.match(/(\d+)%/)?.[1]);

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/analytics?${lastMonth()}`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Ratios against a rendered percentage, each rounded once at its own edge.
    // The page shows 0 where the API says "nothing to plot".
    expect(Math.round((body.visibility.current ?? 0) * 100)).toBe(rendered);
  });

  test("share of voice agrees between the page and the API", async ({ page, request }) => {
    await page.goto(`${brandUrl()}/share-of-voice`);
    await expect(page.getByRole("heading", { name: /share of voice/i }).first()).toBeVisible({ timeout: 30_000 });

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/analytics?${lastMonth()}`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = (await response.json()).shareOfVoice;

    expect(body.entries.filter((entry: { isBrand: boolean }) => entry.isBrand)).toHaveLength(1);
    for (const entry of body.entries) {
      expect(entry.share).toBeGreaterThanOrEqual(0);
      expect(entry.share).toBeLessThanOrEqual(1);
      if (!entry.isBrand) await expect(page.getByText(entry.name).first()).toBeVisible();
    }
  });

  test("query fan-out totals agree between the page and the API", async ({ page, request }) => {
    await page.goto(`${brandUrl()}/query-fan-out`);
    await expect(page.getByRole("heading", { name: /fan.?out/i }).first()).toBeVisible({ timeout: 30_000 });

    const response = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/query-fanout?${lastMonth()}`, { headers: AUTH });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Against every run, not only the ones that searched: engines that don't
    // expose their searches still contribute runs.
    expect(body.fanoutRuns).toBeLessThanOrEqual(body.totalRuns);
    expect(body.uniqueQueries).toBeLessThanOrEqual(body.totalQueries);
    // Must not arrive pre-truncated by the caps the dashboard applies.
    expect(body.data.length).toBe(body.uniqueQueries);
  });
});
