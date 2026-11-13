import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { adminStorageStatePath } from './helpers';
import { MongoClient } from 'mongodb';
import { Readable } from 'node:stream';
import csvParser from 'csv-parser';

const api = '/default/rdmp/api';
const queryPage = '/default/rdmp/admin/named-query';
const reportPage = '/default/rdmp/admin/reports';
const screenshotDir = process.env.SCHEMA_ASSIST_SCREENSHOT_DIR;

async function shot(page: Page, name: string) {
  if (!screenshotDir) return;
  await fs.mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true });
}
async function token(page: Page) {
  const response = await page.request.get('/csrfToken?branding=default&portal=rdmp');
  expect(response.ok()).toBeTruthy();
  const { _csrf } = await response.json();
  return { 'X-CSRF-Token': _csrf ?? '', 'X-Source': 'jsclient', Accept: 'application/json' };
}
function readCsv(csv: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    Readable.from([csv])
      .pipe(csvParser())
      .on('data', row => rows.push(row))
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}
async function pickTitle(control: Locator) {
  await control.locator('summary').click();
  await control.locator('rb-field-tree input[type=search]').fill('title');
  const field = control
    .locator('.et-field')
    .filter({ hasText: /metadata.*title/ })
    .first()
    .locator('.et-field-name');
  await field.focus();
  await field.press('Enter');
}
async function noHorizontalOverflow(page: Page) {
  const overflow = await page.locator('body').evaluate(body => ({
    width: body.scrollWidth,
    viewport: window.innerWidth,
    elements: Array.from(document.querySelectorAll('*'))
      .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 12)
      .map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width })),
  }));
  expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
}

