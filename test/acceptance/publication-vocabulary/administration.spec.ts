import { test, expect, type Page } from '@playwright/test';
import { loginWithCsrf } from '../../playwright/fixtures/auth';

const adminPath = '/default/rdmp/admin/integrations/figshare/vocabularies';
const apiHeaders = { 'X-ReDBox-Api-Version': '2.0' };
const sessionPath = '/default/rdmp/publication-vocabularies';
const localVocabularyId = '2123456789abcdef01234567';
const legacyCrosswalkId = '0123456789abcdef01234567';
let csrf: string;
let sharedCrosswalkId = '';
const namespace = 'https://example.org/PUB24';
const uri = 'https://example.org/subject/Math';
const targetId = `${encodeURIComponent(namespace)}:${encodeURIComponent(uri)}`;
const snapshot = {
  provider: 'acceptance',
  scope: 'public',
  catalogueId: 'pub24-subjects',
  namespace,
  displayName: 'PUB24 Subjects',
  terms: [
    { value: uri, sourceId: 'MathCase', label: 'Mathematics URI', selectable: true },
    { value: 'opaque:MixedCase', sourceId: 'MixedCase', label: 'Opaque subject', selectable: true },
  ],
};
async function open(page: Page) {
  await page.goto(adminPath);
  await expect(
    page.getByRole('heading', { name: 'Publication vocabularies and crosswalks', exact: true })
  ).toBeVisible();
}
async function getCrosswalk(page: Page, id: string) {
  const response = await page.request.get(`${sessionPath}/crosswalks/${id}`, { headers: apiHeaders });
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  csrf = await loginWithCsrf(page);
});

