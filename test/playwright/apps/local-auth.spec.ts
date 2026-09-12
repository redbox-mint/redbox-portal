import { expect, test } from '../fixtures/test';

test('A01 local authentication login and logout', async ({ page }) => {
  await page.goto('/default/rdmp/user/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#adminLoginShow a[data-bs-target="#adminLogin"]').click();
  await expect(page.locator('#username')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await page.locator('#username').fill('invalid-playwright-user');
  await page.locator('#password').fill('invalid-password');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('body')).toContainText(/incorrect|invalid|error|failed/i);
  await page.locator('#username').fill(process.env.PLAYWRIGHT_ADMIN_USER ?? 'admin');
  await page.locator('#password').fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'rbadmin');
  await page.locator('button[type="submit"]').click();
  const logout = page.getByRole('link', { name: /log ?out/i }).first();
  await expect(logout).toBeVisible();
  await logout.click();
  await expect(page.getByRole('link', { name: /login/i }).first()).toBeVisible();
});
