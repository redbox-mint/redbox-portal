import { expect, test } from '../fixtures/test';

test('A15 restores one owned record and cancels then confirms permanent deletion of another', async ({ adminPage, records, adminCsrfToken, resources }) => {
  const name = resources.name('A15', 'deleted');
  const restored = await records.create('e2e-initialisation-modes', { title: `${name} restore`, translated: 'Restored content' });
  const purged = await records.create('e2e-initialisation-modes', { title: `${name} purge`, translated: 'Purge content' });
  for (const record of [restored, purged]) {
    const response = await adminPage.request.delete(`/default/rdmp/api/records/metadata/${record.oid}`, {
      headers: { 'X-CSRF-Token': adminCsrfToken, 'If-Match': record.etag },
    });
    expect(response.ok()).toBeTruthy();
  }
  await adminPage.goto('/default/rdmp/admin/deletedRecords');
  const app = adminPage.locator('deleted-records');
  await app.getByLabel('Filter by title', { exact: true }).fill(name);
  await app.locator('a.btn').filter({ hasText: /filter/i }).click();
  const restoreRow = app.getByRole('row').filter({ hasText: `${name} restore` });
  const purgeRow = app.getByRole('row').filter({ hasText: `${name} purge` });
  await expect(restoreRow).toBeVisible();
  await expect(purgeRow).toBeVisible();
  await restoreRow.getByRole('button', { name: /restore/i }).click();
  await expect(restoreRow).toHaveCount(0);
  expect((await records.read(restored.oid)).body).toMatchObject({ title: `${name} restore`, translated: 'Restored content' });
  await purgeRow.getByRole('button', { name: /destroy|permanent/i }).click();
  const modal = app.getByRole('dialog');
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(purgeRow).toBeVisible();
  expect((await adminPage.request.get(`/default/rdmp/record/delete/${purged.oid}`)).ok()).toBeTruthy();
  await purgeRow.getByRole('button', { name: /destroy|permanent/i }).click();
  await modal.getByRole('button', { name: /confirm|delete|destroy/i }).click();
  await expect(purgeRow).toHaveCount(0);
  expect((await adminPage.request.get(`/default/rdmp/record/delete/${purged.oid}`)).status()).toBe(404);
  await adminPage.goto(`/default/rdmp/record/view/${restored.oid}`);
  await expect(adminPage.locator('redbox-form')).toContainText('Restored content');
});
