import { expect, test } from "../../test";
import { TEST_BRAND_NAME, SLUGGED_BRAND_NAME } from "../../fixtures";

test("website settings offer this workspace's brands without organization management", async ({ page }) => {
  await page.goto("/brand");
  await expect(page.getByRole("button", { name: "EN", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Brand Name", { exact: true })).toHaveValue(TEST_BRAND_NAME);
  await page.getByRole("combobox", { name: "Switch website" }).click();
  for (const name of [TEST_BRAND_NAME, SLUGGED_BRAND_NAME]) {
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("option", { name: "Nike", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: /create organization|invite member|billing/i })).toHaveCount(0);
  await page.getByRole("link", { name: "Add a website", exact: true }).click();
  await expect(page.locator("#new-brand-name")).toBeVisible();
});
