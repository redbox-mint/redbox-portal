import { defineConfig } from '@playwright/test';

if (process.env.PUBLICATION_VOCABULARY_ACCEPTANCE !== 'disposable' || !process.env.PLAYWRIGHT_BASE_URL)
  throw new Error('Run vocabulary acceptance only against an explicitly configured disposable portal.');
export default defineConfig({
  testDir: '../../test/acceptance/publication-vocabulary',
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 30000 },
  outputDir: '../../.tmp/pub24-playwright',
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    headless: true,
    launchOptions: { executablePath: process.env.CHROME_BIN, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    locale: 'en-AU',
    timezoneId: 'UTC',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
