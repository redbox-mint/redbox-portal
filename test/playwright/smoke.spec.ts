import { expect, test } from './fixtures/test';
import { assertSmokeRoute } from './helpers';
import { applicationManifest } from './coverage/applications';
import { routeForEntry } from './apps/_routes';
import { baseAssetIncludes, smokeRoutes } from './routes';

const recordSearchPath = '/default/rdmp/record/search';
const anonymousRoutes = smokeRoutes.filter(route => route.auth === 'anonymous' && route.path !== recordSearchPath);
const adminRoutes = smokeRoutes
  .filter(route => route.auth === 'admin' || route.path === recordSearchPath)
  .flatMap(route => {
    const adminPath = /^\/default\/rdmp\/admin(?:\/|$)/.test(route.path);
    const canonical = { ...route, adminPath };
    if (route.path !== '/default/rdmp/admin/users') return [canonical];
    const requiredAssetIncludes = [...route.requiredAssetIncludes, '/styles/admin-fonts/fonts.css'];
    return [
      canonical,
      { ...canonical, path: '/def%61ult/rdmp/admin/users', requiredAssetIncludes },
      { ...canonical, path: '/default/%72dmp/admin/users', requiredAssetIncludes },
    ];
  });

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
      const origin = new URL(adminPage.url()).origin;
      const externalRequests: string[] = [];
      if (route.adminPath) {
        adminPage.on('request', request => {
          const url = new URL(request.url());
          if (/^https?:$/.test(url.protocol) && url.origin !== origin) externalRequests.push(url.href);
        });
      }

      await assertSmokeRoute(adminPage, { ...route, path: preparedRoute, requiredSelectors }, baseAssetIncludes);
      if (route.rootSelector === '#redoc') {
        const logo = adminPage.locator('#redoc img[alt="redocly logo"]').first();
        await expect
          .poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
          .toBe(true);
        const url = await logo.evaluate((image: HTMLImageElement) => image.currentSrc);
        expect(new URL(url).origin).toBe(origin);
      }
      if (route.adminPath) {
        await adminPage.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(externalRequests, `${route.path} made external requests`).toEqual([]);
      }
    });
  }
});
