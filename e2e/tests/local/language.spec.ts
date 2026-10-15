import { expect, test } from "../../test";

test.use({ storageState: { cookies: [], origins: [] } });

test("changing interface language preserves form input and survives reload", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("button", { name: "中文", exact: true })).toBeEnabled();
  await page.getByLabel("Email", { exact: true }).fill("language-preview@example.test");
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "欢迎回来", exact: true })).toBeVisible();
  await expect(page.getByLabel("邮箱", { exact: true })).toHaveValue("language-preview@example.test");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload();
  await expect(page.getByRole("heading", { name: "欢迎回来", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "EN", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("language changes synchronize across tabs", async ({ page, context }) => {
  await page.goto("/auth/login");
  const other = await context.newPage();
  await other.goto("/auth/login");
  await expect(other.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(other.getByRole("heading", { name: "欢迎回来", exact: true })).toBeVisible();
  await other.close();
});
