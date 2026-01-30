
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8788';
const useWrangler = process.env.PLAYWRIGHT_USE_WRANGLER !== 'false';
const webServerCommand = useWrangler
  ? 'npx wrangler pages dev frontend/dist --port 8788'
  : 'npm run dev --prefix frontend';
const storageStatePath = 'e2e/.auth/admin.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*auth\.setup\.js/,
    },
    {
      name: 'chromium',
      testIgnore: /.*login\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: storageStatePath },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-unauth',
      testMatch: /.*login\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
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
