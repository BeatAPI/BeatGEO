import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './seo',
  outputDir: './test-results-seo',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: { viewport: { width: 1280, height: 900 }, screenshot: 'only-on-failure' },
});
