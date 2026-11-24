import { expect, test, type Page } from '@playwright/test';
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
  await otherVolume.fill('');
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
    { value: 'other', details: { volume: '', description: 'Instrument export bundles' } },
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

const demoType = 'checkbox-details-demo';
const openFormats = (page: Page) => page.getByRole('tab', { name: 'Formats' }).click();
const save = (page: Page, label: string, method: 'POST' | 'PUT', id: string) => Promise.all([
  page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname === savePath + id),
  page.getByRole('button', { name: label, exact: true }).click(),
]).then(async ([response]) => {
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  return body.data;
});

test('initializes a newly selected row after reopening a saved record', async ({ page }) => {
  const title = page.getByRole('textbox', { name: 'Project title' });
  const tableVolume = page.getByRole('textbox', { name: 'Estimated volume — Tabulated files' });
  const otherVolume = page.getByRole('textbox', { name: 'Estimated volume — Other' });
  const description = page.getByRole('textbox', { name: 'Describe the format — Other' });
  await page.goto(newRecord);
  await title.fill('Synthetic checkbox details defaults');
  await openFormats(page);
  await page.getByRole('checkbox', { name: 'Tabulated files' }).check();
  await tableVolume.fill('250 CSV files');
  const draft = await save(page, 'Save draft', 'POST', demoType);
  expect(draft.metadata.digitalFormatEstimates).toEqual([{ value: 'tabulated', details: { volume: '250 CSV files' } }]);

  await page.goto(`${prefix}/record/edit/${draft.redboxOid}`);
  await openFormats(page);
  await expect(tableVolume).toHaveValue('250 CSV files');
  await page.getByRole('checkbox', { name: 'Other' }).check();
  await expect(otherVolume).toHaveValue('10 GB');
  await expect(description).toHaveValue('Custom exports');
  const active = await save(page, 'Activate', 'PUT', draft.redboxOid);
  expect(active.workflow.stage).toBe('active');
  expect(active.metadata.digitalFormatEstimates).toEqual([
    { value: 'tabulated', details: { volume: '250 CSV files' } },
    { value: 'other', details: { volume: '10 GB', description: 'Custom exports' } },
  ]);
});

test('preserves incomplete drafts during a pending and failed lookup and validates after retry', async ({ page }, testInfo) => {
  const title = page.getByRole('textbox', { name: 'Project title' });
  const formats = page.getByRole('group', { name: 'Digital formats and estimated volume' });
  const activate = page.getByRole('button', { name: 'Activate', exact: true });
  const invalid = page.getByRole('alert').filter({ hasText: 'The form is invalid.' });
  // Seed an older/incomplete draft with a missing property through the real write endpoint.
  await page.route(url => url.pathname === savePath + demoType, async route => {
    const payload = route.request().postDataJSON();
    delete payload.digitalFormatEstimates[0].details.volume;
    await route.continue({ postData: payload });
  }, { times: 1 });
  await page.goto(newRecord);
  await title.fill('Synthetic deferred checkbox details');
  await openFormats(page);
  await page.getByRole('checkbox', { name: 'Tabulated files' }).check();
  const draft = await save(page, 'Save draft', 'POST', demoType);
  const oid: string = draft.redboxOid;
  const incomplete = [{ value: 'tabulated', details: {} }];
  expect(draft.metadata.digitalFormatEstimates).toEqual(incomplete);

  // Keep the demo's real write contract. Rewrite only the client config and
  // control the vocabulary HTTP result to reproduce a slow then failed lookup.
  let definitions: Array<{ value: string; label: string }> = [];
  await page.route(url => url.pathname === `${prefix}/record/form/auto/${oid}`, async route => {
    const response = await route.fetch();
    const body = await response.json();
    const sections = body.data.componentDefinitions.find((item: { name: string }) => item.name === 'sections');
    const tab = sections.component.config.tabs.find((item: { name: string }) => item.name === 'formats');
    const field = tab.component.config.componentDefinitions.find((item: { name: string }) => item.name === 'digitalFormatEstimates');
    definitions = field.component.config.options;
    delete field.component.config.options;
    field.component.config.vocabRef = 'checkbox-details-test-formats';
    await route.fulfill({ response, json: body });
  });
  let failLookup!: () => void;
  const pendingLookup = new Promise<void>(resolve => { failLookup = resolve; });
  let attempts = 0;
  await page.route(url => url.pathname === `${prefix}/vocab/checkbox-details-test-formats/entries`, async route => {
    if (++attempts === 1) {
      await pendingLookup;
      await route.fulfill({ status: 503, json: { message: 'Synthetic unavailable vocabulary' } });
    } else {
      await route.fulfill({ json: { data: definitions } });
    }
  });
  let activationRequests = 0;
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() === 'PUT' && url.pathname === savePath + oid && url.searchParams.get('operation') === 'activate') {
      activationRequests++;
    }
  });
  const amendTitle = async (value: string) => {
    await page.getByRole('tab', { name: 'Project' }).click();
    await title.fill(value);
    await openFormats(page);
  };

  // The core form throttles successive save requests for 250 ms.
  const waitForSaveThrottle = () => page.waitForTimeout(250);
  try {
    await page.goto(`${prefix}/record/edit/${oid}`);
    await amendTitle('Synthetic deferred checkbox details (pending)');
    await expect(formats).toHaveAttribute('aria-busy', 'true');
    await formats.screenshot({ path: testInfo.outputPath('lookup-pending.png') });
    await activate.click();
    await expect(invalid).toBeVisible();
    expect(activationRequests).toBe(0);
    await waitForSaveThrottle();
    const pendingDraft = await save(page, 'Save draft', 'PUT', oid);
    expect(pendingDraft.workflow.stage).toBe('draft');
    expect(pendingDraft.metadata.digitalFormatEstimates).toEqual(incomplete);
  } finally {
    failLookup();
  }
  await waitForSaveThrottle();
  await expect(formats.getByText('Options could not be loaded.')).toBeVisible();
  await formats.screenshot({ path: testInfo.outputPath('lookup-failed.png') });
  await amendTitle('Synthetic deferred checkbox details (failed)');
  await activate.click();
  await expect(invalid).toBeVisible();
  expect(activationRequests).toBe(0);
  await waitForSaveThrottle();
  const failedDraft = await save(page, 'Save draft', 'PUT', oid);
  expect(failedDraft.metadata.digitalFormatEstimates).toEqual(incomplete);
  await waitForSaveThrottle();

  await formats.getByRole('button', { name: 'Try again' }).click();
  const volume = page.getByRole('textbox', { name: 'Estimated volume — Tabulated files' });
  await expect(volume).toBeVisible();
  await expect(volume).toHaveValue('');
  expect(attempts).toBe(2);
  await amendTitle('Synthetic deferred checkbox details (retried)');
  await activate.click();
  await page.getByRole('link', { name: 'Estimated volume — Tabulated files' }).click();
  await expect(volume).toBeFocused();
  await expect(formats.getByText('This field requires a value.', { exact: true })).toBeVisible();
  expect(activationRequests).toBe(0);
  await formats.screenshot({ path: testInfo.outputPath('lookup-recovered-validation.png') });
  await volume.fill('3 TB');
  await waitForSaveThrottle();
  const active = await save(page, 'Activate', 'PUT', oid);
  expect(activationRequests).toBe(1);
  expect(active.workflow.stage).toBe('active');
  expect(active.metadata.digitalFormatEstimates).toEqual([{ value: 'tabulated', details: { volume: '3 TB' } }]);
});
