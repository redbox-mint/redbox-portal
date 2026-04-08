import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';
import { adminStorageStatePath } from './helpers';

async function ensureDirs(): Promise<void> {
  for (const dirPath of [
    '.tmp/junit/backend-playwright',
    '.tmp/playwright/report',
    '.tmp/playwright/test-results',
    path.dirname(adminStorageStatePath)
  ]) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

async function globalSetup(config: FullConfig): Promise<void> {
  await ensureDirs();

  const baseURL = config.projects[0]?.use?.baseURL;
  if (typeof baseURL !== 'string') {
    throw new Error('Playwright baseURL is required for browser smoke tests.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto('/default/rdmp/user/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Login as an administrator' }).click();
    await page.locator('local-auth #username').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('local-auth #username').fill('admin');
    await page.locator('local-auth #password').fill('rbadmin');
    await Promise.all([
      page.waitForURL((url) => !url.pathname.endsWith('/user/login'), { timeout: 30_000 }),
      page.locator('local-auth button[type="submit"]').click()
    ]);
    await page.goto('/default/rdmp/admin', { waitUntil: 'domcontentloaded' });
    await page.locator('.admin-main-content').waitFor({ state: 'visible', timeout: 30_000 });
    await context.storageState({ path: adminStorageStatePath });
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;
