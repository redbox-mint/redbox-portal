import { expect, test } from '../fixtures/test';
import { openScenario } from './_scenario';
import { field, saveForm } from '../helpers/forms';
import { ResponseGate } from '../helpers/response-gate';
import { randomUUID } from 'node:crypto';

test('F06 behaviour processors fetch real record metadata, transform and persist the mapped result', async ({ adminPage, records }, testInfo) => {
  const source = await records.create('e2e-initialisation-modes', { title: 'Independent metadata source' });
  const target = await records.create('e2e-behaviour-processors', { title: 'Lookup target', lookup: '', result: 'Waiting' });
  await adminPage.goto(`/default/rdmp/record/edit/${target.oid}`);
  const responsePromise = adminPage.waitForResponse(response => new URL(response.url()).pathname === `/default/rdmp/record/metadata/${source.oid}`);
  await field(adminPage, 'Lookup record').fill(`  ${source.oid}  `);
  const response = await responsePromise;
  expect(response.request().method()).toBe('GET');
  expect(response.ok()).toBeTruthy();
  await testInfo.attach('metadata-lookup.json', { body: JSON.stringify({ method: response.request().method(), url: response.url(), body: await response.json() }), contentType: 'application/json' });
  await expect(field(adminPage, 'Lookup result')).toHaveValue('Independent metadata source / fetched');
  await saveForm(adminPage);
  expect((await records.read(target.oid)).body).toMatchObject({ result: 'Independent metadata source / fetched' });
  await adminPage.reload();
  await expect(field(adminPage, 'Lookup result')).toHaveValue('Independent metadata source / fetched');
});

test('F07 behaviour ready-enabled runs once while disabled definitions make no request or change', async ({ adminPage }) => {
  const requests: string[] = [];
  adminPage.on('request', request => { if (new URL(request.url()).pathname.includes('/record/metadata/')) requests.push(request.url()); });
  await openScenario(adminPage, 'behaviour-ready-enabled');
  await expect(field(adminPage, 'Lookup result')).toHaveValue('Behaviour record / ready');
  await expect(field(adminPage, 'Disabled result')).toHaveValue('Unchanged');
  await field(adminPage, 'Title').fill('Later user edit');
  await expect(field(adminPage, 'Lookup result')).toHaveValue('Behaviour record / ready');
  await expect(field(adminPage, 'Disabled result')).toHaveValue('Unchanged');
  expect(requests).toEqual([]);
});

test('F08 behaviour debounce fetches only the settled input within the observation window', async ({ adminPage, records }, testInfo) => {
  const source = await records.create('e2e-initialisation-modes', { title: 'Settled lookup' });
  await adminPage.clock.install();
  const requests: string[] = [];
  adminPage.on('request', request => { if (new URL(request.url()).pathname.includes('/record/metadata/')) requests.push(new URL(request.url()).pathname); });
  await openScenario(adminPage, 'behaviour-debounce');
  const lookup = field(adminPage, 'Lookup record');
  await lookup.fill('unfinished');
  await lookup.fill('second input');
  await lookup.fill(source.oid);
  await adminPage.clock.runFor(600);
  await expect(field(adminPage, 'Lookup result')).toHaveValue('Settled lookup / fetched');
  await adminPage.clock.runFor(1_000);
  expect(requests).toEqual([`/default/rdmp/record/metadata/${source.oid}`]);
  await testInfo.attach('debounced-requests.json', { body: JSON.stringify(requests), contentType: 'application/json' });
});

test('F09 behaviour events-errors shows the configured failure action and recovers with a downstream event', async ({ adminPage, records, diagnostics }) => {
  const source = await records.create('e2e-initialisation-modes', { title: 'Recovered lookup' });
  const missing = `e2e-missing-${randomUUID()}`;
  const url = new RegExp(`/record/metadata/${missing}\\?`);
  await openScenario(adminPage, 'behaviour-events-errors');
  diagnostics.expectFailure({ kind: 'response', method: 'GET', url, status: 500, count: 1, reason: 'The storage service throws on the deliberately nonexistent record; the portal returns a real lookup error.' });
  diagnostics.expectFailure({ kind: 'console', url, message: /Failed to load resource.*500/, count: 1, reason: 'Chromium reports the same nonexistent-record response.' });
  diagnostics.expectFailure({ kind: 'console', url: /\/angular\/form\/browser\/(?:main|chunk)(?:-[\w-]+)?\.js$/, message: /BehaviourHandler: Behaviour execution failed/, count: 1, reason: 'The form bundle logs its handled metadata lookup failure (including hashed production assets).' });
  await field(adminPage, 'Lookup record').fill(missing);
  await expect(field(adminPage, 'Lookup result')).toHaveValue('Lookup failed');
  await expect(field(adminPage, 'Event result')).toHaveValue('Waiting');
  await field(adminPage, 'Lookup record').fill(source.oid);
  await expect(field(adminPage, 'Lookup result')).toHaveValue('Recovered lookup / fetched');
  await expect(field(adminPage, 'Event result')).toHaveValue('Recovered lookup / fetched / event');
});

for (const removeTarget of [false, true]) {
  test(`F10 behaviour logical-row ${removeTarget ? 'discards a removed target' : 'follows its surviving target after reindexing'}`, async ({ adminPage, records }) => {
    const source = await records.create('e2e-initialisation-modes', { title: 'Delayed row metadata' });
    await openScenario(adminPage, 'behaviour-logical-row');
    const rows = adminPage.locator('redbox-form-repeatable .rb-form-repeatable-item');
    await expect(rows).toHaveCount(3);
    const gate = new ResponseGate(adminPage, { url: new RegExp(`/record/metadata/${source.oid}\\?`), method: 'GET' });
    await gate.install();
    try {
      await field(adminPage, 'Lookup record').fill(source.oid);
      expect((await gate.waitForCapture()).ok()).toBeTruthy();
      await rows.nth(removeTarget ? 1 : 0).getByRole('button', { name: /remove/i }).click();
      await expect(rows).toHaveCount(2);
      await gate.release();
      await expect(field(adminPage, 'Lookup result')).toHaveValue('Lookup complete');
      await expect(field(rows.nth(0), 'Row label')).toHaveValue(removeTarget ? 'Alpha' : 'Beta');
      await expect(field(rows.nth(0), 'Row result')).toHaveValue(removeTarget ? 'Waiting A' : 'Delayed row metadata / fetched');
      await expect(field(rows.nth(1), 'Row label')).toHaveValue('Gamma');
      await expect(field(rows.nth(1), 'Row result')).toHaveValue('Waiting C');
    } finally { await gate.dispose(); }
  });
}
