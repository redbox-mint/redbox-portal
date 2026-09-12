import { expect, test } from '../fixtures/test';
import { createAuthenticatedContext } from '../fixtures/auth';
import { field, saveForm } from '../helpers/forms';

test('F30 lifecycle-two-session-conflict reviews real stale changes and saves an explicit resolution', async ({ browser, adminPage, records, diagnostics }) => {
  const owned = await records.create('e2e-lifecycle-two-session-conflict', {
    title: 'Playwright conflict original',
    notes: 'Original shared notes', serverValue: 'Original value',
  });
  const second = await createAuthenticatedContext(browser);
  diagnostics.attach(second.page);
  try {
    const secondPage = second.page;
    await adminPage.goto(`/default/rdmp/record/edit/${owned.oid}`);
    await secondPage.goto(`/default/rdmp/record/edit/${owned.oid}`, { waitUntil: 'domcontentloaded' });
    await expect(field(secondPage, 'Title')).toHaveValue('Playwright conflict original');
    await field(adminPage, 'Title').fill('Session A title');
    await saveForm(adminPage);
    await field(secondPage, 'Title').fill('Session B title');
    await field(secondPage, 'Notes').fill('Session B non-conflicting notes');
    const url = new RegExp(`/recordmeta/${owned.oid}(?:\\?|$)`);
    diagnostics.expectFailure({ kind: 'response', method: 'PUT', url, status: 412, count: 1, reason: 'Session B submits the original opaque revision after A has saved.' });
    diagnostics.expectFailure({ kind: 'console', url, message: /Failed to load resource.*412/, count: 1, reason: 'Chromium reports the same real conflict response.' });
    const rejected = secondPage.waitForResponse(response => response.request().method() === 'PUT' && url.test(response.url()));
    await secondPage.getByRole('button', { name: 'Save', exact: true }).click();
    const rejection = await rejected;
    expect((await rejection.json()).meta.problems).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'conflict' })]));
    const conflict = secondPage.locator('redbox-form-conflict-presenter');
    await conflict.getByRole('button', { name: 'Review changes', exact: true }).click();
    const titleChoice = conflict.getByRole('group', { name: 'Title', exact: true });
    await expect(titleChoice).toContainText('Session A title');
    await expect(titleChoice).toContainText('Session B title');
    await expect(conflict.getByRole('button', { name: 'Save resolved changes', exact: true })).toBeDisabled();
    expect((await records.read(owned.oid)).body).toMatchObject({ title: 'Session A title', notes: 'Original shared notes' });
    await titleChoice.getByRole('radio', { name: /Mine/ }).check();
    await conflict.getByRole('button', { name: 'Save resolved changes', exact: true }).click();
    await expect(secondPage.locator('redbox-form-save-status .alert-success')).toBeVisible();
    expect((await records.read(owned.oid)).body).toMatchObject({ title: 'Session B title', notes: 'Session B non-conflicting notes' });
    const fresh = await createAuthenticatedContext(browser);
    diagnostics.attach(fresh.page);
    try {
      await fresh.page.goto(`/default/rdmp/record/edit/${owned.oid}`);
      await expect(field(fresh.page, 'Title')).toHaveValue('Session B title');
      await expect(field(fresh.page, 'Notes')).toHaveValue('Session B non-conflicting notes');
    } finally { await fresh.context.close(); }
  } finally {
    await second.context.close();
  }
});
