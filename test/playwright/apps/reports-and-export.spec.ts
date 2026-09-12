import { apiData } from '../helpers/api';
import type { Download } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { PortalApi, type ResourceLedger } from '../fixtures/resources';

async function downloadText(download: Download): Promise<string> {
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function trackReport(api: PortalApi, resources: ResourceLedger, name: string): void {
  resources.track({ kind: 'report', id: name, cleanup: async () => {
    const list = await api.get('admin/report-config');
    const data = await apiData<Array<{ name: string }>>(list);
    if (data.some(report => report.name === name)) {
      expect((await api.mutate('delete', `admin/report-config/${encodeURIComponent(name)}`)).ok()).toBeTruthy();
    }
    const final = await apiData<Array<{ name: string }>>(await api.get('admin/report-config'));
    expect(final.map(report => report.name)).not.toContain(name);
  } });
}

test('A02 selects dates and record type and downloads real JSON and CSV exports', async ({ adminPage, records, resources }) => {
  const type = 'e2e-initialisation-modes';
  const title = resources.name('A02', 'export');
  const record = await records.create(type, { title, translated: 'Owned export content' });
  const excluded = await records.create('e2e-expression-conditions', { title: resources.name('A02', 'out-of-scope') });
  await adminPage.goto('/default/rdmp/export');
  const app = adminPage.locator('export');
  await app.locator('#after').fill('01/01/2020');
  await app.locator('#after').press('Tab');
  await app.locator('#before').fill('31/12/2099');
  await app.locator('#before').press('Tab');
  await app.getByRole('button', { name: 'Toggle Dropdown', exact: true }).click();
  await app.locator('.dropdown-menu a').filter({ hasText: type }).click();
  for (const format of ['json', 'csv'] as const) {
    await app.getByLabel(format.toUpperCase(), { exact: true }).check();
    const pending = adminPage.waitForEvent('download');
    await app.locator('button').filter({ hasText: type }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    const url = new URL(download.url());
    expect(url.searchParams.get('recType')).toBe(type);
    expect(url.searchParams.get('after')).toContain('2019-12-31T14:00:00');
    expect(url.searchParams.get('before')).toContain('2099-12-31T13:59:59');
    const text = await downloadText(download);
    expect(text).not.toContain(excluded.oid);
    expect(text).not.toContain(excluded.metadata.title as string);
    if (format === 'json') {
      const exported = JSON.parse(text) as { recordType: string; records: Array<{ redboxOid: string; metadata: { title: string } }> };
      expect(exported.recordType).toBe(type);
      expect(exported.records).toContainEqual(expect.objectContaining({ redboxOid: record.oid, metadata: expect.objectContaining({ title }) }));
    } else {
      expect(text.split(/\r?\n/, 1)[0]).toContain('"metadata.title"');
      expect(text).toContain(`"${title}"`);
      expect(text).toContain(record.oid);
    }
  }
});

test('A04 filters a real report to owned records, changes its result set and downloads the filtered CSV', async ({ adminPage, records, resources, diagnostics }) => {
  const prefix = resources.name('A04', 'report');
  const first = await records.create('rdmp', { title: `${prefix} Alpha` });
  const second = await records.create('rdmp', { title: `${prefix} Beta` });
  await adminPage.goto('/default/rdmp/admin/report/rdmpRecords');
  const app = adminPage.locator('report');
  const titleFilter = app.getByLabel('Filter by title', { exact: true });
  await titleFilter.fill(prefix);
  await app.locator('a.btn').filter({ hasText: /^\s*Filter\s*$/ }).click();
  const table = app.locator('record-table');
  await expect(table.getByRole('link', { name: first.metadata.title as string, exact: true })).toHaveAttribute('href', new RegExp(`/record/view/${first.oid}$`));
  await expect(table.getByRole('link', { name: second.metadata.title as string, exact: true })).toBeVisible();
  await titleFilter.fill(`${prefix} Alpha`);
  await app.locator('a.btn').filter({ hasText: /^\s*Filter\s*$/ }).click();
  await expect(table.getByRole('link', { name: second.metadata.title as string, exact: true })).toHaveCount(0);
  await expect(table.getByRole('link', { name: first.metadata.title as string, exact: true })).toBeVisible();
  const pending = adminPage.waitForEvent('download');
  const csvLink = app.getByRole('link', { name: /CSV/ });
  diagnostics.expectFailure({ kind: 'requestfailed', method: 'GET',
    url: new URL((await csvLink.getAttribute('href'))!, adminPage.url()).href,
    message: 'net::ERR_ABORTED', count: 1,
    reason: 'Chromium hands this navigation to the CSV download; its completed contents are verified below.' });
  await csvLink.click();
  const csv = await downloadText(await pending);
  expect(csv).toContain(`${prefix} Alpha`);
  expect(csv).not.toContain(`${prefix} Beta`);
  await titleFilter.fill(`${prefix} no match`);
  await app.locator('a.btn').filter({ hasText: /^\s*Filter\s*$/ }).click();
  await expect(table.locator('tbody tr')).toHaveCount(0);
});

test('A05 creates a report with filters and columns, previews real data, reopens edits and deletes it', async ({ adminPage, adminCsrfToken, records, resources }) => {
  const name = resources.name('A05', 'report');
  const title = resources.name('A05', 'record');
  await records.create('rdmp', { title });
  const api = new PortalApi(adminPage.request, adminCsrfToken);
  await adminPage.goto('/default/rdmp/admin/reports');
  const app = adminPage.locator('report-config');
  await app.getByRole('button', { name: /Create report/i }).click();
  const modal = app.getByRole('dialog');
  await modal.locator('#report-name').fill(name);
  await modal.locator('#report-title').fill(name);
  await modal.locator('#report-named-query').selectOption('listRDMPRecords');
  await modal.getByRole('button', { name: /Add filter/i }).click();
  const filters = modal.locator('fieldset').filter({ has: adminPage.locator('legend', { hasText: /^Filters$/ }) });
  const filterInputs = filters.locator('tbody input');
  await filterInputs.nth(0).fill('title');
  await filterInputs.nth(1).fill('title');
  await filterInputs.nth(2).fill('Owned title');
  await modal.getByRole('button', { name: /Add column/i }).click();
  const columns = modal.locator('fieldset').filter({ has: adminPage.locator('legend', { hasText: /^Columns$/ }) });
  await columns.locator('tbody input').nth(0).fill('Title');
  await columns.locator('tbody input').nth(1).fill('title');
  const previewFilters = modal.locator('fieldset').filter({ has: adminPage.locator('legend', { hasText: /Preview filters/i }) });
  await previewFilters.getByRole('textbox').fill(title);
  await modal.getByRole('button', { name: /Preview$/ }).click();
  await expect(modal.locator('.alert-info')).toContainText(/1/);
  const pending = adminPage.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/admin/report-config'));
  await modal.getByRole('button', { name: /Save/i }).click();
  const created = await pending;
  const body = await apiData<{ name?: string }>(created);
  if (body.name) trackReport(api, resources, body.name);
  expect(created.ok()).toBeTruthy();
  expect(body.name).toBe(name);
  await expect(modal).toHaveCount(0);
  await adminPage.reload();
  await app.getByRole('searchbox').fill(name);
  const row = app.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: /Edit/i }).click();
  await expect(modal.locator('#report-name')).toBeDisabled();
  await expect(filterInputs.nth(2)).toHaveValue('Owned title');
  await expect(columns.locator('tbody input').nth(1)).toHaveValue('title');
  await modal.locator('#report-title').fill(`${name} edited`);
  await modal.getByRole('button', { name: /Save/i }).click();
  await expect(modal).toHaveCount(0);
  await adminPage.reload();
  await app.getByRole('searchbox').fill(name);
  await expect(row).toContainText(`${name} edited`);
  adminPage.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: /Delete/i }).click();
  await expect(row).toHaveCount(0);
  await adminPage.reload();
  await app.getByRole('searchbox').fill(name);
  await expect(row).toHaveCount(0);
});
