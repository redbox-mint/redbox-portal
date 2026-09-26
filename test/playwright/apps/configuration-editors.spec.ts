import { expect, test } from '../fixtures/test';
import { apiData } from '../helpers/api';
import { PortalApi } from '../fixtures/resources';

test('A10 saves a workflow dashboard column and renders owned records with its settings', async ({ adminPage, adminCsrfToken, resources, records }) => {
  const api = new PortalApi(adminPage.request, adminCsrfToken);
  const record = await records.create('e2e-initialisation-modes', { title: resources.name('A10', 'record') });
  const path = 'admin/dashboard-config/workflows/e2e-initialisation-modes/draft';
  const original = await apiData<{ settings: unknown }>(await api.get(path));
  resources.track({ kind: 'dashboard-settings-restoration', id: path, cleanup: async () => {
    const current = await apiData<{ revision: number }>(await api.get(path));
    const target = { kind: 'workflow', recordType: 'e2e-initialisation-modes', stage: 'draft' };
    const validationResponse = await api.mutate('post', 'admin/dashboard-config/validate', {
      target, expectedRevision: current.revision, settings: original.settings,
    });
    expect(validationResponse.ok()).toBeTruthy();
    const validation = await apiData<{ validationFingerprint: string; warnings: Array<{ id: string }>; errors: unknown[] }>(validationResponse);
    expect(validation.errors).toEqual([]);
    const restored = await api.mutate('put', path, {
      expectedRevision: current.revision,
      settings: original.settings,
      validationFingerprint: validation.validationFingerprint,
      acknowledgedWarningIds: validation.warnings.map(warning => warning.id),
    });
    expect(restored.ok()).toBeTruthy();
    expect((await apiData<{ settings: unknown }>(await api.get(path))).settings).toEqual(original.settings);
  } });
  await adminPage.goto('/default/rdmp/admin/dashboard-config');
  const app = adminPage.locator('dashboard-config-editor');
  await expect(app.locator('.dc-section-heading')).toBeVisible();
  const navFilter = app.getByRole('textbox', { name: 'Filter dashboards' });
  await navFilter.fill('e2e-initialisation-modes');
  await navFilter.press('Tab');
  const target = app.locator('.dc-nav-group').filter({ hasText: 'e2e-initialisation-modes' });
  await target.locator('.dc-nav-item').filter({ hasText: /draft/i }).click();
  await expect(app.locator('.dc-section-heading')).toContainText('e2e-initialisation-modes /');
  const table = app.locator('table-config-editor');
  await table.getByRole('button', { name: /Add Column$/ }).click();
  const column = table.locator('column-detail');
  await column.getByPlaceholder('Display title', { exact: true }).fill('Owned record title');
  await column.locator('input#dc-column-variable').fill('metadata.title');
  await column.locator('textarea').fill('{{metadata.title}}');
  const validation = adminPage.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/admin/dashboard-config/validate'));
  const pending = adminPage.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith('/admin/dashboard-config/workflows/e2e-initialisation-modes/draft'));
  await app.locator('.dc-section-save').click();
  const review = await apiData<{ errors: unknown[]; warnings: Array<{ id: string }> }>(await validation);
  expect(review.errors).toEqual([]);
  if (review.warnings.length) {
    const acknowledgements = app.locator('.dc-finding-warning input[type="checkbox"]');
    await expect(acknowledgements).toHaveCount(review.warnings.length);
    for (let index = 0; index < review.warnings.length; index++) await acknowledgements.nth(index).check();
    await app.locator('.dc-section-save').click();
  }
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  await expect(app.locator('.alert-success')).toContainText('Saved e2e-initialisation-modes /');
  const saved = await apiData<{ settings: { tableConfig: { rowConfig: Array<{ title: string; variable: string; template: string }> } } }>(await api.get(path));
  expect(saved.settings.tableConfig.rowConfig).toContainEqual(expect.objectContaining({
    title: 'Owned record title', variable: 'metadata.title', template: '{{metadata.title}}',
  }));
  await adminPage.reload();
  await expect(app.locator('.dc-section-heading')).toBeVisible();
  await navFilter.fill('e2e-initialisation-modes');
  await navFilter.press('Tab');
  await target.locator('.dc-nav-item').filter({ hasText: /draft/i }).click();
  await expect(app.locator('.dc-section-heading')).toContainText('e2e-initialisation-modes /');
  await table.locator('.dc-column-item').filter({ hasText: 'Owned record title' }).click();
  await expect(column.locator('textarea')).toHaveValue('{{metadata.title}}');
  await adminPage.goto('/default/rdmp/dashboard/e2e-initialisation-modes');
  const dashboard = adminPage.locator('dashboard');
  await expect(dashboard.getByRole('columnheader', { name: /Owned record title/ })).toBeVisible();
  await expect(dashboard.getByRole('cell', { name: record.metadata.title as string, exact: true })).toHaveCount(2);
});

