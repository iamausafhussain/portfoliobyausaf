import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the admin, run against demo mode (in-memory backend, no Supabase).
 *   npm run test:e2e
 * Set PW_CHROMIUM to a Chromium binary to skip Playwright's own browser download.
 */
const executablePath = process.env.PW_CHROMIUM || undefined;
const PORT = 5176;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // drag-and-drop timing can wobble under heavy parallel load; retried tests are reported as flaky
  retries: 1,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  outputDir: 'tests/e2e/.results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx vite --mode demo --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
