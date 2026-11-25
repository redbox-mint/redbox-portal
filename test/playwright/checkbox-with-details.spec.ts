import { chromium, expect, test, type Page } from '@playwright/test';
import { MongoClient, ObjectId } from 'mongodb';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { adminStorageStatePath } from './helpers';

test.use({ storageState: adminStorageStatePath });

const prefix = '/default/rdmp';
const newRecord = `${prefix}/record/checkbox-details-demo/edit`;
const savePath = `${prefix}/recordmeta/`;
const formatsLookupPath = `${prefix}/vocab/checkbox-details-formats/entries`;

test('loads the demo vocabulary and saves, reopens, activates and prints selected details', async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  const entries = page.waitForResponse(response => new URL(response.url()).pathname === formatsLookupPath);
  await page.goto(newRecord);
  const lookup = await entries;
  expect(lookup.ok()).toBeTruthy();
  const choices = await lookup.json();
  expect(Array.isArray(choices) ? choices : choices.data).toEqual(expect.arrayContaining([
    expect.objectContaining({ value: 'tabulated', label: 'Tabulated files' }),
  ]));
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
    expect(input!.x).toBeGreaterThan(checkbox!.x);
    if (stacked) {
      expect(input!.x - checkbox!.x).toBeLessThan(70);
      expect(input!.y).toBeGreaterThan(checkbox!.y + 30);
    } else {
      expect(input!.x - checkbox!.x).toBeGreaterThan(150);
      const row = page.locator('.checkbox-details__row').filter({ has: tabulated });
      const choiceColumn = await row.locator('.form-check').boundingBox();
      const detailsColumn = await row.locator('.checkbox-details__fields').boundingBox();
      expect(choiceColumn && detailsColumn).toBeTruthy();
      expect(Math.abs(choiceColumn!.y - detailsColumn!.y)).toBeLessThanOrEqual(1);
    }
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

test('restores saved details when a researcher reselects a choice after its vocabulary loads', async ({ page }) => {
  await page.goto(newRecord);
  await page.getByRole('textbox', { name: 'Project title' }).fill('Undo while loading formats');
  await openFormats(page);
  const other = page.getByRole('checkbox', { name: 'Other', exact: true });
  const description = page.getByRole('textbox', { name: 'Describe the format — Other' });
  await other.check();
  await description.fill('Instrument output saved before this session');
  const draft = await save(page, 'Save draft', 'POST', demoType);

  let resumeLookup!: () => void;
  const paused = new Promise<void>(resolve => { resumeLookup = resolve; });
  await page.route(url => url.pathname === formatsLookupPath, async route => {
    await paused;
    await route.continue();
  }, { times: 1 });
  try {
    await page.goto(`${prefix}/record/edit/${draft.redboxOid}`);
    await openFormats(page);
    const pending = page.getByRole('checkbox', { name: 'other', exact: true });
    await expect(pending).toBeChecked();
    await pending.uncheck();
  } finally {
    resumeLookup();
  }
  await expect(other).not.toBeChecked();
  await other.check();
  await expect(description).toHaveValue('Instrument output saved before this session');
});

test('saves removals during a pending and failed lookup and validates retained rows after retry', async ({ page }, testInfo) => {
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
  await page.getByRole('checkbox', { name: 'Image files' }).check();
  await page.getByRole('checkbox', { name: 'Other' }).check();
  const draft = await save(page, 'Save draft', 'POST', demoType);
  const oid: string = draft.redboxOid;
  const incomplete = [{ value: 'tabulated', details: {} }];
  const otherRow = { value: 'other', details: { volume: '10 GB', description: 'Custom exports' } };
  expect(draft.metadata.digitalFormatEstimates).toEqual([
    ...incomplete, { value: 'image', details: { volume: '10 GB' } }, otherRow,
  ]);

  // Delay and fail just the editor request. Writes use the configured server vocabulary.
  let failLookup!: () => void;
  const pendingLookup = new Promise<void>(resolve => { failLookup = resolve; });
  let attempts = 0;
  await page.route(url => url.pathname === formatsLookupPath, async route => {
    if (++attempts === 1) {
      await pendingLookup;
      await route.fulfill({ status: 503, json: { message: 'Synthetic unavailable vocabulary' } });
    } else {
      await route.continue();
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
    const image = formats.getByRole('checkbox', { name: 'image', exact: true });
    await expect(image).toBeEnabled();
    await formats.screenshot({ path: testInfo.outputPath('lookup-pending.png') });
    await image.uncheck();
    await expect(image).toBeDisabled();
    await activate.click();
    await expect(invalid).toBeVisible();
    expect(activationRequests).toBe(0);
    await waitForSaveThrottle();
    const pendingDraft = await save(page, 'Save draft', 'PUT', oid);
    expect(pendingDraft.workflow.stage).toBe('draft');
    expect(pendingDraft.metadata.digitalFormatEstimates).toEqual([...incomplete, otherRow]);
  } finally {
    failLookup();
  }
  await waitForSaveThrottle();
  await expect(formats.getByText('Options could not be loaded.')).toBeVisible();
  await formats.screenshot({ path: testInfo.outputPath('lookup-failed.png') });
  const otherBeforeRetry = formats.getByRole('checkbox', { name: 'other', exact: true });
  await otherBeforeRetry.uncheck();
  await expect(otherBeforeRetry).toBeDisabled();
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
  await expect(formats.getByRole('checkbox', { name: 'Other', exact: true })).not.toBeChecked();
  await expect(formats.getByRole('checkbox', { name: 'Image files' })).not.toBeChecked();
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
  await page.goto(`${prefix}/record/edit/${oid}`);
  await openFormats(page);
  await expect(formats.getByRole('checkbox', { name: 'Tabulated files' })).toBeChecked();
  await expect(formats.getByRole('checkbox', { name: 'Image files' })).not.toBeChecked();
  await expect(formats.getByRole('checkbox', { name: 'Other', exact: true })).not.toBeChecked();
});


test('shows obsolete details alongside surviving controls on historical choices', async ({ page }, testInfo) => {
  const title = page.getByRole('textbox', { name: 'Project title' });
  await page.goto(newRecord);
  await title.fill('Synthetic archived details');
  const draft = await save(page, 'Save draft', 'POST', demoType);
  const oid: string = draft.redboxOid;
  const saved = [{
    value: 'legacy-media',
    details: { volume: '1 TB', legacyNotes: 'Stored on tape', privateReference: 'Keep private' },
  }];
  // Seed a prior form version's metadata on this test's own record.
  const mongo = await new MongoClient(process.env.CHECKBOX_DETAILS_MONGO_URL ?? 'mongodb://mongodb:27017', {
    serverSelectionTimeoutMS: 5000,
  }).connect();
  try {
    const seeded = await mongo.db('redbox-storage').collection('record').updateOne(
      { redboxOid: oid },
      { $set: { 'metadata.digitalFormatEstimates': saved } }
    );
    expect(seeded.modifiedCount).toBe(1);
  } finally {
    await mongo.close();
  }

  const historical = page.locator('.checkbox-details__row').filter({
    has: page.getByRole('checkbox', { name: 'Legacy media', exact: true }),
  });
  const checkHistorical = async () => {
    await openFormats(page);
    await expect(historical.getByRole('checkbox')).toBeChecked();
    await expect(historical.getByRole('textbox', { name: 'Estimated volume — Legacy media' })).toHaveValue('1 TB');
    await expect(historical.locator('dt')).toHaveText(['legacyNotes']);
    await expect(historical.locator('dd')).toHaveText(['Stored on tape']);
    await expect(historical.getByText('Keep private')).toHaveCount(0);
    await expect(historical.getByRole('textbox')).toHaveCount(1);
  };
  await page.goto(`${prefix}/record/edit/${oid}`);
  await checkHistorical();
  await historical.screenshot({ path: testInfo.outputPath('historical-details.png') });
  await page.getByRole('tab', { name: 'Project' }).click();
  await title.fill('Synthetic archived details (updated)');
  const updated = await save(page, 'Save draft', 'PUT', oid);
  expect(updated.metadata.digitalFormatEstimates).toEqual(saved);
  await page.reload();
  await checkHistorical();
});


/** Render the real PDF service against the authorized portal page. Capture its staging-disk output. */
async function renderCheckboxPdf(page: Page, baseURL: string, oid: string, output: string): Promise<string> {
  const pdfRequire = createRequire(path.resolve('packages/sails-hook-redbox-pdfgen/package.json'));
  const { Effect } = pdfRequire('effect');
  const { installPdfgenTestGlobals, clearPdfgenTestGlobals } =
    require('../../packages/sails-hook-redbox-pdfgen/test/support/globals');
  const cookies = await page.context().cookies(baseURL);
  installPdfgenTestGlobals({ appUrl: baseURL });
  try {
    const { Services } = pdfRequire('./dist/api/services/PDFService.js');
    const service = new Services.PDF();
    const globals = globalThis as any;
    service.DatastreamService = globals.sails.services.standarddatastreamservice;
    const staged = globals.StorageManagerService.stagingDisk().put;
    const launch = service.launchBrowser.bind(service);
    service.launchBrowser = async (options: object) => {
      const browser = await launch({ ...options, executablePath: chromium.executablePath() });
      const newPage = browser.newPage.bind(browser);
      browser.newPage = async () => {
        const pdfPage = await newPage();
        await pdfPage.setCookie(...cookies.map(({ name, value, domain, path, httpOnly, secure, sameSite }) =>
          ({ name, value, domain, path, httpOnly, secure, sameSite })));
        return pdfPage;
      };
      return browser;
    };
    const exit = await Effect.runPromiseExit(service.attemptPDFGeneration(oid, {}, {
      token: 'session-authenticated-pdf-test',
      readinessStrategy: 'selector',
      waitForSelector: '.rb-view-checkbox-details li',
      readinessTimeout: 15000,
    }, { name: 'default' }, 1));
    expect(exit._tag, JSON.stringify(exit)).toBe('Success');
    expect(staged.calledOnce).toBe(true);
    const buffer = staged.firstCall.args[1] as Uint8Array;
    await writeFile(output, buffer);
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = getDocument({ data: new Uint8Array(buffer) });
    try {
      const doc = await pdf.promise;
      const pages: string[] = [];
      for (let number = 1; number <= doc.numPages; number++) {
        const content = await (await doc.getPage(number)).getTextContent();
        pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      }
      return pages.join(' ');
    } finally {
      await pdf.destroy();
    }
  } finally {
    clearPdfgenTestGlobals();
  }
}

test('recovers an inline lookup and prints the saved details while its vocabulary is missing', async ({ page, baseURL }, testInfo) => {
  await page.goto(newRecord);
  await page.getByRole('textbox', { name: 'Project title' }).fill('Synthetic inline vocabulary recovery');
  const draft = await save(page, 'Save draft', 'POST', demoType);
  const oid: string = draft.redboxOid;
  const originalForm = draft.metaMetadata.form;
  const formName = `checkbox-details-inline-${oid}`;
  const vocabId = new ObjectId();
  const saved = [{
    value: 'legacy-media',
    details: { volume: '1 TB', legacyNotes: 'Stored on tape', privateReference: 'Hidden fixture value' },
  }];
  const mongo = await new MongoClient(process.env.CHECKBOX_DETAILS_MONGO_URL ?? 'mongodb://mongodb:27017', {
    serverSelectionTimeoutMS: 5000,
  }).connect();
  const portal = mongo.db('redbox-portal');
  const forms = portal.collection('form');
  const vocabs = portal.collection('vocabulary');
  const entries = portal.collection('vocabularyentry');
  const records = mongo.db('redbox-storage').collection('record');
  try {
    // The copied form and vocabulary apply only to this synthetic record.
    const source = await forms.findOne({ name: originalForm });
    expect(source).toBeTruthy();
    const { _id: _formId, ...form } = source!;
    form.name = formName;
    form.configuration.name = formName;
    const formatsTab = form.configuration.componentDefinitions[0].component.config.tabs[1];
    Object.assign(formatsTab.component.config.componentDefinitions[0].component.config, {
      vocabRef: formName, inlineVocab: true,
    });
    await forms.insertOne(form);
    await records.updateOne({ redboxOid: oid }, {
      $set: { 'metaMetadata.form': formName, 'metadata.digitalFormatEstimates': saved },
    });

    const openEdit = async () => {
      await page.goto(`${prefix}/record/edit/${oid}`);
      await openFormats(page);
      await expect(page.getByText('Options could not be loaded.')).toBeVisible();
    };
    await openEdit();
    const formats = page.getByRole('group', { name: 'Digital formats and estimated volume' });
    await expect(formats.getByRole('checkbox', { name: 'legacy-media', exact: true })).toBeChecked();
    await expect(formats.locator('dt')).toHaveText(['Estimated volume', 'legacyNotes']);
    await expect(formats.locator('dd')).toHaveText(['1 TB', 'Stored on tape']);
    await expect(formats.getByRole('textbox')).toHaveCount(0);
    await formats.screenshot({ path: testInfo.outputPath('inline-missing-edit.png') });

    await page.goto(`${prefix}/record/view/${oid}`);
    const view = page.locator('.rb-view-checkbox-details');
    await expect(view).toContainText('legacy-media');
    await expect(view).toContainText('Stored on tape');
    await view.screenshot({ path: testInfo.outputPath('inline-missing-view.png') });
    const pdfText = await renderCheckboxPdf(page, baseURL!, oid, testInfo.outputPath('missing-vocabulary.pdf'));
    for (const text of ['legacy-media', 'Estimated volume', '1 TB', 'legacyNotes', 'Stored on tape']) {
      expect(pdfText).toContain(text);
    }
    expect(pdfText).not.toContain('Hidden fixture value');

    await openEdit();
    const sourceVocab = await vocabs.findOne({ slug: 'checkbox-details-formats' });
    expect(sourceVocab).toBeTruthy();
    const sourceEntries = await entries.find({ vocabulary: sourceVocab!._id }).toArray();
    await vocabs.insertOne({ ...sourceVocab!, _id: vocabId, slug: formName, name: formName });
    await entries.insertMany(sourceEntries.map(({ _id, ...entry }) => ({ ...entry, vocabulary: vocabId })));
    await formats.getByRole('button', { name: 'Try again' }).click();
    await expect(formats.getByRole('checkbox', { name: 'Legacy media', exact: true })).toBeChecked();
    await expect(formats.getByRole('textbox', { name: 'Estimated volume — Legacy media' })).toHaveValue('1 TB');
    await expect(formats.locator('dd')).toHaveText(['Stored on tape']);
    await formats.screenshot({ path: testInfo.outputPath('inline-recovered-edit.png') });
  } finally {
    try {
      await records.updateOne({ redboxOid: oid }, { $set: { 'metaMetadata.form': originalForm } });
      await forms.deleteOne({ name: formName });
      await entries.deleteMany({ vocabulary: vocabId });
      await vocabs.deleteOne({ _id: vocabId });
    } finally {
      await mongo.close();
    }
  }
});