test('A11 creates a parameterised query with nested filters and mappings, verifies results after editing and confirms deletion', async ({ adminPage, adminCsrfToken, resources, records }) => {
  const api = new PortalApi(adminPage.request, adminCsrfToken);
  const name = resources.name('A11', 'query');
  const first = await records.create('e2e-initialisation-modes', { title: `${name} Alpha`, description: name });
  const second = await records.create('e2e-initialisation-modes', { title: `${name} Beta`, description: name });
  const excluded = await records.create('e2e-initialisation-modes', { title: `${name} Excluded`, description: name });
  await records.create('e2e-initialisation-modes', { title: `${name} Other scope`, description: 'Different query scope' });
  const query = { $and: [{ 'metaMetadata.type': 'e2e-initialisation-modes' }, { 'metadata.title': { $ne: excluded.metadata.title as string } }] };
  const execute = async () => {
    const response = await api.get(`api/report/namedQuery?queryName=${encodeURIComponent(name)}`);
    expect(response.ok()).toBeTruthy();
    return apiData<{ records: Array<{ oid: string; metadata: { title: string } }>; summary: { numFound: number } }>(response);
  };
  await adminPage.goto('/default/rdmp/admin/named-query');
  const app = adminPage.locator('named-query-editor');
  await app.getByRole('button', { name: /Create.*query/i }).click();
  const modal = app.getByRole('dialog');
  await modal.locator('#nq-name').fill(name);
  await modal.locator('#nq-collection').selectOption('record');
  await modal.getByRole('tab', { name: /Mongo/ }).click();
  const mongo = modal.locator('mongo-query-editor');
  await mongo.getByRole('checkbox').check();
  await mongo.locator('textarea').fill(JSON.stringify(query));
  await mongo.getByRole('button', { name: /Apply JSON/i }).click();
  await modal.getByRole('tab', { name: 'Parameters', exact: true }).click();
  const params = modal.locator('query-param-editor');
  await params.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await params.getByPlaceholder('param name', { exact: true }).fill('scope');
  await params.getByPlaceholder('e.g. metadata.title', { exact: true }).fill('metadata.description');
  await params.getByRole('combobox').nth(2).selectOption('defaultValue');
  await params.locator('.card-body input:not([placeholder])').fill(name);
  await params.getByRole('button', { name: 'Add', exact: true }).click();
  await modal.getByRole('tab', { name: /Mappings/ }).click();
  const mappings = modal.locator('result-mapping-editor');
  await mappings.locator('.nq-add-row input').nth(0).fill('title');
  await mappings.locator('.nq-add-row input').nth(1).fill('{{record.metadata.title}}');
  await mappings.getByRole('button', { name: 'Add', exact: true }).click();
  await modal.getByRole('tab', { name: /Sort.*Filters/ }).click();
  const sort = modal.locator('sort-editor');
  await sort.locator('.nq-add-row input').fill('lastSaveDate');
  await sort.locator('.nq-add-row select').selectOption('DESC');
  await sort.getByRole('button', { name: 'Add', exact: true }).click();
  const pending = adminPage.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/named-query'));
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await pending;
  const data = await apiData<{ name?: string }>(response);
  if (data?.name) resources.track({ kind: 'named-query', id: data.name, cleanup: async () => {
    const list = await apiData<Array<{ name: string }>>(await api.get('api/named-query'));
    if (list.some(query => query.name === name)) expect((await api.mutate('delete', `api/named-query/${name}`)).ok()).toBeTruthy();
    const final = await apiData<Array<{ name: string }>>(await api.get('api/named-query'));
    expect(final.map(query => query.name)).not.toContain(name);
  } });
  expect(response.ok()).toBeTruthy();
  expect(data.name).toBe(name);
  await expect(modal).toHaveCount(0);
  const initialResults = await execute();
  expect(initialResults.summary.numFound).toBe(2);
  expect(initialResults.records.map(record => record.oid).sort()).toEqual([first.oid, second.oid].sort());
  expect(initialResults.records.map(record => record.metadata.title)).toEqual([second.metadata.title, first.metadata.title]);
  await adminPage.reload();
  await app.locator('#named-query-search').fill(name);
  const row = app.getByRole('row').filter({ hasText: name });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(modal.locator('#nq-name')).toHaveAttribute('readonly', '');
  await modal.getByRole('tab', { name: /Mongo/ }).click();
  await mongo.getByRole('checkbox').check();
  expect(JSON.parse(await mongo.locator('textarea').inputValue())).toEqual(query);
  query.$and[1]['metadata.title'] = { $ne: first.metadata.title as string };
  await mongo.locator('textarea').fill(JSON.stringify(query));
  await mongo.getByRole('button', { name: /Apply JSON/i }).click();
  await modal.getByRole('tab', { name: /Mappings/ }).click();
  await expect(mappings.locator('tbody input').nth(1)).toHaveValue('{{record.metadata.title}}');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await adminPage.reload();
  const stored = await apiData<unknown>(await api.get(`api/named-query/${name}`));
  expect(stored).toMatchObject({ mongoQuery: query, sort: [{ lastSaveDate: 'DESC' }], resultObjectMapping: { title: '{{record.metadata.title}}' },
    queryParams: { scope: { path: 'metadata.description', whenUndefined: 'defaultValue', defaultValue: name } } });
  const editedResults = await execute();
  expect(editedResults.summary.numFound).toBe(2);
  expect(editedResults.records.map(record => record.oid).sort()).toEqual([excluded.oid, second.oid].sort());
  await app.locator('#named-query-search').fill(name);
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await app.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await app.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);
});
