import type { Browser } from '@playwright/test';
import { expect, test } from '../fixtures/test';
import { createAuthenticatedContext, type Persona } from '../fixtures/auth';
import type { BrowserDiagnostics } from '../fixtures/diagnostics';
import { PortalApi } from '../fixtures/resources';
import { createRole, createUser, findUser, trackUser } from '../helpers/users';

async function assertManagementDenied(browser: Browser, persona: Persona, diagnostics: BrowserDiagnostics, area: 'users' | 'roles', userId: string): Promise<void> {
  const ordinary = await createAuthenticatedContext(browser, persona);
  diagnostics.attach(ordinary.page);
  try {
    const path = `/default/rdmp/admin/${area}`;
    const url = new URL(path, process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:1500').href;
    diagnostics.expectFailure({ kind: 'response', method: 'GET', url, status: 403, count: 1, reason: 'An ordinary Researcher has no permission to manage users or roles.' });
    diagnostics.expectFailure({ kind: 'console', url, message: /Failed to load resource.*403/, count: 1, reason: 'Chromium reports the denied administrative document.' });
    const response = await ordinary.page.goto(path);
    expect(response?.status()).toBe(403);
    await expect(ordinary.page.locator(`${area === 'users' ? 'manage-users' : 'manage-roles'} table`)).toHaveCount(0);
    const denied = await ordinary.context.request.post(area === 'users' ? '/default/rdmp/admin/users/update' : '/default/rdmp/admin/roles/user', {
      data: area === 'users' ? { userid: userId, details: { name: 'Unauthorized edit' } } : { userid: userId, roles: ['Admin'] },
      headers: { 'X-CSRF-Token': ordinary.csrfToken },
    });
    expect(denied.status()).toBe(403);
    if (area === 'users') {
      const api = new PortalApi(ordinary.context.request, ordinary.csrfToken);
      // Valid CSRF must not grant access to the newly registered Admin APIs.
      expect((await api.get('api/dashboard-config/dashboard-types')).status()).toBe(403);
      expect((await api.get('api/dashboard-config/dashboard-types/standard')).status()).toBe(403);
      expect((await api.mutate('post', 'api/dashboard-config/dashboard-types', { name: userId })).status()).toBe(403);
      expect((await api.mutate('put', 'api/dashboard-config/dashboard-types/standard', { name: 'standard' })).status()).toBe(403);
      expect((await api.mutate('delete', 'api/dashboard-config/dashboard-types/standard')).status()).toBe(403);
      expect((await api.mutate('delete', 'api/appconfig/systemMessage')).status()).toBe(403);
    }
  } finally { await ordinary.context.close(); }
}

test('A06 creates and edits a local user, persists an owned role and denies ordinary-user management', async ({ adminPage, adminCsrfToken, resources, browser, diagnostics }) => {
  const api = new PortalApi(adminPage.request, adminCsrfToken);
  const name = resources.name('A06', 'user');
  const password = 'Owned-playwright-password-42';
  const role = await createRole(api, resources, resources.name('A06', 'role'));
  await adminPage.goto('/default/rdmp/admin/users');
  const app = adminPage.locator('manage-users');
  await app.getByRole('button', { name: /Add a new local user/ }).click();
  const modal = app.getByRole('dialog');
  await modal.getByRole('textbox', { name: 'Username', exact: true }).fill(name);
  await modal.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await modal.getByRole('textbox', { name: 'Email Address', exact: true }).fill(`${name}@example.invalid`);
  await modal.getByLabel('Password', { exact: true }).fill(password);
  await modal.getByLabel('Confirm password', { exact: true }).fill(password);
  const researcher = modal.getByRole('checkbox', { name: 'Researcher', exact: true });
  if (!(await researcher.isChecked())) await researcher.locator('..').click();
  await expect(researcher).toBeChecked();
  const created = adminPage.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/admin/users/newUser'));
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  const createdResponse = await created;
  const user = await findUser(adminPage.request, name);
  trackUser(api, resources, user);
  expect(createdResponse.ok()).toBeTruthy();
  await expect(modal).toHaveCount(0);
  await app.locator('#manage-users-search').fill(name);
  const row = app.getByRole('row').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /Edit$/ }).click();
  await modal.locator('input[formcontrolname="name"]').fill(`${name} edited`);
  await modal.locator('input[formcontrolname="email"]').fill(`${name}-edited@example.invalid`);
  await modal.getByRole('checkbox', { name: role.name, exact: true }).locator('..').click();
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await adminPage.reload();
  await app.locator('#manage-users-search').fill(name);
  await row.getByRole('button', { name: /Edit$/ }).click();
  await expect(modal.locator('input[formcontrolname="name"]')).toHaveValue(`${name} edited`);
  await expect(modal.locator('input[formcontrolname="email"]')).toHaveValue(`${name}-edited@example.invalid`);
  await expect(modal.getByRole('checkbox', { name: role.name, exact: true })).toBeChecked();
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await assertManagementDenied(browser, { username: name, password }, diagnostics, 'users', user.id);
  expect((await findUser(adminPage.request, name)).name).toBe(`${name} edited`);
});

test('A12 searches a user and grants then removes an owned role with persisted permissions and ordinary-user denial', async ({ adminPage, adminCsrfToken, resources, browser, diagnostics }) => {
  const api = new PortalApi(adminPage.request, adminCsrfToken);
  const role = await createRole(api, resources, resources.name('A12', 'role'));
  const password = 'Owned-playwright-password-42';
  const user = await createUser(api, resources, resources.name('A12', 'user'), password);
  await adminPage.goto('/default/rdmp/admin/roles');
  const app = adminPage.locator('manage-roles');
  await app.getByRole('textbox').fill(user.name);
  const row = app.getByRole('row').filter({ hasText: user.name });
  await expect(row).toHaveCount(1);
  await row.getByText('Edit', { exact: true }).click();
  const modal = app.getByRole('dialog');
  await modal.getByRole('checkbox', { name: role.name, exact: true }).check();
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await adminPage.reload();
  await app.getByRole('textbox').fill(user.name);
  await expect(row).toContainText(role.name);
  await row.getByText('Edit', { exact: true }).click();
  await expect(modal.getByRole('checkbox', { name: role.name, exact: true })).toBeChecked();
  await modal.getByRole('checkbox', { name: role.name, exact: true }).uncheck();
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await adminPage.reload();
  await app.getByRole('textbox').fill(user.name);
  await expect(row).toContainText('Researcher');
  await expect(row).not.toContainText(role.name);
  await assertManagementDenied(browser, { username: user.username, password }, diagnostics, 'roles', user.id);
  expect((await findUser(adminPage.request, user.username)).roles.map(value => value.name)).toEqual(['Researcher']);
});
