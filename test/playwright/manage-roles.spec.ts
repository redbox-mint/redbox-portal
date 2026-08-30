import { expect, test, type Page, type Route } from '@playwright/test';
import { adminStorageStatePath } from './helpers';

const basePath = '/default/rdmp/api/authorization';
const roleSummary = {
  id: 'role-researcher',
  key: 'researcher',
  displayName: 'Researcher',
  contextType: 'brand',
  brandId: 'brand-1',
  protectedKind: 'none',
  status: 'active',
  templateKey: 'researcher',
  templateRevision: 1,
  version: 2,
};
const roleDetail = {
  ...roleSummary,
  baseScopeKeys: ['record.read'],
  effectiveScopeKeys: ['record.read'],
  overrides: [],
};
const template = {
  key: 'researcher',
  displayName: 'Researcher',
  description: 'Researcher baseline',
  currentRevision: 2,
  protectedKind: 'none',
  status: 'active',
  version: 2,
  revisions: [],
  revisionsTruncated: false,
};
const catalogScope = {
  key: 'record.read',
  namespace: 'record',
  label: 'Read records',
  description: 'Read records in the active brand.',
  risk: 'read',
  sourceType: 'core',
  sourcePackage: '@researchdatabox/redbox-core',
  sourceVersion: '1',
  status: 'active',
  metadataVersion: 1,
};

function projection(system: boolean) {
  return {
    brand: { id: 'brand-1', name: 'Test brand' },
    rolloutMode: 'shadow',
    principal: {
      category: system ? 'system-admin' : 'authenticated',
      authMethod: 'session',
      active: true,
      userId: system ? 'system-user' : 'brand-user',
    },
    roles: [],
    scopeKeys: [
      'authorization.self.read',
      'authorization.role.read',
      'authorization.role.manage',
      'authorization.assignment.read',
      'authorization.assignment.manage',
      'authorization.scope.read',
      'authorization.audit.read',
      'record.read',
      ...(system ? ['system.authorization.manage'] : []),
    ],
  };
}

async function mockAuthorizationContract(page: Page, system: boolean): Promise<void> {
  await page.route('**/api/authorization/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(url.pathname.indexOf(basePath) + basePath.length);
    const fulfill = (json: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', json });
    if (path === '/me') return fulfill(projection(system));
    if (path === '/scopes') return fulfill({ generation: 'playwright-generation', items: [catalogScope] });
    if (path === '/templates') return fulfill({ items: [template] });
    if (path === '/templates/researcher/revisions/2')
      return fulfill({
        templateKey: 'researcher',
        revision: 2,
        scopeKeys: ['record.read'],
        publishedBy: 'admin',
        publishedAt: '2026-01-01T00:00:00Z',
      });
    if (path === '/roles' && request.method() === 'GET') return fulfill({ items: [roleSummary] });
    if (path === '/roles/researcher') return fulfill(roleDetail);
    if (path === '/assignments' && request.method() === 'GET') return fulfill({ items: [] });
    if (path === '/assignments/researcher/users/user-1' && request.method() === 'PUT') {
      return fulfill({
        data: { id: 'assignment-1' },
        version: 1,
        auditEventId: 'audit-1',
        requestId: 'request-1',
        changed: true,
      });
    }
    if (path === '/audit') return fulfill({ items: [] });
    if (path === '/template-upgrades/bulk-preview' && request.method() === 'POST') {
      return fulfill({
        operation: 'template-bulk-upgrade',
        templateKey: 'researcher',
        targetRevision: 2,
        roles: [
          {
            roleId: 'role-researcher',
            roleKey: 'researcher',
            brandId: 'brand-1',
            expectedVersion: 2,
            currentRevision: 1,
            targetRevision: 2,
            addedScopeKeys: [],
            removedScopeKeys: [],
            changed: true,
          },
        ],
        warnings: [],
        fatalErrors: [],
        confirmationToken: 'preview-token',
      });
    }
    if (path === '/template-upgrades/bulk-apply' && request.method() === 'POST') {
      return fulfill({
        data: { appliedCount: 1, noOpCount: 0, targetRevision: 2 },
        version: 3,
        auditEventId: 'audit-bulk-1',
        requestId: 'request-bulk-1',
        changed: true,
      });
    }
    return fulfill(
      {
        type: 'about:blank',
        title: 'Unexpected mocked request',
        status: 400,
        detail: 'Unexpected request',
        instance: url.pathname,
        code: 'authorization.invalid-request',
        requestId: 'playwright-unexpected',
      },
      400
    );
  });
}

