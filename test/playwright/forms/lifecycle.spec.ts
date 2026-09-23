import { expect, test } from '../fixtures/test';
import { openScenario } from './_scenario';
import { field, saveForm } from '../helpers/forms';
import { trackRecord } from '../helpers/records';
import { ResponseGate } from '../helpers/response-gate';

test('F26 lifecycle-save-transition creates, updates and submits the same browser-owned record', async ({ adminPage, records, adminCsrfToken, resources }) => {
  await openScenario(adminPage, 'lifecycle-save-transition');
  await field(adminPage, 'Title').fill('Browser lifecycle');
  const created = adminPage.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/default/rdmp/recordmeta/e2e-lifecycle-save-transition');
  await adminPage.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await created;
  const { meta } = await response.json();
  if (meta.oid) trackRecord(adminPage.context().request, adminCsrfToken, resources, meta.oid);
  expect(response.ok()).toBeTruthy();
  expect(meta.oid).toEqual(expect.any(String));
  await expect(adminPage.locator('redbox-form-save-status .alert-success')).toBeVisible();
  await expect(adminPage).toHaveURL(new RegExp(`/record/edit/${meta.oid}$`));
  await field(adminPage, 'Notes').fill('Updated before submission');
  await saveForm(adminPage);
  await field(adminPage, 'Notes').fill('Submitted notes');
  const submitted = adminPage.waitForResponse(result => result.request().method() === 'PUT' && result.url().endsWith(`${meta.oid}?targetStep=submitted`));
  await adminPage.getByRole('button', { name: 'Submit record', exact: true }).click();
  const submittedResponse = await submitted;
  expect(submittedResponse.ok()).toBeTruthy();
  expect((await submittedResponse.json()).data.workflow.stage).toBe('submitted');
  await expect(adminPage.locator('redbox-form-save-status .alert-success')).toBeVisible();
  await adminPage.reload();
  await expect(adminPage.locator('redbox-form')).toContainText('Submitted record');
  await expect(adminPage.getByRole('button', { name: 'Submit record', exact: true })).toHaveCount(0);
  await expect(field(adminPage, 'Notes')).toHaveValue('Submitted notes');
  expect((await records.read(meta.oid)).body).toMatchObject({ title: 'Browser lifecycle', notes: 'Submitted notes' });
});

test('F27 lifecycle-failure-navigation recovers a failed save and respects cancelled and confirmed exits', async ({ adminPage, records, diagnostics }) => {
  const record = await records.create('e2e-lifecycle-failure-navigation', { title: 'Original title', notes: 'Original notes', serverValue: 'Original server value' });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  await field(adminPage, 'Title').fill('Recovered title');
  const url = new RegExp(`/recordmeta/${record.oid}(?:\\?|$)`);
  diagnostics.expectFailure({ kind: 'requestfailed', method: 'PUT', url, message: /net::ERR_FAILED/, count: 1, reason: 'The intentional pre-dispatch save fault must preserve the edited form.' });
  diagnostics.expectFailure({ kind: 'console', url, message: /Failed to load resource.*ERR_FAILED/, count: 1, reason: 'Chromium reports the intentionally aborted save.' });
  const abort = async (route: import('@playwright/test').Route) => { await route.abort('failed'); };
  await adminPage.route(url, abort);
  try {
    await adminPage.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(adminPage.locator('redbox-form-save-status [role="alert"]')).toContainText('We couldn’t confirm whether your changes were saved.');
    await expect(field(adminPage, 'Title')).toHaveValue('Recovered title');
    expect((await records.read(record.oid)).body).toMatchObject({ title: 'Original title' });
  } finally { await adminPage.unroute(url, abort); }
  await saveForm(adminPage);
  await field(adminPage, 'Notes').fill('Unsaved navigation choice');
  const currentUrl = adminPage.url();
  const dismissed = adminPage.waitForEvent('dialog').then(async dialog => { expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss(); });
  await adminPage.getByRole('link', { name: 'Home', exact: true }).click();
  await dismissed;
  await expect(adminPage).toHaveURL(currentUrl);
  await expect(field(adminPage, 'Notes')).toHaveValue('Unsaved navigation choice');
  const accepted = adminPage.waitForEvent('dialog').then(async dialog => { expect(dialog.type()).toBe('beforeunload'); await dialog.accept(); });
  await adminPage.getByRole('link', { name: 'Home', exact: true }).click();
  await accepted;
  await expect(adminPage).toHaveURL(/\/researcher\/home$/);
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  await expect(field(adminPage, 'Title')).toHaveValue('Recovered title');
  await expect(field(adminPage, 'Notes')).toHaveValue('Original notes');
});

for (const mode of ['always', 'never', 'preserveLocalEdits'] as const) {
  test(`F28 lifecycle-server-writeback reconciles the configured ${mode} policy`, async ({ adminPage, records }) => {
    const record = await records.create('e2e-lifecycle-server-writeback', { title: 'Mode setup', notes: 'Original notes', serverValue: 'Initial value' });
    await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
    await field(adminPage, 'Notes').fill(`Select ${mode}`);
    await adminPage.getByRole('button', { name: `Use ${mode}`, exact: true }).click();
    await expect(adminPage.locator('redbox-form-save-status .alert-success')).toBeVisible();
    await adminPage.reload();
    await field(adminPage, 'Title').fill(`Mode ${mode}`);
    await field(adminPage, 'Server value').fill('Local submitted value');
    await saveForm(adminPage);
    await expect(field(adminPage, 'Server value')).toHaveValue(mode === 'never' ? 'Local submitted value' : `Server: Mode ${mode}`);
    expect((await records.read(record.oid)).body).toMatchObject({ title: `Mode ${mode}`, serverValue: `Server: Mode ${mode}` });
    await adminPage.reload();
    await expect(field(adminPage, 'Server value')).toHaveValue(`Server: Mode ${mode}`);
  });
}

test('F29 lifecycle-edit-during-save preserves newer local work and applies independent server writeback', async ({ adminPage, records }) => {
  const record = await records.create('e2e-lifecycle-edit-during-save', { title: 'Initial title', notes: 'Original notes', serverValue: 'Initial value' });
  await adminPage.goto(`/default/rdmp/record/edit/${record.oid}`);
  await field(adminPage, 'Title').fill('Submitted title');
  const gate = new ResponseGate(adminPage, { method: 'PUT', url: new RegExp(`/recordmeta/${record.oid}(?:\\?|$)`) });
  await gate.install();
  try {
    await adminPage.getByRole('button', { name: 'Save', exact: true }).click();
    const response = await gate.waitForCapture();
    expect(response.ok()).toBeTruthy();
    await expect(adminPage.locator('redbox-form-save-status [role="status"]')).toContainText(/saving/i);
    expect((await records.read(record.oid)).body).toMatchObject({ title: 'Submitted title', serverValue: 'Server: Submitted title' });
    await field(adminPage, 'Title').fill('Later local title');
    await gate.release();
    await expect(adminPage.locator('redbox-form-save-status .alert-success')).toBeVisible();
    await expect(field(adminPage, 'Title')).toHaveValue('Later local title');
    await expect(field(adminPage, 'Server value')).toHaveValue('Server: Submitted title');
    await expect(adminPage.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  } finally { await gate.dispose(); }
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(field(adminPage, 'Title')).toHaveValue('Later local title');
  expect((await records.read(record.oid)).body).toMatchObject({ title: 'Later local title', serverValue: 'Server: Later local title' });
});
