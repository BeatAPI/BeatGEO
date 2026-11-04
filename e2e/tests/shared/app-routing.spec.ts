import { expect, test } from "../../test";
import { TEST_BRAND_NAME, SLUGGED_BRAND_NAME } from "../../fixtures";

test("local pages keep the selected website after reload", async ({ page }) => {
  await page.goto("/brand");
  await expect(page.getByRole("button", { name: "EN", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Brand Name", { exact: true })).toHaveValue(TEST_BRAND_NAME);
  await page.getByRole("combobox", { name: "Switch website" }).click();
  await page.getByRole("option", { name: SLUGGED_BRAND_NAME, exact: true }).click();
  await expect(page.getByLabel("Brand Name", { exact: true })).toHaveValue(SLUGGED_BRAND_NAME);
  await expect(page).toHaveURL(/\/brand$/);
  await page.reload();
  await expect(page.getByLabel("Brand Name", { exact: true })).toHaveValue(SLUGGED_BRAND_NAME);
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/seo$/);
  await expect(page.locator('[data-slot="sidebar"]').first()).toBeVisible();
});