if (process.env.PUB24_EXPECT_LEGACY === 'true') {
  test('disabled administration retains the existing Figshare page, links and CSRF-backed API', async ({ page }) => {
    await page.goto(adminPath);
    await expect(
      page.getByRole('heading', { name: 'Figshare vocabularies and crosswalks', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Figshare source', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sync history', exact: true })).toBeVisible();
    await expect(page.locator('publication-vocabulary-admin')).toHaveCount(0);
    expect((await page.request.get(`${sessionPath}/capabilities`, { headers: apiHeaders })).status()).toBe(404);
    expect((await page.request.get('/default/rdmp/api/figshare-crosswalks', { headers: apiHeaders })).status()).toBe(
      200
    );
    await expect(page.locator('.admin-sidebar a[href$="/admin/integrations/figshare/vocabularies"]')).toHaveCount(1);
  });
} else {
  test('enforces current-brand access and CSRF through the actual API pipeline', async ({ page, playwright }) => {
    await open(page);
    const capabilities = await page.request.get(`${sessionPath}/capabilities`, { headers: apiHeaders });
    expect(capabilities.status()).toBe(200);
    expect((await capabilities.json()).data.approve).toBe(true);
    const foreign = await page.request.get(`${sessionPath}/crosswalks/foreign-crosswalk/local-entries`, {
      headers: apiHeaders,
    });
    expect(foreign.status()).toBe(404);
    const sources = (await (await page.request.get(`${sessionPath}/sources`, { headers: apiHeaders })).json()).data;
    expect(sources.some((source: { displayName: string }) => source.displayName === 'FOREIGN SOURCE')).toBe(false);
    await expect(page.getByText('FOREIGN SOURCE', { exact: true })).toHaveCount(0);
    const body = { name: 'Invalid CSRF', localVocabularyId, sourceId: 'missing' };
    expect(
      (
        await page.request.post('/default/rdmp/api/publication-vocabularies/crosswalks', {
          data: body,
          headers: { ...apiHeaders, 'X-CSRF-Token': csrf },
        })
      ).status()
    ).toBe(403);
    expect((await page.request.post(`${sessionPath}/crosswalks`, { data: body, headers: apiHeaders })).status()).toBe(
      403
    );
    expect(
      (
        await page.request.post(`${sessionPath}/crosswalks`, {
          data: body,
          headers: { ...apiHeaders, 'X-CSRF-Token': csrf },
        })
      ).status()
    ).toBe(404);
    const invalidTarget = await page.request.post(`${sessionPath}/sources/import`, {
      headers: { ...apiHeaders, 'X-CSRF-Token': csrf },
      data: { ...snapshot, importId: 'invalid-numeric', terms: [{ ...snapshot.terms[0], value: 42 }] },
    });
    expect(invalidTarget.status()).toBe(400);
    const guest = await playwright.request.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
    try {
      const response = await guest.get(`${sessionPath}/capabilities`, { maxRedirects: 0 });
      expect([302, 401, 403]).toContain(response.status());
    } finally {
      await guest.dispose();
    }
  });
  test('revisits migrated approvals, retired targets and original import attribution at the legacy URL', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('button', { name: 'Import history', exact: true }).click();
    await expect(page.getByText('original-importer', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Crosswalks', exact: true }).click();
    await page
      .getByRole('row')
      .filter({ hasText: 'PUB24 Legacy crosswalk' })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await page.getByRole('combobox', { name: 'Revision', exact: true }).selectOption({ index: 0 });
    await expect(page.locator('dd').filter({ hasText: 'departed-approver' })).toBeVisible();
    await expect(page.getByText('Historical', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove mapping', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve working revision', exact: true })).toHaveCount(0);
    expect((await getCrosswalk(page, legacyCrosswalkId)).revisions[0].approvedBy).toBe('departed-approver');
    await page.getByRole('button', { name: 'Back to crosswalks', exact: true }).click();
    await page.getByRole('button', { name: 'Figshare import history', exact: true }).click();
    await expect(page.getByText('original-importer', { exact: true })).toBeVisible();
    const alias = await page.request.get(`/default/rdmp/api/figshare-crosswalks/${legacyCrosswalkId}`, {
      headers: apiHeaders,
    });
    expect(alias.status()).toBe(200);
  });
  test('imports URI/opaque terms, saves a draft and explicitly approves it without changing IDs after reload', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('button', { name: 'Import source', exact: true }).click();
    await page.getByLabel('Catalogue snapshot (JSON)', { exact: true }).fill(JSON.stringify(snapshot));
    await page.getByRole('button', { name: 'Review snapshot', exact: true }).click();
    await page.getByRole('button', { name: 'Import reviewed snapshot', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Source imported' })).toBeVisible();
    await page.getByRole('button', { name: 'Crosswalks', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('PUB24 URI mappings');
    await page.getByRole('combobox', { name: 'Local vocabulary', exact: true }).selectOption(localVocabularyId);
    await page
      .getByRole('combobox', { name: 'Target source', exact: true })
      .last()
      .selectOption({ label: 'PUB24 Subjects · acceptance · public · pub24-subjects' });
    await page.getByRole('button', { name: 'Create crosswalk', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PUB24 URI mappings', exact: true })).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Local term', exact: true })
      .selectOption({ label: 'Case code · CaseSensitive · CaseSensitive, urn:local:case' });
    await page.getByRole('combobox', { name: 'Target term', exact: true }).selectOption(targetId);
    await page.getByRole('button', { name: 'Add mapping', exact: true }).click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft mappings saved' })).toBeVisible();
    const summaries = (await (await page.request.get(`${sessionPath}/crosswalks`, { headers: apiHeaders })).json())
      .data;
    sharedCrosswalkId = summaries.find((row: { name: string }) => row.name === 'PUB24 URI mappings').id;
    const draft = await getCrosswalk(page, sharedCrosswalkId);
    expect(draft.approvedRevision).toBeUndefined();
    expect(draft.revisions[0].mappings[0].targetId).toBe(targetId);
    expect(draft.revisions[0].entries.find((entry: { value: string }) => entry.value === 'CaseSensitive')).toBeTruthy();
    await page.getByRole('button', { name: 'Approve working revision', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Approved$/ })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Crosswalks', exact: true }).click();
    await page
      .getByRole('row')
      .filter({ hasText: 'PUB24 URI mappings' })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await expect(page.getByRole('cell', { name: /Mathematics URI/ })).toBeVisible();
    const approved = await getCrosswalk(page, sharedCrosswalkId);
    expect(approved.approvedRevision).toBe(1);
    await page
      .getByRole('combobox', { name: 'Target term', exact: true })
      .selectOption({ label: 'Opaque subject · opaque:MixedCase · MixedCase' });
    await page
      .getByRole('combobox', { name: 'Local term', exact: true })
      .selectOption({ label: 'Case code · CaseSensitive · CaseSensitive, urn:local:case' });
    await page.getByRole('button', { name: 'Add mapping', exact: true }).click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Draft mappings saved' })).toBeVisible();
    const newer = await getCrosswalk(page, sharedCrosswalkId);
    expect(newer.workingRevision).toBe(2);
    expect(newer.approvedRevision).toBe(1);
    expect(newer.revisions[0]).toEqual(approved.revisions[0]);
    await page.getByRole('combobox', { name: 'Revision', exact: true }).selectOption({ index: 0 });
    await expect(page.getByRole('cell', { name: /Opaque subject/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove mapping', exact: true })).toHaveCount(0);
  });
  test('refuses a stale editor save and retains the last approval and local edits', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Crosswalks', exact: true }).click();
    await page
      .getByRole('row')
      .filter({ hasText: 'PUB24 URI mappings' })
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    const current = await getCrosswalk(page, sharedCrosswalkId);
    const working = current.revisions.find(
      (revision: { revision: number }) => revision.revision === current.workingRevision
    );
    const saved = await page.request.put(`${sessionPath}/crosswalks/${sharedCrosswalkId}/mappings`, {
      headers: { ...apiHeaders, 'X-CSRF-Token': csrf },
      data: { version: current.version, mappings: working.mappings },
    });
    expect(saved.status()).toBe(200);
    await page.getByRole('button', { name: 'Remove mapping', exact: true }).first().click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('The source or crosswalk changed');
    await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toBeVisible();
    const after = await getCrosswalk(page, sharedCrosswalkId);
    expect(after.approvedRevision).toBe(1);
    expect(after.revisions[0]).toEqual(current.revisions[0]);
    expect(after.version).toBe(current.version + 1);
  });
  test('keeps the existing AppConfig navigation and Figshare-compatible selection', async ({ page }) => {
    await page.goto('/default/rdmp/admin/appconfig/edit/figsharePublishing');
    await expect(page.locator('app-config')).toBeVisible();
    const editor = page.locator('formly-value-binding-editor-type').filter({ hasText: 'Field Key: title' }).first();
    await editor.locator('.binding-header').click();
    await editor.getByLabel('Binding Type', { exact: true }).selectOption('crosswalk');
    await editor.getByLabel('Source Vocabulary', { exact: true }).selectOption(localVocabularyId);
    const picker = editor.getByLabel('Approved crosswalk', { exact: true });
    await picker.selectOption(legacyCrosswalkId);
    await expect(picker).toHaveValue(legacyCrosswalkId);
    await expect(picker.getByRole('option', { name: /PUB24 URI mappings/ })).toHaveCount(0);
    await expect(editor.getByLabel('Output', { exact: true })).toHaveValue('categoryId');
    await expect(editor.getByText(/approved revision 1/)).toBeVisible();

    await expect(page.locator('a[href$="/admin/integrations/figshare/vocabularies"]').first()).toBeAttached();
    const response = await page.request.get('/default/rdmp/appconfig/form/figsharePublishing', { headers: apiHeaders });
    expect(response.status()).toBe(200);
    await page.goto(adminPath);
    await expect(page.locator('publication-vocabulary-admin')).toBeVisible();
  });

  test('shows a reload message when the shared administration bundle cannot load', async ({ page }) => {
    let blocked = false;
    const bundles = '**/angular/admin-figshare-vocabulary/**/chunk-*.js';
    await page.route(bundles, async route => {
      const response = await route.fetch();
      if ((await response.text()).includes('"publication-vocabulary-admin"')) {
        blocked = true;
        await route.abort('failed');
      } else {
        await route.fulfill({ response });
      }
    });
    await page.goto(adminPath);
    await expect(page.locator('admin-figshare-vocabulary').getByRole('alert')).toHaveText(
      'The request could not be completed. Check your connection and reload before trying again.'
    );
    expect(blocked).toBe(true);
    await expect(page.locator('publication-vocabulary-admin')).toHaveCount(0);
    await page.unroute(bundles);
    await page.reload();
    await expect(page.locator('publication-vocabulary-admin')).toBeVisible();
  });
}
