/**
 * The local workspace: single-user by design, with no sign-in form, no signup,
 * no team invitations and no billing. It ships the full report generator and
 * the stock BeatGEO branding.
 */
import { expect, test } from "../../test";
import { brandUrl, organizationUrl } from "../../fixtures";

test.describe("No account pages", () => {
  test("sign-in sends you straight to the workspace", async ({ page }) => {
    await page.goto("/auth/login");
    await page.waitForURL(/\/app|\/setup|\/seo|\/brand|\/geo/, { timeout: 30_000 });
  });

  test("account pages return to the local workspace", async ({ page }) => {
    for (const path of ["/auth/register", "/auth/forgot-password"]) {
      await page.goto(path);
      await expect(page.locator('[data-slot="sidebar"]').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByLabel(/password/i)).toHaveCount(0);
    }
  });

});

test.describe("Local features", () => {
  test("report generation is available", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: /reports/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("the team page is not reachable — a local install is one user", async ({ page }) => {
    await page.goto(`${organizationUrl()}/settings/members`);
    await expect(page).toHaveURL(/\/brand$/);
    await expect(page.getByRole("button", { name: /invite member/i })).toHaveCount(0);
  });

  test("stock BeatGEO branding is used", async ({ page }) => {
    await page.goto(`${brandUrl()}`);

    // The BeatGEO wordmark.
    await expect(page.getByText("BeatGEO", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    // The version and project links.
    await expect(page.locator('a[href="https://github.com/BeatAPI/BeatGEO"]').first()).toBeVisible();
  });

  test("the web manifest carries the BeatGEO icons", async ({ request }) => {
    const response = await request.get("/api/manifest");
    expect(response.status()).toBe(200);

    const manifest = (await response.json()) as { short_name: string; icons: { src: string }[] };
    expect(manifest.short_name).toBe("BeatGEO");
    expect(manifest.icons.some((icon) => icon.src.startsWith("/icons/beatgeo-icon"))).toBe(true);
  });

  test("an installed app launches at the app root, not the manifest's own directory", async ({ request }) => {
    const response = await request.get("/api/manifest");
    const manifest = (await response.json()) as { start_url: string; scope: string };

    const manifestUrl = "https://beatgeo.test/api/manifest";
    expect(new URL(manifest.start_url, manifestUrl).pathname).toBe("/");
    expect(new URL(manifest.scope, manifestUrl).pathname).toBe("/");
  });
});
