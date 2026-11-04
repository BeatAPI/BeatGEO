import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './i18n',
  outputDir: './test-results-i18n',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  use: { headless: true },
});
