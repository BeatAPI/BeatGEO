/**
 * The local workspace project, plus the worker project the CI worker phase runs
 * once a worker is up.
 */
import { defineConfig, devices } from "@playwright/test";
import { APP_URL, AUTH_STATE_PATH } from "./fixtures";
import type { ConsoleErrorOptions } from "./test";

const HTML_REPORT_DIR = process.env.PLAYWRIGHT_HTML_REPORT || "playwright-report";

export default defineConfig<ConsoleErrorOptions>({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A test that needed its retry fails the job. Four had been failing their
  // first attempt for months behind a silent retry, each costing a whole
  // timeout; a suite that needs one is telling you something it used to be
  // able to swallow. The retry still runs, but it no longer forgives the
  // failure — it is what produces the trace below.
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 4,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: HTML_REPORT_DIR }], ["github"]]
    : [["list"], ["html", { open: "on-failure", outputFolder: HTML_REPORT_DIR }]],
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  maxFailures: process.env.CI ? 10 : 5,

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "first-run",
      testMatch: /first-run\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
    },
    {
      name: "local:setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
    },
    {
      name: "local",
      dependencies: ["local:setup"],
      testMatch: ["shared/**/*.spec.ts", "local/**/*.spec.ts"],
      outputDir: "test-results-local",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: APP_URL,
        storageState: AUTH_STATE_PATH,
        allowedConsoleErrors: [],
      },
    },
    // Run explicitly by the CI worker phase (--project=worker) once the worker
    // container is up; the local project stays worker-free so a bare run
    // doesn't hang on (or feed a paid job to) whatever worker happens to be
    // running. The timeout leaves room for the spec's 120s poll (worker
    // startup + one pg-boss retry). It needs no session — the spec drives the
    // public API with a bearer key.
    {
      name: "worker",
      testMatch: /worker\.spec\.ts/,
      outputDir: "test-results-worker",
      timeout: 150_000,
      use: { ...devices["Desktop Chrome"], baseURL: APP_URL },
    },
  ],
});
