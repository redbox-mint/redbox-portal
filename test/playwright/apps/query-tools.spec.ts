import { expect, test } from '../fixtures/test';

test('A22 refreshes MCP readiness without exposing assistant credentials', async ({ adminPage }) => {
  await adminPage.goto('/default/rdmp/admin/mcp');
  const app = adminPage.locator('mcp-connect');
  await expect(app.getByRole('heading', { name: 'Connect your AI assistant', exact: true })).toBeVisible();
  const refresh = app.getByRole('button', { name: 'Re-check', exact: true });
  await expect(refresh).toBeEnabled();
  const pending = adminPage.waitForResponse(response =>
    response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/admin/mcp/status'));
  await refresh.click();
  const response = await pending;
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const status = body.data ?? body;
  expect(['ready', 'needs-configuration', 'reporting-disabled', 'oidc-required', 'no-reporting-access']).toContain(status.state);
  expect(JSON.stringify(status)).not.toMatch(/"clientSecret"\s*:/);
  await expect(refresh).toBeEnabled();
  await expect(app.locator('.mcp-readiness-checks, #mcp-choose-heading')).toBeVisible();
});

test('A23 opens a visual record query with the available record types', async ({ adminPage }) => {
  await adminPage.goto('/default/rdmp/admin/data-grids');
  const app = adminPage.locator('data-grids');
  await expect(app.locator('#grid-search')).toBeVisible();
  await app.locator('.rb-admin-page-actions').getByRole('button', { name: 'New query', exact: true }).click();
  await expect(app.locator('#query-title')).toBeVisible();
  const recordType = app.locator('#grid-type');
  await expect(recordType).toBeVisible();
  await expect(recordType.locator('option[value="rdmp"]')).toHaveCount(1);
  await recordType.selectOption('rdmp');
  await expect(recordType).toHaveValue('rdmp');
  await expect(app.locator('#grid-stage')).toBeEnabled();
});
