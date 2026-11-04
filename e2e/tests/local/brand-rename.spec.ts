import { expect, test } from "../../test";
import { RENAMEABLE_BRAND_NAME } from "../../fixtures";

test("a website brand can be renamed and the name survives reload", async ({ page }) => {
  await page.goto("/brand");
  await expect(page.getByRole("button", { name: "EN", exact: true })).toBeEnabled();
  await page.getByRole("combobox", { name: "Switch website" }).click();
  await page.getByRole("option", { name: RENAMEABLE_BRAND_NAME, exact: true }).click();
  const name = page.getByLabel("Brand Name", { exact: true });
  await expect(name).toHaveValue(RENAMEABLE_BRAND_NAME);
  try {
    await name.fill(`${RENAMEABLE_BRAND_NAME} updated`);
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(page.getByText("Brand details updated successfully!", { exact: true })).toBeVisible();
    await page.reload();
    await expect(name).toHaveValue(`${RENAMEABLE_BRAND_NAME} updated`);
  } finally {
    await name.fill(RENAMEABLE_BRAND_NAME);
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(page.getByText("Brand details updated successfully!", { exact: true })).toBeVisible();
  }
});
