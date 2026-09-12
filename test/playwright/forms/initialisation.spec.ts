import { expect, test } from '../fixtures/test';
import { openScenario } from './_scenario';
import { ResponseGate } from '../helpers/response-gate';
import { field, saveForm } from '../helpers/forms';
import { trackRecord } from '../helpers/records';

test('A13 create and update a form through its configured save action', async ({ adminPage, adminCsrfToken, resources }) => {
  await openScenario(adminPage, 'initialisation-modes');
  const title = field(adminPage, 'Title');
  await title.fill('Created in the browser');
  const created = adminPage.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/default/rdmp/recordmeta/e2e-initialisation-modes');
  await adminPage.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await created;
  const body = await response.json();
  const oid = body.oid ?? body.meta?.oid ?? body.data?.oid;
  expect(oid).toEqual(expect.any(String));
  trackRecord(adminPage.context().request, adminCsrfToken, resources, oid);
  expect(response.ok()).toBeTruthy();
  await expect(adminPage.locator('redbox-form-save-status .alert-success')).toBeVisible();
  await adminPage.goto(`/default/rdmp/record/edit/${oid}`);
  await expect(title).toHaveValue('Created in the browser');
  await title.fill('Updated in the browser');
  await saveForm(adminPage);
  await adminPage.reload();
  await expect(title).toHaveValue('Updated in the browser');
  await expect(field(adminPage, 'Calculated description')).toHaveValue('Updated in the browser / calculated');
});

test('F01 initialisation modes hydrate defaults, stored values and a read-only form', async ({ adminPage, records }) => {
  await openScenario(adminPage, 'initialisation-modes');
  await expect(field(adminPage, 'Title')).toHaveValue('Initial title');
  await expect(field(adminPage, 'Calculated description')).toHaveValue('Initial title / calculated');
  await expect(field(adminPage, 'RDMP')).toHaveValue('Translated field');
  const owned = await records.create('e2e-initialisation-modes', { title: 'Stored title', translated: 'Stored translated field' });
  await adminPage.goto(`/default/rdmp/record/edit/${owned.oid}`);
  await expect(field(adminPage, 'Title')).toHaveValue('Stored title');
  await expect(field(adminPage, 'Calculated description')).toHaveValue('Stored title / calculated');
  await adminPage.reload();
  await expect(field(adminPage, 'Title')).toHaveValue('Stored title');
  await adminPage.goto(`/default/rdmp/record/view/${owned.oid}`);
  const form = adminPage.locator('redbox-form');
  await expect(form).toContainText('Stored title');
  await expect(form).toContainText('Stored translated field');
  await expect(form.locator('input, textarea, select')).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await adminPage.reload();
  await expect(form).toContainText('Stored title');
  await expect(form.locator('input, textarea, select')).toHaveCount(0);
});

for (const [dependency, url] of [
  ['client configuration', /\/dynamic\/apiClientConfig(?:\?|$)/],
  ['translations', /\/locales\/en\/translation\.json(?:\?|$)/],
  ['form configuration', /\/record\/form\/e2e-initialisation-dependencies(?:\?|$)/],
  ['compiled expressions', /\/dynamicAsset\/formCompiledItems\/e2e-initialisation-dependencies(?:\?|$)/],
] as const) {
  test(`F02 initialisation dependencies complete passively after delayed ${dependency}`, async ({ adminPage }) => {
    for (const reload of [false, true]) {
      const gate = new ResponseGate(adminPage, { url, method: 'GET' });
      await gate.install();
      try {
        const navigation = reload ? adminPage.reload({ waitUntil: 'domcontentloaded' }) : adminPage.goto('/default/rdmp/record/e2e-initialisation-dependencies/edit', { waitUntil: 'domcontentloaded' });
        const response = await gate.waitForCapture();
        expect(response.ok()).toBeTruthy();
        const calculated = field(adminPage, 'Calculated description');
        await expect.poll(async () => (await calculated.count()) > 0 &&
          (await calculated.inputValue()) === 'Initial title / calculated').toBe(false);
        await gate.release();
        await navigation;
        await expect(field(adminPage, 'RDMP')).toHaveValue('Translated field');
        await expect(field(adminPage, 'Calculated description')).toHaveValue('Initial title / calculated');
      } finally {
        await gate.dispose();
      }
    }
  });
}
