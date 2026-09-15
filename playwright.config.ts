import { existsSync } from "node:fs";
import { chromium, defineConfig } from "@playwright/test";
import { hostOrigin } from "./tests/host-config";

const chromeInstalled = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].some(path => existsSync(path));
if (!chromeInstalled && !existsSync(chromium.executablePath())) {
  throw new Error("Browser missing: provide installed Chrome or cached Playwright Chromium. This test suite does not install browsers.");
}

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 25000,
  globalTimeout: 180000,
  expect: { timeout: 6000 },
  reporter: [["list"]],
  outputDir: "test-results/browser",
  use: {
    baseURL: hostOrigin,
    browserName: "chromium",
    channel: chromeInstalled ? "chrome" : undefined,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    locale: "en-US",
    timezoneId: "UTC",
    serviceWorkers: "block",
    actionTimeout: 6000,
    navigationTimeout: 12000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec tsx scripts/build-test-host.ts && pnpm exec tsx tests/host-server.ts",
    url: `${hostOrigin}/test-host/ready`,
    reuseExistingServer: false,
    timeout: 45000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
