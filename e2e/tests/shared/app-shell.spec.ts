import type { Page } from "@playwright/test";

import { expect, test } from "../../test";

const SERVER_CALL_DELAY_MS = 1_200;

declare global {
  interface Window {
    __sameDocument?: boolean;
  }
}

test.describe("App shell", () => {
  test("stays mounted through slow navigations between local workspace pages", async ({ page }) => {
    await page.route(/\/_serverFn\//, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, SERVER_CALL_DELAY_MS));
      await route.continue();
    });

    await page.goto("/geo");
    await expect(page.getByRole("button", { name: "EN", exact: true })).toBeEnabled();

    const sidebar = await page.locator('[data-slot="sidebar"]').first().elementHandle();
    expect(sidebar).not.toBeNull();

    const steps: Array<[selector: string, destination: string]> = [
      ['a[href="/visibility"]', "/visibility"],
      ['a[href="/questions"]', "/questions"],
      ['a[href="/geo"]', "/geo"],
    ];
    for (const [selector, destination] of steps) {
      await clientNavigate(page, selector, destination);
      expect(await sidebar?.evaluate((node) => node.isConnected), `the sidebar survived arriving at ${destination}`).toBe(
        true,
      );
    }

    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });
});

async function clientNavigate(page: Page, selector: string, destination: string): Promise<void> {
  await page.evaluate(() => {
    window.__sameDocument = true;
  });
  await page.locator(selector).first().click();
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(destination)}$`), { timeout: 30_000 });
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
