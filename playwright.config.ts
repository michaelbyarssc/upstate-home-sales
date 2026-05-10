import { defineConfig, devices } from '@playwright/test';

/**
 * Phase I follow-up — minimal e2e suite.
 *
 * Targets the production deployment by default. To run against a local
 * dev server, set `PLAYWRIGHT_BASE_URL=http://localhost:3000`.
 *
 * Scope: smoke tests for the public-facing surface only. We don't try to
 * cover authenticated admin flows here — those need real Supabase auth and
 * test-fixture seed data, which is its own follow-up.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://upstatehomecenter.com',
    trace: 'on-first-retry',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
