import { defineConfig } from '@playwright/test';

const junitOutputFile = '.tmp/junit/backend-playwright/backend-playwright.xml';

export default defineConfig({
  testDir: './test/playwright',
  globalSetup: './test/playwright/global-setup.ts',
  timeout: 60_000,
  expect: {
    timeout: 30_000
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  outputDir: '.tmp/playwright/test-results',
  reporter: [
    ['list'],
    ['junit', { outputFile: junitOutputFile }],
    ['html', { open: 'never', outputFolder: '.tmp/playwright/report' }]
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:1500',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: {
      width: 1440,
      height: 960
    }
  }
});
