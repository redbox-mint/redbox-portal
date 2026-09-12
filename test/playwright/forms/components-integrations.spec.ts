import { expect, test } from '../fixtures/test';
import { field, saveForm } from '../helpers/forms';

test('F21 components-vocabulary searches terms, handles empty results and persists a tree leaf', async ({ adminPage, records }) => {
  const record = await records.create('e2e-components-vocabulary', { title: 'Vocabulary', term: '', subjects: [] });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  const term = field(adminPage, 'Vocabulary term');
  await term.fill('No matching term');
  await expect(adminPage.locator('redbox-typeahead-input')).toContainText(/no results|no matches/i);
  await term.fill('Coastal');
  await adminPage.getByRole('option', { name: 'Coastal ecology', exact: true }).click();
  await expect(term).toHaveValue('Coastal ecology');
  const tree = adminPage.locator('redbox-checkbox-tree');
  await tree.getByRole('button', { name: 'Expand', exact: true }).first().click();
  await tree.getByRole('button', { name: 'Expand', exact: true }).first().click();
  await tree.getByRole('checkbox', { name: /Coastal systems/ }).check();
  await expect(tree.getByRole('checkbox', { name: /Forest systems/ })).not.toBeChecked();
  await saveForm(adminPage);
  expect((await records.read(record.oid)).body).toMatchObject({ term: { label: 'Coastal ecology', value: 'term-coast', sourceType: 'static' }, subjects: [expect.objectContaining({ notation: '101', label: 'Coastal systems' })] });
  await adminPage.reload();
  await expect(term).toHaveValue('Coastal ecology');
  // Expand only collapsed ancestors: saved selections may expand their own path.
  for (let depth = 0; depth < 2; depth++) {
    if (await tree.getByRole('checkbox', { name: /Coastal systems/ }).isVisible()) break;
    await tree.getByRole('button', { name: 'Expand', exact: true }).first().click();
  }
  await expect(tree.getByRole('checkbox', { name: /Coastal systems/ })).toBeChecked();
});

test('F22 components-record-relations replace references and remove related objects without cross-record leakage', async ({ adminPage, records }) => {
  const first = await records.create('e2e-initialisation-modes', { title: 'Relation Alpha', translated: 'Alpha detail' });
  const second = await records.create('e2e-initialisation-modes', { title: 'Relation Beta', translated: 'Beta detail' });
  await records.create('e2e-expression-conditions', { title: 'Relation unrelated', unrelated: 'Not a selectable record type' });
  const record = await records.create('e2e-components-record-relations', { title: 'References', reference: null, related: [] });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  const reference = adminPage.locator('redbox-record-selector').first();
  await reference.getByRole('textbox').fill('Relation');
  await expect(reference.getByRole('option')).toHaveCount(2);
  await expect(reference).not.toContainText('Relation unrelated');
  await reference.getByRole('option', { name: /Relation Alpha/ }).click();
  await expect(reference.getByRole('status')).toHaveText('Relation Alpha');
  await reference.getByRole('button', { name: 'Change', exact: true }).click();
  await reference.getByRole('textbox').fill('Relation Beta');
  await reference.getByRole('option', { name: /Relation Beta/ }).click();
  const related = adminPage.locator('redbox-form-repeatable');
  await related.getByRole('button', { name: /add/i }).click();
  await related.getByRole('textbox').fill('Relation Alpha');
  await related.getByRole('option', { name: /Relation Alpha/ }).click();
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(reference.getByRole('status')).toHaveText('Relation Beta');
  await expect(adminPage.locator('redbox-related-object-data')).toContainText('Relation Alpha: Alpha detail');
  expect((await records.read(record.oid)).body).toMatchObject({ reference: { oid: second.oid, title: 'Relation Beta' }, related: [{ oid: first.oid, title: 'Relation Alpha' }] });
  await related.getByRole('button', { name: /remove/i }).click();
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(related.locator('.rb-form-repeatable-item')).toHaveCount(0);
  await expect(adminPage.locator('redbox-related-object-data')).not.toContainText('Alpha detail');
  expect((await records.read(record.oid)).body).toMatchObject({ reference: { oid: second.oid }, related: [] });
});

