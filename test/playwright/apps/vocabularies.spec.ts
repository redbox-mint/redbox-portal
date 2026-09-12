import { expect, test } from '../fixtures/test';
import { PortalApi } from '../fixtures/resources';
import { apiData } from '../helpers/api';
import { trackVocabulary } from '../helpers/vocabularies';

test('A08 creates and edits a local vocabulary, imports an RVA tree and confirms persisted entries and deletion', async ({ adminPage, adminCsrfToken, resources, stubs }) => {
  const api = new PortalApi(adminPage.request, adminCsrfToken);
  const name = resources.name('A08', 'local');
  await adminPage.goto('/default/rdmp/admin/vocabulary/manager');
  const app = adminPage.locator('admin-vocabulary');
  await app.getByRole('button', { name: /Create.*vocabulary/i }).click();
  const modal = app.getByRole('dialog');
  await modal.locator('#vocab-name').fill(name);
  await modal.locator('#vocab-slug').fill(name);
  await modal.locator('#vocab-description').fill('Owned local vocabulary');
  await modal.getByRole('button', { name: /Add entry/i }).click();
  await modal.locator('tbody tr').first().locator('input').nth(0).fill('Coastal ecology');
  await modal.locator('tbody tr').first().locator('input').nth(1).fill('coast');
  const pending = adminPage.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/vocabulary'));
  await modal.getByRole('button', { name: /Save/i }).click();
  const response = await pending;
  const created = await apiData<{ id?: string }>(response);
  if (created.id) trackVocabulary(api, resources, created.id);
  expect(response.ok()).toBeTruthy();
  expect(created.id).toBeTruthy();
  await expect(modal).toHaveCount(0);
  await adminPage.reload();
  await app.getByRole('searchbox').fill(name);
  const row = app.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: /Edit/i }).click();
  await expect(modal.locator('tbody input').nth(0)).toHaveValue('Coastal ecology');
  await modal.locator('tbody input').nth(0).fill('Coastal systems');
  await modal.getByRole('button', { name: /Save/i }).click();
  await expect(modal).toHaveCount(0);
  await adminPage.reload();
  await app.getByRole('searchbox').fill(name);
  await row.getByRole('button', { name: /Edit/i }).click();
  await expect(modal.locator('tbody input').nth(0)).toHaveValue('Coastal systems');
  await modal.getByRole('button', { name: /Cancel/i }).click();
  await row.getByRole('button', { name: /Delete/i }).click();
  await app.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /Delete/i }).click();
  await app.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);

  const importedName = resources.name('A08', 'rva');
  const rvaId = String(Date.now());
  const versionId = String(Number(rvaId) + 1);
  await stubs.responses({
    [`GET /rva/api/resource/vocabularies/${rvaId}`]: { body: { id: Number(rvaId), title: importedName, slug: importedName, version: [{ id: Number(versionId), status: 'current' }] } },
    [`GET /rva/api/resource/versions/${versionId}/versionArtefacts/conceptTree`]: { body: [{ id: 'science', label: 'Science', notation: '100', children: [{ id: 'ecology', label: 'Ecology', notation: '101' }] }] },
  });
  await app.getByRole('button', { name: /Import from RVA/i }).click();
  await modal.locator('#rva-id').fill(rvaId);
  const importing = adminPage.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/vocabulary/import'));
  await modal.getByRole('button', { name: 'Import', exact: true }).click();
  const importResponse = await importing;
  const imported = await apiData<{ id?: string }>(importResponse);
  if (imported.id) trackVocabulary(api, resources, imported.id);
  expect(importResponse.ok()).toBeTruthy();
  expect(imported.id).toBeTruthy();
  await expect(modal).toHaveCount(0);
  expect((await stubs.requests()).filter(request => request.path === `/rva/api/resource/vocabularies/${rvaId}`)).toHaveLength(1);
  await adminPage.reload();
  await app.getByRole('searchbox').fill(importedName);
  await app.getByRole('row').filter({ hasText: importedName }).getByRole('button', { name: /Edit/i }).click();
  await expect(modal.locator('#vocab-source')).toHaveValue('rva');
  await expect(modal.locator('#vocab-type')).toHaveValue('tree');
  await expect(modal.locator('tbody tr')).toHaveCount(2);
  await modal.getByRole('button', { name: /Show tree preview/i }).click();
  await expect(modal.locator('.tree-preview-list').first()).toContainText('Science');
  await expect(modal.locator('.tree-preview-list').first()).toContainText('Ecology');
});

type FigshareApply = { runId: string; state: string; sourceId: string; vocabularyId: string; localVocabularyId: string | null; crosswalkId: string | null; categories: { created: number }; mappings: { created: number } };

