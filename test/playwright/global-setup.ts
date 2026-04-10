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
    await page.locator('#adminLoginShow').waitFor({ state: 'visible', timeout: 30_000 });

    const loginResponse = await context.request.post('/user/login_local', {
      form: {
        username: 'admin',
        password: 'rbadmin'
      },
      headers: {
        'x-source': 'jsclient'
      }
    });

    if (!loginResponse.ok()) {
      throw new Error(`Admin login request failed with ${loginResponse.status()} ${loginResponse.statusText()}.`);
    }

    const loginResult = await loginResponse.json() as { user?: { username?: string }, message?: string };
    if (loginResult.user?.username !== 'admin') {
      throw new Error(`Admin login did not establish the expected session. Response message: ${loginResult.message ?? 'none'}`);
    }

    await page.goto('/default/rdmp/admin', { waitUntil: 'domcontentloaded' });
    await page.locator('.admin-main-content').waitFor({ state: 'visible', timeout: 30_000 });
    await context.storageState({ path: adminStorageStatePath });
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;
