import { defineConfig } from '@playwright/test';

const junitOutputFile = '.tmp/junit/backend-playwright/backend-playwright.xml';

export default defineConfig({
  testDir: './test/playwright',
  globalSetup: './test/playwright/global-setup.ts',
  timeout: 60_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: '.tmp/playwright/test-results',
  reporter: [
    ['list'],
    ['./test/playwright/coverage/reporter.ts'],
    ['junit', { outputFile: junitOutputFile }],
    ['html', { open: 'never', outputFolder: '.tmp/playwright/report' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:1500',
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_HOST_BROWSER === 'true' ? {
      args: ['--host-resolver-rules=MAP playwright-stubs 127.0.0.1'],
    } : {},
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: {
      width: 1440,
      height: 960,
    },
  },
});
