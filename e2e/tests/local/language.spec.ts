import { expect, test } from "../../test";



test("changing interface language preserves form input and survives reload", async ({ page }) => {
  await page.goto("/brand?add=true");
  await expect(page.getByRole("button", { name: "中文", exact: true })).toBeEnabled();
  await page.locator("#new-brand-name").fill("Language preview");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByLabel("品牌名称", { exact: true })).toBeVisible();
  await expect(page.locator("#new-brand-name")).toHaveValue("Language preview");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload();
  await expect(page.getByLabel("品牌名称", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByLabel("Brand Name", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "EN", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("language changes synchronize across tabs", async ({ page, context }) => {
  await page.goto("/brand?add=true");
  const other = await context.newPage();
  await other.goto("/brand?add=true");
  await expect(other.getByLabel("Brand Name", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(other.getByLabel("品牌名称", { exact: true })).toBeVisible();
  await other.close();
});
