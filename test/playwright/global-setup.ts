import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import type { FullConfig } from '@playwright/test';

async function ensureDirs(): Promise<void> {
  for (const dirPath of [
    '.tmp/junit/backend-playwright',
    '.tmp/playwright/report',
    '.tmp/playwright/test-results',
    '.tmp/playwright/logs',
    '.tmp/playwright/coverage',
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

  // Authentication is intentionally per-test. A global storage state would
  // allow logout, role edits, or session rotation in one test to affect the
  // next test. Keep setup limited to deterministic directories and a base URL
  // preflight; fixtures acquire a fresh CSRF/session pair when needed.
  const require = createRequire(__filename);
  const metadataPath = '.tmp/playwright/logs/run-metadata.json';
  const prepared = await fs.readFile(metadataPath, 'utf8').then(JSON.parse).catch(() => ({}));
  const runId = process.env.PLAYWRIGHT_RUN_ID ?? `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  process.env.PLAYWRIGHT_RUN_ID = runId;
  await fs.writeFile(metadataPath, JSON.stringify({
    ...prepared, runId, browserStartedAt: new Date().toISOString(), baseURL,
    runnerNodeVersion: process.version,
    angularVersion: JSON.parse(await fs.readFile('angular/package.json', 'utf8')).dependencies['@angular/core'],
    playwrightVersion: require('@playwright/test/package.json').version,
    browser: config.projects[0].use.browserName, locale: config.projects[0].use.locale,
    timezoneId: config.projects[0].use.timezoneId, workers: config.workers, retries: config.projects[0].retries,
  }, null, 2));
}

export default globalSetup;