test.describe('schema-assisted editor release workflows', () => {
  test.use({ storageState: adminStorageStatePath });
  test.skip(
    !process.env.SCHEMA_ASSIST_MONGO_URL,
    'Requires an isolated disposable portal Mongo database for advisory hook fixtures.'
  );
  let fixtureClient: MongoClient;
  let fixtureForms: any;
  let fixtureForm: any;
  let fixtureOriginal: any;
  test.beforeAll(async () => {
    fixtureClient = new MongoClient(process.env.SCHEMA_ASSIST_MONGO_URL!);
    await fixtureClient.connect();
    fixtureForms = fixtureClient.db('redbox-portal').collection('form');
    fixtureForm = await fixtureForms.findOne({ name: 'default-1.0-draft' });
    expect(fixtureForm, 'Default development rdmp edit form').toBeTruthy();
    fixtureOriginal = fixtureForm!.configuration;
    const configuration = structuredClone(fixtureOriginal);
    const delivered = JSON.parse(
      await fs.readFile('packages/redbox-core/test/fixtures/email-rdmp-effective-form.json', 'utf8')
    );
    function leaf(value: any): any {
      if (!value || typeof value !== 'object') return;
      if (value.component?.class === 'SimpleInputComponent' && value.model?.class === 'SimpleInputModel') return value;
      for (const child of Object.values(value)) {
        const found = leaf(child);
        if (found) return found;
      }
    }
    const sample = leaf(delivered);
    expect(sample).toBeTruthy();
    // Delivered client models contain values; source form definitions require defaults.
    sample.model.config.defaultValue = sample.model.config.value;
    delete sample.model.config.value;
    const scu = JSON.parse(
      await fs.readFile('packages/redbox-core/test/fixtures/email-scu-namespaced-form.json', 'utf8')
    );

    const titleField = { ...structuredClone(sample), name: 'title' };
    titleField.layout.config.label = 'Title';
    configuration.componentDefinitions.push(titleField, { ...structuredClone(sample), name: 'contributors' });
    configuration.componentDefinitions.push(
      ...scu.configuration.fields.map((field: any) => ({ ...structuredClone(sample), name: field.name }))
    );
    await fixtureForms.updateOne({ _id: fixtureForm!._id }, { $set: { configuration } });
  });
  test.afterAll(async () => {
    if (fixtureForm)
      await fixtureForms.updateOne({ _id: fixtureForm._id }, { $set: { configuration: fixtureOriginal } });
    if (fixtureClient) await fixtureClient.close();
  });

  test('creates a query and report with correct paths, date bindings and live display/CSV parity', async ({ page }) => {
    test.setTimeout(180_000);
    const headers = await token(page);
    const name = `browser_assist_${Date.now()}`;
    const title = `Schema browser project ${Date.now()}`;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const created = await page.request.post('/default/rdmp/recordmeta/rdmp', {
      headers,
      data: { title, contributors: ['Ada', 'Grace'] },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const record = await created.json();
    const oid = record.oid ?? record.data?.oid;
    expect(typeof oid).toBe('string');
    try {
      await page.goto(queryPage);
      await page.locator('#named-query-create').click();
      await expect(page.locator('#named-query-workspace-title')).toBeFocused();
      await page.locator('#nq-name').fill(name);
      await page.locator('#nq-collection').selectOption('record');
      await page.locator('#nq-field-panel rb-schema-target-selector select').first().selectOption('rdmp');
      await expect(page.locator('#nq-field-panel')).toContainText(/partial|form/i);
      await page.getByRole('tab', { name: /MongoDB Query/i }).click();
      const condition = page.locator('mongo-query-editor .nq-add-row');
      await pickTitle(condition.locator('nq-path-input'));
      await expect(condition.locator('nq-path-input input[type=text]')).toHaveValue('metadata.title');
      await condition.locator('input.nq-add-grow').fill(title);
      await condition.getByRole('button', { name: 'Add', exact: true }).click();
      await page.getByRole('tab', { name: /Result Mappings/i }).click();
      const mapping = page.locator('result-mapping-editor .nq-add-row');
      await mapping.locator('input.nq-add-grow').fill('projectTitle');
      await pickTitle(mapping.locator('nq-path-input'));
      await expect(mapping.locator('nq-path-input input[type=text]')).toHaveValue('record.metadata.title');
      await mapping.getByRole('button', { name: 'Add', exact: true }).click();
      // A direct custom array mapping stays editable even when the partial form omits it.
      await mapping.locator('input.nq-add-grow').fill('people');
      await mapping.locator('nq-path-input input[type=text]').fill('record.metadata.contributors');
      await mapping.getByRole('button', { name: 'Add', exact: true }).click();
      await page.getByRole('tab', { name: /Parameters/ }).click();
      for (const [key, operator] of [
        ['createdAfter', '>='],
        ['createdBefore', '<='],
      ]) {
        await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
        const card = page.locator('query-param-editor .nq-inline-card').first();
        await card.getByPlaceholder('param name', { exact: true }).fill(key);
        await card.locator('nq-path-input input[type=text]').fill('dateCreated');
        await card.locator('select').nth(0).selectOption('date');
        await card.locator('select').nth(1).selectOption(operator);
        await card.locator('select').nth(2).selectOption('ISODate');
        await card.getByRole('button', { name: 'Add', exact: true }).click();
      }
      const previewWait = page.waitForResponse(
        response => response.url().endsWith('/editor/preview') && response.request().method() === 'POST'
      );
      await page
        .locator('.nq-workspace-actions')
        .getByRole('button', { name: /Preview/ })
        .click();
      const queryPreview = await (await previewWait).json();
      expect(queryPreview.valid).toBe(true);
      expect(queryPreview.records[0].metadata.projectTitle).toBe(title);
      await shot(page, '01-query-desktop');
      await page.locator('.nq-workspace-actions').getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.locator('.nq-workspace')).toHaveCount(0);
      const savedQueryResponse = await page.request.get(`${api}/named-query/${name}`);
      const savedQuery = await savedQueryResponse.json();
      expect(savedQuery.mongoQuery['metadata.title']).toBe(title);
      expect(savedQuery.resultObjectMapping.projectTitle).toBe('record.metadata.title');
      expect(savedQuery).not.toHaveProperty('guidance');

      await page.goto(reportPage);
      await page.locator('#report-create').click();
      await expect(page.locator('#report-workspace-title')).toBeFocused();
      await page.locator('#report-name').fill(name);
      await page.locator('#report-title').fill('Schema-assisted browser report');
      await page.locator('#report-named-query').selectOption(name);
      await page
        .locator('.report-output-list label')
        .filter({ hasText: 'metadata.projectTitle' })
        .locator('input')
        .check();
      await page.getByRole('button', { name: 'Add columns from selected output fields', exact: true }).click();
      // Angular ngModel updates DOM properties, so locate the appended column by its property value.
      const titleIndex = await page
        .locator('[id^=column-property-]')
        .evaluateAll(inputs =>
          inputs.findIndex(input => (input as HTMLInputElement).value === 'metadata.projectTitle')
        );
      expect(titleIndex).toBeGreaterThanOrEqual(0);
      await page.locator(`#column-label-${titleIndex}`).fill('Project');
      await page.locator(`[data-column="${titleIndex}"] > details > summary`).click();
      await page.locator(`#column-display-${titleIndex}`).fill('<b>{{metadata.projectTitle}}</b>');
      await page.locator(`#column-csv-${titleIndex}`).fill('{{recordTableMeta.val}}');
      await page.getByRole('button', { name: 'Add filter', exact: true }).click();
      await page.locator('#filter-type-0').selectOption('date-range');
      await page.locator('#filter-param-0').fill('created');
      await page.locator('#filter-label-0').fill('Created');
      await page.locator('#filter-from-0').fill('createdAfter');
      await page.locator('#filter-to-0').fill('createdBefore');
      await page.locator('#preview-from-0').fill('2000-01-01');
      await page.locator('#preview-to-0').fill('2999-12-31');
      // Add an unknown/array output manually, preserving custom mapping support.
      await page.getByRole('button', { name: 'Add column', exact: true }).click();
      const last = (await page.locator('[data-column]').count()) - 1;
      await page.locator(`#column-label-${last}`).fill('People');
      await page.locator(`#column-property-${last}`).fill('metadata.people');
      await page
        .locator(`[data-column="${last}"]`)
        .getByRole('checkbox', { name: /multivalue|multiple/i })
        .check();
      await page.locator(`[data-column="${last}"] > details > summary`).click();
      await page.locator(`#column-display-${last}`).fill('{{recordTableMeta.val}}');
      await page.locator(`#column-csv-${last}`).fill('{{recordTableMeta.val}}');
      const reportPreviewWait = page.waitForResponse(
        response => response.url().includes('/report-config/preview') && response.request().method() === 'POST'
      );
      await page.locator('.report-workspace-actions').getByRole('button', { name: 'Preview', exact: true }).click();
      const reportPreview = await (await reportPreviewWait).json();
      expect(reportPreview.success).toBe(true);
      expect(reportPreview.deadlineEnforced).toBe(true);
      await expect(page.locator('.report-display-preview tbody')).toContainText(title);
      await expect(page.locator('.report-display-preview tbody')).toContainText('Ada');
      await expect(page.locator('.report-export-preview tbody')).toContainText('Grace');
      const previewDisplay = await page.locator('.report-display-preview tbody td').allInnerTexts();
      await shot(page, '02-report-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await noHorizontalOverflow(page);
      await shot(page, '03-report-narrow');
      // Unsaved change rejection keeps the full draft and current focusable controls.
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('.report-workspace-actions').getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.locator('#report-title')).toHaveValue('Schema-assisted browser report');
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.locator('.report-workspace-actions').getByRole('button', { name: 'Save report', exact: true }).click();
      await expect(page.locator('.report-workspace')).toHaveCount(0);
      const savedReportResponse = await page.request.get(`${api}/report-config/${name}`);
      const savedReport = await savedReportResponse.json();
      expect(savedReport.filter[0].database).toEqual({ fromProperty: 'createdAfter', toProperty: 'createdBefore' });
      const params = new URLSearchParams({
        name,
        created_fromDate: '2000-01-01T00:00:00.000Z',
        created_toDate: '2999-12-31T23:59:59.999Z',
      });
      const liveResponse = await page.request.get(`/default/rdmp/admin/getReportResults?${params}`);
      expect(liveResponse.ok()).toBeTruthy();
      const live = await liveResponse.json();
      expect(live.records).toEqual(reportPreview.records);
      const csvResponse = await page.request.get(`/default/rdmp/admin/downloadReportCSV?${params}`);
      expect(csvResponse.ok()).toBeTruthy();
      const csv = await csvResponse.text();
      const csvRows = await readCsv(csv);
      expect(csvRows).toHaveLength(1);
      expect(Object.keys(csvRows[0])).toEqual(savedReport.columns.map(column => column.label));
      expect(Object.values(csvRows[0])).toEqual(reportPreview.renderedRows[0].cells.map(cell => cell.export));
      await page.goto(`/default/rdmp/admin/report/${name}`);
      await expect(page.locator('record-table tbody')).toContainText(title);
      await page.locator('#created_fromDate').fill('01/01/2000');
      await page.locator('#created_fromDate').press('Tab');
      await page.locator('#created_toDate').fill('31/12/2999');
      await page.locator('#created_toDate').press('Tab');
      const filteredResponse = page.waitForResponse(
        response => response.url().includes('/admin/getReportResults?') && response.url().includes('created_fromDate')
      );
      await page.locator('report').getByText('Filter', { exact: true }).click();
      expect((await (await filteredResponse).json()).records).toEqual(reportPreview.records);
      await expect(page.locator('record-table tbody b')).toContainText(title);
      expect(await page.locator('record-table tbody td').allInnerTexts()).toEqual(previewDisplay);
      const download = page.waitForEvent('download');
      await page.locator('report a[href*="downloadReportCSV"]').click();
      const downloadedCsv = await fs.readFile((await (await download).path())!, 'utf8');
      expect(await readCsv(downloadedCsv)).toEqual(csvRows);
      await shot(page, '04-saved-report-runtime');
      expect(errors).toEqual([]);
    } finally {
      page.on('dialog', dialog => dialog.accept());
      await page.goto('/default/rdmp/admin');
      await page.request.delete(`${api}/report-config/${name}`, { headers });
      await page.request.delete(`${api}/named-query/${name}`, { headers });
      expect((await page.request.delete(`/default/rdmp/record/delete/${oid}`, { headers })).ok()).toBeTruthy();
    }
  });

  test('keeps non-record editing manual and guards narrow keyboard drafts', async ({ page }) => {
    const name = `user_assist_${Date.now()}`;
    const headers = await token(page);
    await page.goto(queryPage);
    await page.locator('#named-query-create').click();
    await page.locator('#nq-name').fill(name);
    await page.locator('#nq-collection').selectOption('user');
    await expect(page.locator('#nq-field-panel rb-schema-target-selector')).toHaveCount(0);
    await page.getByRole('tab', { name: /MongoDB Query/i }).click();
    const add = page.locator('mongo-query-editor .nq-add-row');
    await add.locator('nq-path-input input[type=text]').fill('username');
    await add.locator('input.nq-add-grow').fill('admin');
    await add.getByRole('button', { name: 'Add', exact: true }).click();
    await page
      .locator('.nq-workspace-actions')
      .getByRole('button', { name: /Preview/ })
      .click();
    await expect(page.locator('.nq-results')).toContainText(/deadline/i);
    await page.setViewportSize({ width: 390, height: 844 });
    await noHorizontalOverflow(page);
    await shot(page, '05-user-query-narrow');
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('.nq-workspace-actions').getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('.nq-workspace')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.getByRole('tab', { name: /Result Mappings/i }).click();
    const mapping = page.locator('result-mapping-editor .nq-add-row');
    await mapping.locator('input.nq-add-grow').fill('userLabel');
    await mapping.locator('nq-mapping-value button').first().click();
    await mapping.locator('textarea').fill('{{record.username}} custom');
    await mapping.getByRole('button', { name: 'Add', exact: true }).click();
    try {
      await page.locator('.nq-workspace-actions').getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.locator('.nq-workspace')).toHaveCount(0);
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page.locator('#nq-collection')).toHaveValue('user');
      await page.getByRole('tab', { name: /Result Mappings/i }).click();
      await expect(page.locator('result-mapping-editor tbody textarea')).toHaveValue('{{record.username}} custom');
      await page.locator('.nq-workspace-actions').getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.locator(`[data-query-name="${name}"]`)).toBeFocused();
    } finally {
      page.on('dialog', dialog => dialog.accept());
      await page.goto('/default/rdmp/admin');
      await page.request.delete(`${api}/named-query/${name}`, { headers });
    }
  });

  test('uses partial guidance with the bundled SCU namespaced fixture and keyboard completion', async ({ page }) => {
    const fieldName = 'dc:coverage_vivo:DateTimeInterval_vivo:start';
    try {
      await page.goto(queryPage);
      await page.locator('#named-query-create').click();
      await page.locator('#nq-name').fill(`scu_fixture_${Date.now()}`);
      await page.locator('#nq-collection').selectOption('record');
      await page.locator('#nq-field-panel rb-schema-target-selector select').first().selectOption('rdmp');
      await page.getByRole('tab', { name: /MongoDB Query/i }).click();
      const add = page.locator('mongo-query-editor .nq-add-row');
      const control = add.locator('nq-path-input');
      await control.locator('summary').click();
      await control.locator('input[type=search]').fill(fieldName);
      const field = control.locator('.et-field-name').filter({ hasText: fieldName });
      await expect(field).toHaveCount(1);
      await field.focus();
      await field.press('Enter');
      await expect(control.locator('input[type=text]')).toHaveValue(`metadata.${fieldName}`);
      await add.locator('input.nq-add-grow').fill('2026-01-01');
      await add.getByRole('button', { name: 'Add', exact: true }).click();
      const input = add.locator('nq-path-input input[type=text]');
      await input.fill('metadata.tit');
      await input.press('End');
      await input.press('l');
      await expect(page.locator('[role=listbox]')).toBeVisible();
      await input.press('Enter');
      await expect(input).toHaveValue('metadata.title');
      await expect(input).toBeFocused();
      await shot(page, '06-partial-scu-keyboard');
      const stage = page.locator('#nq-field-panel rb-schema-target-selector select').nth(1);
      if ((await stage.locator('option').count()) > 1) await stage.selectOption({ index: 1 });
      await expect(page.locator('mongo-query-editor tbody nq-path-input input[type=text]')).toHaveValue(
        `metadata.${fieldName}`
      );
      page.once('dialog', dialog => dialog.accept());
      await page.locator('.nq-workspace-actions').getByRole('button', { name: 'Cancel', exact: true }).click();
    } finally {
      page.on('dialog', dialog => dialog.accept());
      await page.goto('/default/rdmp/admin');
    }
  });
});
