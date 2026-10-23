import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';
const root = path.resolve(__dirname, '../..');
export default defineConfig(base, {
  testDir: path.join(root, 'packages/redbox-core/test/browser'),
  globalSetup: path.join(root, 'test/playwright/global-setup.ts'),
  outputDir: path.join(root, '.tmp/playwright/test-results'),
  reporter: [
    ['list'],
    [path.join(root, 'test/playwright/coverage/reporter.ts')],
    ['junit', { outputFile: path.join(root, '.tmp/junit/backend-playwright/backend-playwright.xml') }],
    ['html', { open: 'never', outputFolder: path.join(root, '.tmp/playwright/report') }],
  ],
});