test.describe('authorization administration workflows', () => {
  test.use({ storageState: adminStorageStatePath });

  test('brand administrator can use keyboard tabs and grant a manual source without system controls', async ({
    page,
  }) => {
    await mockAuthorizationContract(page, false);
    await page.goto('/default/rdmp/admin/roles?tab=roles');
    await expect(page.locator('#authorization-admin-heading')).toBeVisible();
    await expect(page.getByText('Selected-role template upgrade')).toHaveCount(0);

    await page.locator('#authorization-tab-roles').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#authorization-tab-assignments')).toBeFocused();
    await expect(page.locator('#assignments-heading')).toBeVisible();

    await page.locator('#grant-user').fill('user-1');
    await page.locator('#grant-role').selectOption('researcher');
    const mutation = page.waitForRequest(
      request => request.method() === 'PUT' && request.url().includes('/assignments/researcher/users/user-1')
    );
    await page.getByRole('button', { name: 'Grant / reactivate' }).click();
    const mutationRequest = await mutation;
    expect(mutationRequest.postDataJSON()).toEqual({});
    await expect(page.locator('authorization-assignment-list [aria-live="polite"]')).toContainText(
      'granted or reactivated'
    );
  });

  test('system administrator gets selected-role upgrade preview and accessible audit tab focus', async ({ page }) => {
    await mockAuthorizationContract(page, true);
    await page.goto('/default/rdmp/admin/roles?tab=roles');
    await expect(page.getByText('Selected-role template upgrade')).toBeVisible();
    await page.getByLabel('Select Researcher').check();
    await page.locator('#bulk-template').selectOption('researcher');
    const previewButton = page.getByRole('button', { name: 'Preview selected upgrades' });
    await previewButton.click();
    const dialog = page.getByRole('dialog', { name: 'Server impact preview' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();
    await expect(page.locator('authorization-role-list > section')).toHaveAttribute('inert', '');
    await expect(dialog.getByRole('button', { name: 'Apply selected upgrades' })).toBeEnabled();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Apply selected upgrades' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Apply selected upgrades' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(previewButton).toBeFocused();

    await previewButton.click();
    await page
      .getByRole('dialog', { name: 'Server impact preview' })
      .getByRole('button', {
        name: 'Apply selected upgrades',
      })
      .click();
    await expect(page.locator('#bulk-upgrade-heading')).toBeFocused();
    await expect(page.locator('authorization-role-list [aria-live="polite"]')).toContainText(
      'Selected-role template upgrades applied.'
    );

    await page.locator('#authorization-tab-roles').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#authorization-tab-audit')).toBeFocused();
    await expect(page.locator('#audit-heading')).toBeVisible();
  });

  test('effective scopes fail closed without mounting an unauthorized tab panel', async ({ page }) => {
    let unexpectedCatalogRequest = false;
    await page.route('**/api/authorization/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/api/authorization/me')) {
        await route.fulfill({
          contentType: 'application/json',
          json: {
            ...projection(false),
            scopeKeys: ['authorization.self.read'],
          },
        });
        return;
      }
      unexpectedCatalogRequest = true;
      await route.fulfill({ status: 403, contentType: 'application/json', json: {} });
    });

    await page.goto('/default/rdmp/admin/roles?tab=roles');

    await expect(page.getByText('do not have access to any authorization administration section')).toBeVisible();
    await expect(page.locator('[role="tabpanel"]')).toHaveCount(0);
    expect(unexpectedCatalogRequest).toBe(false);
  });
});

test('direct authorization administration URL is denied without an authenticated admin session', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/default/rdmp/admin/roles', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('manage-roles #authorization-admin-heading')).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toBe('/default/rdmp/admin/roles');
  } finally {
    await context.close();
  }
});
