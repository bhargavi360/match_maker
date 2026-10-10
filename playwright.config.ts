import { defineConfig } from "@playwright/test";
import { ensureBrowserEnvironment } from "./scripts/browser-environment";
ensureBrowserEnvironment();

export default defineConfig({
  testDir: process.env.MATCHMAKER_BROWSER_SPECS ?? "./tests",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [["list"], ["html", { outputFolder: "test-results/report", open: "never" }]],
  outputDir: "test-results/artifacts",
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    storageState: "test-results/browser-auth.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: { command: "npm run start", url: "http://127.0.0.1:3100/login", reuseExistingServer: false, timeout: 60000 },
});
