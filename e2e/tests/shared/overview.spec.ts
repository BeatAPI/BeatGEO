import { expect, test } from "../../test";

test("opening the workspace lands on SEO with GEO navigation available", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/seo$/);
  const sidebar = page.locator('[data-slot="sidebar"]').first();
  await expect(sidebar).toBeVisible();
  for (const path of ["/geo", "/questions", "/visibility", "/brand"]) {
    await expect(sidebar.locator(`a[href="${path}"]`).first()).toBeVisible();
  }
});

test("sidebar navigation opens GEO overview, visibility and question settings", async ({ page }) => {
  await page.goto("/geo");
  const sidebar = page.locator('[data-slot="sidebar"]').first();
  for (const path of ["/visibility", "/questions", "/geo"]) {
    await sidebar.locator(`a[href="${path}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
  }
});
