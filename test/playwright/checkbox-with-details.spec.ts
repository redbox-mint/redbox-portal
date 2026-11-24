import { expect, test } from '@playwright/test';
import { adminStorageStatePath } from './helpers';

test.use({ storageState: adminStorageStatePath });

const prefix = '/default/rdmp';
const newRecord = `${prefix}/record/checkbox-details-demo/edit`;
const savePath = `${prefix}/recordmeta/`;

test('saves, validates, reopens and prints selected checkbox details', async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(newRecord);
  const title = page.getByRole('textbox', { name: 'Project title' });
  const openFormats = () => page.getByRole('tab', { name: 'Formats' }).click();
  const tabulated = page.getByRole('checkbox', { name: 'Tabulated files' });
  const other = page.getByRole('checkbox', { name: 'Other' });
  const tableVolume = page.getByRole('textbox', { name: 'Estimated volume — Tabulated files' });
  const otherVolume = page.getByRole('textbox', { name: 'Estimated volume — Other' });
  const description = page.getByRole('textbox', { name: 'Describe the format — Other' });

  await expect(title).toBeVisible();
  await expect(title).not.toBeFocused();
  await title.fill('Synthetic checkbox details acceptance record');
  await openFormats();
  await tabulated.focus();
  await page.keyboard.press('Space');
  await expect(tabulated).toBeFocused();
  await expect(tableVolume).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(tableVolume).toBeFocused();
  await tableVolume.fill('About 200 CSV files');
  await other.check();
  await description.fill('Instrument export bundles');

  const saveDraft = () => page.getByRole('button', { name: 'Save draft' }).click();
  const created = page.waitForResponse(
    response => response.request().method() === 'POST' && response.url().includes(`${savePath}checkbox-details-demo`)
  );
  await saveDraft();
  const createdResponse = await created;
  const saved = await createdResponse.json();
  expect(createdResponse.ok(), JSON.stringify(saved)).toBeTruthy();
  const oid = saved.data.redboxOid as string;
  expect(saved.data.workflow.stage).toBe('draft');
  expect(saved.data.metadata.digitalFormatEstimates).toEqual([
    { value: 'tabulated', details: { volume: 'About 200 CSV files' } },
    { value: 'other', details: { volume: null, description: 'Instrument export bundles' } },
  ]);
  const createRequest = createdResponse.request();
  const csrf = await createRequest.headerValue('x-csrf-token');
  const rejected = await page.request.put(`${savePath}${oid}?targetStep=active&operation=activate`, {
    data: createRequest.postDataJSON(),
    headers: {
      'X-ReDBox-Api-Version': '2.0',
      'x-source': 'jsclient',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
  });
  const rejection = await rejected.json();
  expect(rejected.status(), JSON.stringify(rejection)).toBe(400);
  expect(JSON.stringify(rejection)).toContain('/sections/formats/digitalFormatEstimates/option:other/volume');

  await page.goto(`${prefix}/record/edit/${oid}`);
  await openFormats();
  await expect(tableVolume).toHaveValue('About 200 CSV files');
  await expect(description).toHaveValue('Instrument export bundles');
  await page.getByRole('tab', { name: 'Project' }).click();
  await page.getByRole('button', { name: 'Activate' }).click();
  await page.getByRole('link', { name: 'Estimated volume — Other' }).click();
  await expect(otherVolume).toBeFocused();
  const otherRow = page.locator('.checkbox-details__row').filter({ has: other });
  await expect(otherRow.getByText('This field requires a value.', { exact: true })).toBeVisible();
  await otherRow.screenshot({ path: testInfo.outputPath('validation.png') });
  await otherVolume.fill('3 TB');

  await tabulated.uncheck();
  await expect(tableVolume).toHaveCount(0);
  await expect(otherVolume).toHaveValue('3 TB');
  await tabulated.check();
  await expect(tableVolume).toHaveValue('About 200 CSV files');

  const checkLayout = async (stacked: boolean) => {
    const checkbox = await tabulated.boundingBox();
    const input = await tableVolume.boundingBox();
    expect(checkbox && input).toBeTruthy();
    if (stacked) expect(input!.x - checkbox!.x).toBeLessThan(70);
    else expect(input!.x - checkbox!.x).toBeGreaterThan(150);
    expect(input!.x).toBeGreaterThan(checkbox!.x);
    if (stacked) expect(input!.y).toBeGreaterThan(checkbox!.y + 30);
  };
  await checkLayout(false);
  await page
    .getByRole('group', { name: 'Digital formats and estimated volume' })
    .screenshot({ path: testInfo.outputPath('desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkLayout(true);
  await page
    .getByRole('group', { name: 'Digital formats and estimated volume' })
    .screenshot({ path: testInfo.outputPath('narrow.png') });
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.getByRole('tab', { name: 'Project' }).click();
  await title.fill('Synthetic checkbox details acceptance record (amended)');
  const updated = page.waitForResponse(
    response => response.request().method() === 'PUT' && response.url().includes(`${savePath}${oid}`)
  );
  await page.getByRole('button', { name: 'Activate' }).click();
  const updatedResponse = await updated;
  const active = await updatedResponse.json();
  expect(updatedResponse.ok(), JSON.stringify(active)).toBeTruthy();
  expect(active.data.workflow.stage).toBe('active');

  await page.goto(`${prefix}/record/view/${oid}`);
  const rows = page.locator('.rb-view-checkbox-details > li');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Tabulated files' })).toContainText('About 200 CSV files');
  await expect(rows.filter({ hasText: 'Other' })).toContainText('Estimated volume');
  await expect(rows.filter({ hasText: 'Other' })).toContainText('3 TB');
  await expect(rows.filter({ hasText: 'Other' })).toContainText('Instrument export bundles');
  await expect(page.locator('redbox-checkbox-with-details')).toHaveCount(0);
  await page.locator('.rb-view-checkbox-details').screenshot({ path: testInfo.outputPath('view.png') });
  await page.emulateMedia({ media: 'print' });
  await expect(rows).toHaveCount(2);
  await page.pdf({ path: testInfo.outputPath('record.pdf'), format: 'A4', printBackground: true });
  await page.emulateMedia({ media: null });
  await page.goto(`${prefix}/record/edit/${oid}`);
  await openFormats();
  await tabulated.uncheck();
  await page.getByRole('tab', { name: 'Project' }).click();
  await title.fill('Synthetic checkbox details acceptance record (one selection)');
  const removed = page.waitForResponse(
    response => response.request().method() === 'PUT' && response.url().includes(`${savePath}${oid}`)
  );
  await saveDraft();
  const removedResponse = await removed;
  expect(removedResponse.ok()).toBeTruthy();
  expect((await removedResponse.json()).data.metadata.digitalFormatEstimates).toEqual([
    { value: 'other', details: { volume: '3 TB', description: 'Instrument export bundles' } },
  ]);
  await page.reload();
  await openFormats();
  await expect(tabulated).not.toBeChecked();
  await expect(otherVolume).toHaveValue('3 TB');
  await expect(description).toHaveValue('Instrument export bundles');
  expect(browserErrors).toEqual([]);
});
