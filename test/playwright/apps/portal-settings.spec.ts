import { expect, test } from '../fixtures/test';
import { field } from '../helpers/forms';
import { PortalApi } from '../fixtures/resources';

test('A14 saves a system message, shows its effect and restores the original value and override presence', async ({ adminPage, resources, settings }) => {
  const original = await settings.capture('/default/rdmp/api/appconfig/systemMessage');
  const title = resources.name('A14', 'system-message');
  resources.track({ kind: 'appconfig-restoration', id: original.path, cleanup: async () => {
    await settings.restore(original);
    await settings.verify(original);
    await adminPage.goto('/default/rdmp/researcher/home');
    await expect(adminPage.getByText(title, { exact: true })).toHaveCount(0);
  } });
  await adminPage.goto('/default/rdmp/admin/appconfig/edit/systemMessage');
  const app = adminPage.locator('app-config');
  await app.getByRole('checkbox', { name: 'Enabled', exact: true }).check();
  await app.getByRole('textbox', { name: 'Message Title', exact: true }).fill(title);
  await app.getByRole('textbox', { name: 'Message Body', exact: true }).fill('Owned regression announcement');
  await app.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(app).toContainText('Configuration saved successfully');
  await adminPage.reload();
  await expect(app.getByRole('textbox', { name: 'Message Title', exact: true })).toHaveValue(title);
  await adminPage.goto('/default/rdmp/researcher/home');
  await expect(adminPage.getByText(title, { exact: true })).toBeVisible();
  await expect(adminPage.getByText('Owned regression announcement', { exact: true })).toBeVisible();
});

test('A18 edits a dedicated translation, reopens it and verifies the form uses and then restores it', async ({ adminPage, adminCsrfToken, resources, records, settings }) => {
  const key = '@playwright-regression-translation';
  const path = `/default/rdmp/api/i18n/entries/en/translation/${encodeURIComponent(key)}`;
  const original = await settings.capture(path);
  const record = await records.create('e2e-initialisation-modes', { title: 'Translation record', translationExample: 'Translation sample' });
  const recordUrl = `/default/rdmp/record/edit/${record.oid}`;
  await adminPage.goto(recordUrl);
  const label = adminPage.locator('label').filter({ hasText: original.existed ? String((original.value as { value: unknown }).value) : key }).first();
  const originalLabel = await label.innerText();
  await expect(field(adminPage, originalLabel)).toHaveValue('Translation sample');
  resources.track({ kind: 'translation-restoration', id: path, cleanup: async () => {
    await settings.restore(original);
    await settings.verify(original);
    await adminPage.goto(recordUrl);
    await expect(field(adminPage, originalLabel)).toHaveValue('Translation sample');
  } });
  const api = new PortalApi(adminPage.request, adminCsrfToken);
  const seeded = await api.mutate('post', path, { value: 'Original regression label', category: 'Regression', contentFormat: 'plain' });
  expect(seeded.ok()).toBeTruthy();
  await adminPage.goto('/default/rdmp/admin/translation');
  const app = adminPage.locator('app-root');
  await expect(app.locator('#tx-lang-select')).toHaveValue('en');
  await app.getByRole('searchbox', { name: 'Search', exact: true }).fill(key);
  const row = app.getByRole('row').filter({ hasText: key });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /edit/i }).click();
  const modal = app.getByRole('dialog', { name: /Edit translation/ });
  const changed = resources.name('A18', 'translated-label');
  await modal.getByRole('textbox').fill(changed);
  await modal.getByRole('button', { name: 'Save translation', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(row).toContainText(changed);
  await adminPage.reload();
  await app.getByRole('searchbox', { name: 'Search', exact: true }).fill(key);
  await expect(row).toContainText(changed);
  await row.getByRole('button', { name: /edit/i }).click();
  await expect(modal.getByRole('textbox')).toHaveValue(changed);
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await adminPage.goto(recordUrl);
  await expect(field(adminPage, changed)).toHaveValue('Translation sample');
});

type BrandingState = {
  active: { version: number; hash: string; variables: Record<string, string>; typeface: unknown };
  draft: { revision: number; variables: Record<string, string>; typeface: unknown };
};

test('A17 edits and previews a saved branding draft, reopens it and restores the captured draft', async ({ adminPage, adminCsrfToken, resources }) => {
  const api = new PortalApi(adminPage.request, adminCsrfToken);
  const read = async (): Promise<BrandingState> => {
    const response = await api.get('app/branding/config');
    if (!response.ok()) throw new Error(`Cannot read branding (${response.status()}).`);
    return (await response.json()) as BrandingState;
  };
  const original = await read();
  const key = 'header-branding-background-color';
  const value = original.draft.variables[key] === '#123456' ? '#654321' : '#123456';
  resources.track({ kind: 'branding-draft-restoration', id: 'default', cleanup: async () => {
    const current = await read();
    const restored = await api.mutate('post', 'app/branding/draft', {
      variables: original.draft.variables, expectedDraftRevision: current.draft.revision,
    });
    expect(restored.ok()).toBeTruthy();
    const final = await read();
    expect(final.active).toEqual(original.active);
    expect(final.draft.variables).toEqual(original.draft.variables);
    expect(final.draft.typeface).toEqual(original.draft.typeface);
    await adminPage.goto('/default/rdmp/admin/branding');
    await expect(adminPage.locator(`#${key}`)).toHaveValue(original.draft.variables[key] ?? '#f4f4f4');
  } });
  await adminPage.goto('/default/rdmp/admin/branding');
  const app = adminPage.locator('branding-admin-root');
  const colour = app.locator(`#${key}`).locator('..').locator('input[type="text"]');
  await colour.fill(value);
  await app.getByRole('button', { name: /Save Draft/ }).click();
  await expect(app.locator('.alert-success')).toContainText(/draft.*saved/i);
  await app.getByRole('button', { name: /Generate Preview/ }).click();
  const preview = app.locator('branding-preview');
  await expect(preview.locator('.header-area')).toHaveCSS('background-color', value === '#123456' ? 'rgb(18, 52, 86)' : 'rgb(101, 67, 33)');
  await adminPage.reload();
  await expect(colour).toHaveValue(value);
  const changed = await read();
  expect(changed.draft.variables[key]).toBe(value);
  expect(changed.active).toEqual(original.active);
});