test('F23 components-rich-text preserves supported formatting and rendered content', async ({ adminPage, records }) => {
  const record = await records.create('e2e-components-rich-text', { title: 'Rich text', description: '' });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  const richText = adminPage.locator('redbox-rich-text-editor');
  const editor = richText.locator('[contenteditable="true"]');
  await editor.fill('Formatted research description');
  await editor.press('ControlOrMeta+a');
  await richText.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(editor.locator('strong, b')).toHaveText('Formatted research description');
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(editor.locator('strong, b')).toHaveText('Formatted research description');
  expect(JSON.stringify((await records.read(record.oid)).body)).toMatch(/<(strong|b)>Formatted research description<\/(strong|b)>/);
  await adminPage.goto(`/default/rdmp/record/view/${record.oid}`);
  await expect(adminPage.locator('redbox-form strong, redbox-form b')).toHaveText('Formatted research description');
});

test('F24 components-map draws and edits a point using local tiles and persists the resulting geometry', async ({ adminPage, records, stubs }) => {
  const record = await records.create('e2e-components-map', { title: 'Map', geometry: { type: 'FeatureCollection', features: [] } });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  const map = adminPage.locator('redbox-map');
  const surface = map.locator('.ol-viewport');
  await expect(surface).toBeVisible();
  await expect.poll(async () => (await stubs.requests()).filter(request => String(request.path).startsWith('/tiles/')).length).toBeGreaterThan(0);
  await map.getByTitle('Zoom in', { exact: true }).click();
  await map.getByRole('button', { name: 'Point', exact: true }).click();
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error('The map must have a rendered drawing surface.');
  const point = { x: bounds.x + bounds.width * 0.45, y: bounds.y + bounds.height * 0.5 };
  await adminPage.mouse.click(point.x, point.y);
  const summary = adminPage.getByLabel('Captured geometry', { exact: true });
  await expect(summary).toContainText('Point');
  const coordinates = async () => (await summary.innerText()).replace('Point: ', '').trim().split(',').map(Number);
  const before = await coordinates();
  await expect(summary.locator('li')).toHaveCount(1);
  expect(before).toHaveLength(2);
  expect(before.every(Number.isFinite)).toBeTruthy();
  await map.getByRole('button', { name: 'Select/Edit', exact: true }).click();
  await adminPage.mouse.click(point.x, point.y);
  await adminPage.mouse.move(point.x, point.y);
  await adminPage.mouse.down();
  await adminPage.mouse.move(point.x + 60, point.y - 30, { steps: 8 });
  await adminPage.mouse.up();
  await expect.poll(coordinates).not.toEqual(before);
  const edited = await coordinates();
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(summary).toContainText('Point');
  expect(await coordinates()).toEqual(edited);
  expect((await records.read(record.oid)).body).toMatchObject({ geometry: { type: 'FeatureCollection', features: [expect.objectContaining({ geometry: { type: 'Point', coordinates: edited } })] } });
});

test('F25 components-files uploads, persists and removes a local attachment', async ({ adminPage, records }) => {
  const record = await records.create('e2e-components-files', { title: 'Files', files: [] });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  const files = adminPage.locator('redbox-file-upload');
  await files.getByRole('button', { name: /add attachment/i }).click();
  const dashboard = adminPage.locator('.uppy-Dashboard');
  await dashboard.locator('input[type="file"]').first().setInputFiles('test/playwright/data/regression-notes.txt');
  await dashboard.getByRole('button', { name: /upload 1 file/i }).click();
  await expect(files).toContainText('regression-notes.txt');
  await dashboard.getByRole('button', { name: 'Close Modal', exact: true }).click();
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(files.getByRole('link', { name: 'regression-notes.txt', exact: true })).toBeVisible();
  expect((await records.read(record.oid)).body).toMatchObject({ files: [expect.objectContaining({ name: 'regression-notes.txt', type: 'attachment', pending: false })] });
  await files.getByRole('button', { name: /remove/i }).click();
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(files.getByRole('button', { name: /add attachment/i })).toBeVisible();
  await expect(files.getByRole('link', { name: 'regression-notes.txt', exact: true })).toHaveCount(0);
  expect((await records.read(record.oid)).body).toMatchObject({ files: [] });
});
