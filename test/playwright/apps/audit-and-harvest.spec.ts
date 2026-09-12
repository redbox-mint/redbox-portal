import { expect, test } from '../fixtures/test';
import { trackRecord } from '../helpers/records';

test('A07 filters owned audit activity, expands a real changed value and inspects permissions and integration history', async ({ adminPage, records, resources }) => {
  const title = resources.name('A07', 'audit');
  const record = await records.create('e2e-initialisation-modes', { title, translated: 'Before audit change' });
  await records.update(record.oid, record.etag, { title, translated: 'After audit change' });
  await adminPage.goto(`/default/rdmp/record/viewAudit/${record.oid}`);
  const app = adminPage.locator('record-audit');
  const updated = app.locator('tr').filter({ has: adminPage.locator('.rb-action-badge', { hasText: 'Updated' }) });
  await expect(updated).toHaveCount(1);
  await updated.locator('.rb-col-changes button').click();
  await expect(app.locator('.rb-audit-diff-table')).toContainText('Before audit change');
  await expect(app.locator('.rb-audit-diff-table')).toContainText('After audit change');
  await app.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Updated' });
  await app.getByRole('button', { name: /Apply/ }).click();
  await expect(app.locator('.rb-action-badge')).toHaveCount(1);
  await updated.getByRole('button', { name: /Show/ }).click();
  await expect(app).toContainText(record.oid);
  await app.getByRole('link', { name: /Permissions/ }).click();
  await expect(app.locator('.rb-audit-tab')).toContainText('admin');
  await app.getByRole('link', { name: /Integration Audit/ }).click();
  await expect(app.locator('.rb-audit-tab')).toContainText('No records found.');
  await app.getByRole('link', { name: /Audit History/ }).click();
  await app.getByRole('button', { name: /Clear/ }).click();
  await expect(app.locator('.rb-action-badge').filter({ hasText: 'Created' })).toHaveCount(1);
});

type HarvestResult = { run: { id: string; sourceRunId: string; status: string }; chunk: { id: string; created: number; totalProcessed: number } };
type HarvestDetail = { run: HarvestResult['run']; chunks: Array<{ id: string }>; events: Array<{ oid?: string; harvestId: string; outcome: string }> };

test('A16 runs a tracked harvest, filters its source and inspects its chunk, event and resulting record', async ({ adminPage, adminCsrfToken, resources, records }) => {
  const source = resources.name('A16', 'source');
  const harvestId = resources.name('A16', 'record');
  const sourceRunId = resources.name('A16', 'run');
  const response = await adminPage.request.post('/default/rdmp/api/records/harvest/e2e-initialisation-modes', {
    data: {
      records: [{ harvestId, operation: 'upsert', recordRequest: { metadata: { title: harvestId, identifier: harvestId } } }],
      sourceRunId, sourceName: source, finalChunk: true, chunk: { index: 1, label: 'Owned regression chunk' },
    },
    headers: { 'X-CSRF-Token': adminCsrfToken },
  });
  const result = await response.json() as HarvestResult;
  if (result.run?.id) resources.track({ kind: 'harvest-run-history', id: result.run.id, cleanup: async () => {
    expect((await adminPage.request.get(`/default/rdmp/api/harvest-runs/${result.run.id}`)).ok()).toBeTruthy();
  } });
  const seenOids = new Set<string>();
  let detail: HarvestDetail | undefined;
  await expect.poll(async () => {
    const read = await adminPage.request.get(`/default/rdmp/api/harvest-runs/${result.run.id}`);
    if (!read.ok()) throw new Error(`Cannot inspect owned harvest run (${read.status()}).`);
    detail = await read.json() as HarvestDetail;
    for (const event of detail.events ?? []) {
      if (event.oid && !seenOids.has(event.oid)) {
        trackRecord(adminPage.request, adminCsrfToken, resources, event.oid);
        seenOids.add(event.oid);
      }
    }
    return detail.run.status;
  }).toBe('completed');
  expect(response.ok()).toBeTruthy();
  expect(result.chunk).toMatchObject({ created: 1, totalProcessed: 1 });
  expect(seenOids.size).toBe(1);
  const oid = [...seenOids][0];
  expect((await records.read(oid)).body).toMatchObject({ title: harvestId });
  await adminPage.goto('/default/rdmp/admin/harvest-runs');
  const app = adminPage.locator('harvest-runs');
  await app.getByRole('textbox', { name: 'Source', exact: true }).fill(source);
  await app.locator('button[type="submit"]').click();
  const run = app.locator('tr.hr-table__row--selectable').filter({ hasText: source });
  await expect(run).toHaveCount(1);
  await run.click();
  await expect(app).toContainText(sourceRunId);
  await expect(app).toContainText('Owned regression chunk');
  const event = app.getByRole('row').filter({ has: adminPage.getByRole('link', { name: oid, exact: true }) });
  await expect(event).toContainText(harvestId);
  await expect(event).toContainText('created');
  await event.getByRole('link', { name: oid, exact: true }).click();
  await expect(adminPage.locator('redbox-form')).toContainText(harvestId);
});
