import { expect, test } from '@playwright/test';
import { adminStorageStatePath, assertSmokeRoute } from './helpers';
import { baseAssetIncludes, smokeRoutes } from './routes';

const recordSearchPath = '/default/rdmp/record/search';
const anonymousRoutes = smokeRoutes.filter((route) => route.auth === 'anonymous' && route.path !== recordSearchPath);
const adminRoutes = smokeRoutes.filter((route) => route.auth === 'admin' || route.path === recordSearchPath);

test.describe('anonymous smoke routes', () => {
  for (const route of anonymousRoutes) {
    test(`renders ${route.path}`, async ({ page }) => {
      await assertSmokeRoute(page, route, baseAssetIncludes);
    });
  }
});

test.describe('admin smoke routes', () => {
  test.use({ storageState: adminStorageStatePath });

  test('sizes dashboard fallback loader before Angular bootstraps', async ({ page }) => {
    await page.route('**/angular/dashboard/browser/main*.js', async (route) => route.abort());
    await page.goto('/default/rdmp/dashboard/rdmp', { waitUntil: 'domcontentloaded' });

    const loader = page.locator('dashboard img[src$="/images/loading.svg"]').first();
    await expect(loader).toBeVisible();
    await expect(loader).toHaveCSS('width', '120px');
    await expect(loader).toHaveCSS('height', '120px');
  });

  for (const route of adminRoutes) {
    test(`renders ${route.path}`, async ({ page }) => {
      await assertSmokeRoute(page, route, baseAssetIncludes);
    });
  }
});
