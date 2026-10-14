import { expect, test } from '../fixtures/test';
import { ResponseGate } from '../helpers/response-gate';

test('A20 saves a disabled destination, locks pending edits and reopens masked credentials', async ({
  adminPage,
  resources,
  settings,
}) => {
  const original = await settings.capture('/default/rdmp/api/appconfig/siem');
  resources.track({
    kind: 'appconfig-restoration',
    id: original.path,
    cleanup: async () => {
      await settings.restore(original);
      await settings.verify(original);
    },
  });
  await adminPage.goto('/default/rdmp/admin/siem');
  const app = adminPage.locator('siem-admin');
  await expect(app.locator('input[name="enabled"]')).not.toBeChecked();
  await app.getByRole('button', { name: 'Add destination', exact: true }).click();
  const name = resources.name('A20', 'collector');
  await app.locator('#siem-dest-name').fill(name);
  await app.locator('input[name="destEnabled"]').uncheck();
  await app.locator('#siem-dest-endpoint').fill('https://collector.example.test/logs');
  await app.locator('#siem-dest-token').fill('playwright-fixture-token');
  const gate = new ResponseGate(adminPage, { url: '/api/siem/config', method: 'PUT' });
  await gate.install();
  try {
    await app.getByRole('button', { name: 'Save changes', exact: true }).click();
    expect((await gate.waitForCapture()).ok()).toBeTruthy();
    await expect(app.locator('#siem-dest-name')).toBeDisabled();
    await expect(app.locator('input[name="enabled"]')).toBeDisabled();
    await gate.release();
    await expect(app).toContainText('SIEM configuration saved.');
    await expect(app.locator('#siem-dest-name')).toBeEnabled();
    await expect(app.locator('#siem-dest-token')).toHaveValue('__REDACTED__');
  } finally {
    await gate.dispose();
  }
  await adminPage.reload();
  await app.locator('.siem-tabs').getByText('Destinations', { exact: true }).click();
  await app.locator('.siem-dest-list__item').filter({ hasText: name }).click();
  await expect(app.locator('#siem-dest-name')).toHaveValue(name);
  await expect(app.locator('#siem-dest-endpoint')).toHaveValue('https://collector.example.test/logs');
  await expect(app.locator('#siem-dest-token')).toHaveValue('__REDACTED__');
  await expect(app.locator('input[name="destEnabled"]')).not.toBeChecked();
  await expect(app.locator('input[name="enabled"]')).not.toBeChecked();
});
