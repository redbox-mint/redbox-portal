import { expect, test } from '../fixtures/test';

test('A24 opens an unsaved provider editor and derives its key from the name', async ({ adminPage }) => {
  await adminPage.goto('/default/rdmp/admin/ai-models');
  const app = adminPage.locator('admin-ai-models');
  await app.locator('.rb-admin-page-actions').getByRole('button', { name: 'Add provider', exact: true }).click();
  await app.locator('#provider-name').fill('Browser provider');
  await expect(app.locator('#provider-key')).toHaveValue('browser-provider');
  await expect(app.locator('.rb-admin-save-bar')).toBeVisible();
  await expect(app.getByRole('button', { name: 'Test connection', exact: true })).toBeVisible();
});

test('A25 opens a profile editor with real source record types and target forms', async ({ adminPage }) => {
  await adminPage.goto('/default/rdmp/admin/ai-profiles');
  const app = adminPage.locator('admin-ai-profiles');
  await app.locator('.rb-admin-page-actions').getByRole('button', { name: 'Create profile', exact: true }).click();
  const dialog = app.getByRole('dialog');
  await dialog.locator('#profile-create-name').fill('Browser drafting profile');
  await dialog.locator('#profile-create-source').selectOption('rdmp');
  await expect(dialog.locator('#profile-create-source')).toHaveValue('rdmp');
  await expect(dialog.locator('#profile-create-target option').first()).toBeAttached();
  await expect(dialog.getByRole('button', { name: 'Create profile', exact: true })).toBeEnabled();
});