test('A09 recovers catalogue failure, previews and applies a crosswalk, edits mappings and approves the saved revision', async ({ adminPage, adminCsrfToken, resources, settings, stubs, diagnostics }) => {
  const api = new PortalApi(adminPage.request, adminCsrfToken);
  const original = await settings.capture('/default/rdmp/api/appconfig/figsharePublishing');
  resources.track({ kind: 'figshare-settings-restoration', id: original.path, cleanup: async () => {
    await settings.restore(original);
    await settings.verify(original);
  } });
  const config = structuredClone(original.value) as { connection: { baseUrl: string; token: string; retry: { maxAttempts: number } } };
  config.connection.baseUrl = `${process.env.PLAYWRIGHT_PORTAL_STUB_URL ?? 'http://playwright-stubs:8787'}/figshare`;
  config.connection.token = '';
  config.connection.retry.maxAttempts = 1;
  expect((await api.mutate('post', original.path, config)).ok()).toBeTruthy();
  const taxonomy = Date.now();
  const name = resources.name('A09', 'clone');
  const categories = [
    { id: taxonomy + 1, title: 'Coastal ecology', source_id: '101', taxonomy_id: taxonomy, is_selectable: true, parent_id: 0 },
    { id: taxonomy + 2, title: 'Forest ecology', source_id: '102', taxonomy_id: taxonomy, is_selectable: true, parent_id: 0 },
  ];
  await stubs.responses({ 'GET /figshare/categories': { status: 503, body: { message: 'Intentional regression outage' } } });
  await adminPage.goto('/default/rdmp/admin/integrations/figshare/vocabularies');
  const app = adminPage.locator('admin-figshare-vocabulary');
  await app.getByRole('button', { name: /Add.*source/i }).click();
  const wizard = app.locator('figshare-import-wizard');
  const catalogueUrl = /\/api\/figshare-vocabularies\/catalogues\?scope=public$/;
  diagnostics.expectFailure({ kind: 'response', method: 'GET', url: catalogueUrl, status: 502, count: 1, reason: 'The configured catalogue provider deliberately returns 503 for the recovery check.' });
  diagnostics.expectFailure({ kind: 'console', url: catalogueUrl, message: /Failed to load resource.*502/, count: 1, reason: 'Chromium reports the intentional catalogue gateway failure.' });
  diagnostics.expectFailure({ kind: 'console', url: /angular\/admin-figshare-vocabulary\/browser\/main/, message: /discover|catalogue|502/i, count: 1, reason: 'The editor logs the intentional catalogue discovery failure.' });
  diagnostics.expectFailure({ kind: 'console', url: /angular\/admin-figshare-vocabulary\/browser\/main/, message: /^ReDBox could not connect to Figshare\./, count: 1, reason: 'The wizard logs its user-facing explanation of the intentional provider failure.' });
  await wizard.getByRole('button', { name: /Discover taxonomies/i }).click();
  await expect(wizard.getByRole('alert')).toContainText('ReDBox could not connect to Figshare.');
  await stubs.responses({ 'GET /figshare/categories': { body: categories } });
  await wizard.getByRole('button', { name: /Back/i }).click();
  await wizard.getByRole('button', { name: /Discover taxonomies/i }).click();
  await wizard.locator(`#figshare-taxonomy-${taxonomy}`).check();
  await wizard.getByRole('button', { name: 'Next', exact: true }).click();
  await wizard.getByRole('button', { name: 'Create editable vocabulary', exact: true }).click();
  await wizard.locator('#figshare-clone-name').fill(name);
  await wizard.locator('#figshare-clone-slug').fill(name);
  const previewResponse = adminPage.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/figshare-vocabularies/previews'));
  await wizard.getByRole('button', { name: /Generate preview/i }).click();
  const previewResult = await previewResponse;
  const preview = await apiData<{ runId?: string; summary: { added: number } }>(previewResult);
  if (preview.runId) resources.track({ kind: 'figshare-preview-history', id: preview.runId, cleanup: async () => {
    expect((await api.get(`api/figshare-vocabularies/previews/${preview.runId}`)).ok()).toBeTruthy();
  } });
  expect(previewResult.ok()).toBeTruthy();
  expect(preview.summary.added).toBe(2);
  const review = app.locator('figshare-sync-preview');
  await expect(review.locator('tbody input[type="checkbox"]')).toHaveCount(2);
  for (const proposal of await review.locator('tbody input[type="checkbox"]').all()) await proposal.check();
  await review.getByRole('button', { name: /^Apply/ }).click();
  const applying = adminPage.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/previews/${preview.runId}/apply`));
  await review.getByRole('alertdialog').getByRole('button', { name: /^Apply/ }).click();
  const appliedResponse = await applying;
  const result = await apiData<FigshareApply>(appliedResponse);
  if (result.sourceId) resources.track({ kind: 'figshare-source-history', id: result.sourceId, cleanup: async () => {
    expect((await api.get(`api/figshare-vocabularies/sources/${result.sourceId}`)).ok()).toBeTruthy();
  } });
  if (result.vocabularyId) resources.track({ kind: 'figshare-mirror-history', id: result.vocabularyId, cleanup: async () => {
    expect((await api.get(`api/vocabulary/${result.vocabularyId}`)).ok()).toBeTruthy();
  } });
  if (result.localVocabularyId) trackVocabulary(api, resources, result.localVocabularyId);
  if (result.crosswalkId) resources.track({ kind: 'figshare-crosswalk', id: result.crosswalkId, cleanup: async () => {
    expect((await api.mutate('delete', `api/figshare-crosswalks/${result.crosswalkId}`)).ok()).toBeTruthy();
  } });
  expect(appliedResponse.ok()).toBeTruthy();
  expect(result).toMatchObject({ state: 'applied', categories: { created: 2 }, mappings: { created: 2 } });
  await app.getByRole('tab', { name: 'Crosswalks', exact: true }).click();
  const row = app.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: /Manage/i }).click();
  const editor = app.locator('figshare-crosswalk-editor');
  await expect(editor.locator('tbody tr')).toHaveCount(2);
  await editor.getByRole('row').filter({ hasText: 'Coastal ecology' }).getByRole('button', { name: /Remove target/i }).click();
  await expect(editor.locator('tbody tr')).toHaveCount(1);
  await editor.getByRole('button', { name: /Approve revision/i }).click();
  await editor.getByRole('alertdialog').getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText(/approved/i);
  await adminPage.reload();
  await app.getByRole('tab', { name: 'Crosswalks', exact: true }).click();
  await row.getByRole('button', { name: /Manage/i }).click();
  await expect(editor.locator('tbody tr')).toHaveCount(1);
  await expect(editor.locator('tbody')).toContainText('Forest ecology');
  expect((await stubs.requests()).filter(request => request.path === '/figshare/categories').length).toBeGreaterThanOrEqual(3);
});
