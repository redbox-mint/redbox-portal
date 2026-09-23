import fs from 'node:fs/promises';
import { test as base, expect, type Page } from '@playwright/test';
import { BrowserDiagnostics } from './diagnostics';
import { assertAuthenticated, loginWithCsrf } from './auth';
import { PortalApi, ResourceLedger } from './resources';
import { PlaywrightStubs, installExternalAssetStubs } from './stubs';
import { captureSetting, restoreSetting, verifySetting, type CapturedSetting } from './settings';
import { createRecord, readRecord, updateRecord, type OwnedRecord } from '../helpers/records';

type Fixtures = {
  diagnostics: BrowserDiagnostics;
  adminPage: Page;
  adminCsrfToken: string;
  resources: ResourceLedger;
  stubs: PlaywrightStubs;
  settings: {
    capture: (path: string) => Promise<CapturedSetting>;
    restore: (setting: CapturedSetting) => Promise<void>;
    verify: (setting: CapturedSetting) => Promise<void>;
  };
  records: {
    create: (recordType: string, metadata: Record<string, unknown>) => Promise<OwnedRecord>;
    read: (oid: string) => ReturnType<typeof readRecord>;
    update: (oid: string, etag: string, metadata: Record<string, unknown>) => ReturnType<typeof updateRecord>;
  };
};

export const test = base.extend<Fixtures>({
  diagnostics: [
    async ({ page, browser }, use, testInfo) => {
      const metadataPath = '.tmp/playwright/logs/run-metadata.json';
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
      await fs.writeFile(metadataPath, JSON.stringify({ ...metadata, browserVersion: browser.version() }, null, 2));
      const diagnostics = new BrowserDiagnostics(page.context(), testInfo);
      diagnostics.attach(page);
      await installExternalAssetStubs(page.context());
      await use(diagnostics);
      await diagnostics.flush();
    },
    { auto: true },
  ],
  adminPage: async ({ page, diagnostics, adminCsrfToken }, use) => {
    void diagnostics;
    void adminCsrfToken;
    await assertAuthenticated(page);
    await use(page);
  },
  adminCsrfToken: async ({ page }, use) => {
    await use(await loginWithCsrf(page));
  },
  resources: async ({}, use, testInfo) => {
    const resources = new ResourceLedger(testInfo.testId);
    await use(resources);
    try {
      await resources.cleanup();
    } catch (error) {
      await fs.mkdir('.tmp/playwright', { recursive: true });
      await fs.writeFile('.tmp/playwright/cleanup-failed.json', JSON.stringify({ testId: testInfo.testId, resources: resources.snapshot() }, null, 2));
      throw error;
    } finally {
      await testInfo.attach('owned-resources.json', { body: JSON.stringify(resources.snapshot(), null, 2), contentType: 'application/json' });
    }
  },
  stubs: [async ({ page }, use, testInfo) => {
    if (await fs.access('.tmp/playwright/cleanup-failed.json').then(() => true, () => false))
      throw new Error('A fixture cleanup failed. Reset the disposable Playwright stack before running another test.');
    const stubs = new PlaywrightStubs(page.context().request);
    await stubs.reset();
    try {
      await use(stubs);
    } finally {
      const requests = await stubs.requests();
      await testInfo.attach('stub-requests.json', { body: JSON.stringify(requests, null, 2), contentType: 'application/json' });
      await stubs.reset();
      const unexpected = requests.filter(request => !request.matched || !request.completed);
      if (unexpected.length) throw new Error(`Unexpected or unfinished stub requests: ${JSON.stringify(unexpected)}`);
    }
  }, { auto: true }],
  settings: async ({ page, adminCsrfToken }, use) => {
    const request = page.context().request;
    await use({
      capture: path => captureSetting(request, path),
      restore: setting => restoreSetting(request, setting, adminCsrfToken),
      verify: setting => verifySetting(request, setting),
    });
  },
  records: async ({ adminPage, adminCsrfToken, resources }, use) => {
    const api = new PortalApi(adminPage.context().request, adminCsrfToken);
    await use({
      create: (recordType, metadata) => createRecord(adminPage, adminCsrfToken, resources, recordType, metadata),
      read: oid => readRecord(api, oid),
      update: (oid, etag, metadata) => updateRecord(api, oid, etag, metadata),
    });
  },
});

export { expect };
