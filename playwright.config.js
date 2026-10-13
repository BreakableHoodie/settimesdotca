import { defineConfig, devices } from "@playwright/test";

// Run the WHOLE suite on the app's clock: America/Toronto (#1256).
// The app classifies "today" in Toronto (functions/utils/eventDay.js); specs
// date their fixtures with the runner's clock. On a UTC CI runner those
// disagree from 8 PM to midnight Toronto time, so "today" fixtures land in
// UPCOMING, fill the timeline's LIMIT 10, and public-timeline.spec fails on
// every branch. Two clocks to pin:
// - the Node test runner (fixture dates computed in specs): TZ, set here
//   before any worker spawns, so workers inherit it;
// - the browser (the app's client-side "today"): use.timezoneId below.
// Forced, not defaulted: CI exports TZ=UTC-equivalent, and a ??= would keep it.
process.env.TZ = "America/Toronto";
const APP_TIMEZONE = "America/Toronto";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8788";
const useWrangler = process.env.PLAYWRIGHT_USE_WRANGLER !== "false";
const webServerCommand = useWrangler
  ? "npx wrangler pages dev frontend/dist --port 8788 --binding ENVIRONMENT=development"
  : "npm run dev --prefix frontend";
const storageStatePath = "e2e/.auth/admin.json";
const skipA11yVisual = process.env.PLAYWRIGHT_SKIP_A11Y_VISUAL === "true";

export default defineConfig({
  testDir: "./e2e",
  ...(skipA11yVisual ? { testIgnore: [/accessibility\//, /visual-regression\.spec\.js/] } : {}),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    timezoneId: APP_TIMEZONE,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*auth\.setup\.js/,
    },
    {
      name: "chromium",
      testIgnore: [/.*login\.spec\.js/, ...(skipA11yVisual ? [/accessibility\//, /visual-regression\.spec\.js/] : [])],
      use: { ...devices["Desktop Chrome"], storageState: storageStatePath },
      dependencies: ["setup"],
    },
    {
      name: "chromium-unauth",
      testMatch: /.*login\.spec\.js/,
      use: { ...devices["Desktop Chrome"], storageState: { cookies: [], origins: [] } },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
