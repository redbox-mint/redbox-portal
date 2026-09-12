import { expect, test } from './fixtures/test';
import { assertSmokeRoute } from './helpers';
import { applicationManifest } from './coverage/applications';
import { routeForEntry } from './apps/_routes';
import { baseAssetIncludes, smokeRoutes } from './routes';

const recordSearchPath = '/default/rdmp/record/search';
const anonymousRoutes = smokeRoutes.filter(route => route.auth === 'anonymous' && route.path !== recordSearchPath);
const adminRoutes = smokeRoutes.filter(route => route.auth === 'admin' || route.path === recordSearchPath);

test.describe('anonymous smoke routes', () => {
  for (const route of anonymousRoutes) {
    test(`renders ${route.path}`, async ({ page }) => {
      await assertSmokeRoute(page, route, baseAssetIncludes);
    });
  }
});

test.describe('admin smoke routes', () => {
  test('sizes dashboard fallback loader before Angular bootstraps', async ({ adminPage, diagnostics }) => {
    const page = adminPage;
    diagnostics.expectFailure({
      kind: 'requestfailed',
      method: 'GET',
      message: 'net::ERR_FAILED',
      url: /angular\/dashboard\/browser\/main.*\.js/,
      count: 1,
      reason: 'The fallback-loader probe intentionally aborts the dashboard bundle.',
    });
    diagnostics.expectFailure({ kind: 'console', url: /angular\/dashboard\/browser\/main.*\.js/, message: /Failed to load resource.*net::ERR_FAILED/, count: 1, reason: 'Chromium reports the intentionally aborted dashboard bundle.' });
    await page.route('**/angular/dashboard/browser/main*.js', async route => route.abort());
    await page.goto('/default/rdmp/dashboard/rdmp', { waitUntil: 'domcontentloaded' });

    const loader = page.locator('dashboard img[src$="/images/loading.svg"]').first();
    await expect(loader).toBeVisible();
    await expect(loader).toHaveCSS('width', '120px');
    await expect(loader).toHaveCSS('height', '120px');
  });

  for (const route of adminRoutes) {
    test(`renders ${route.path}`, async ({ adminPage, adminCsrfToken, resources }) => {
      const entry = applicationManifest.find(entry => entry.route === route.path);
      const preparedRoute = entry ? await routeForEntry(route.path, entry.id, adminPage, adminCsrfToken, resources) : route.path;
      const requiredSelectors = [...route.requiredSelectors, ...(entry?.usefulSelectors ?? [])];
      await assertSmokeRoute(adminPage, { ...route, path: preparedRoute, requiredSelectors }, baseAssetIncludes);
    });
  }
});
