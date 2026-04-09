import { test } from '@playwright/test';
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

  for (const route of adminRoutes) {
    test(`renders ${route.path}`, async ({ page }) => {
      await assertSmokeRoute(page, route, baseAssetIncludes);
    });
  }
});
