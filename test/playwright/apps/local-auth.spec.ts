import { expect, test } from '../fixtures/test';
import { assertAuthenticated } from '../fixtures/auth';

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


test('A01 waits for landing-page fonts before reporting authentication readiness', async ({ adminPage }) => {
  let releaseFont!: () => void;
  const released = new Promise<void>(resolve => { releaseFont = resolve; });
  let captureFont!: () => void;
  const captured = new Promise<void>(resolve => { captureFont = resolve; });
  let held = false;
  await adminPage.route('**/*.woff2', async route => {
    if (held) { await route.fallback(); return; }
    held = true;
    const response = await route.fetch();
    captureFont();
    await released;
    await route.fulfill({ response });
  });
  let ready = false;
  const checking = assertAuthenticated(adminPage).then(() => { ready = true; });
  try {
    await captured;
    await expect(adminPage.locator('.admin-main-content')).toBeVisible();
    await adminPage.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    expect(ready).toBe(false);
    releaseFont();
    await checking;
    expect(await adminPage.evaluate(() => document.fonts.status)).toBe('loaded');
  } finally {
    releaseFont();
    await checking;
    await adminPage.unroute('**/*.woff2');
  }
});
