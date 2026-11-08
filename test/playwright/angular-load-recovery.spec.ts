import { expect, test } from '@playwright/test';
import { adminStorageStatePath } from './helpers';

test.describe('Angular bootstrap recovery', () => {
  test.use({ storageState: adminStorageStatePath });

  for (const endpoint of ['csrfToken', 'dynamic/apiClientConfig*']) {
    test(`renders recovery controls and retries after ${endpoint} fails`, async ({ page }) => {
      // Pages normally embed config. Remove that snapshot to exercise the HTTP fallback.
      if (endpoint === 'dynamic/apiClientConfig*') {
        await page.route('**/default/rdmp/admin/users', async (route) => {
          const response = await route.fetch();
          const body = (await response.text()).replace(/<meta name="rb-client-config"[^>]*>/, '');
          await route.fulfill({ response, body });
        });
      }
      let attempts = 0;
      await page.route(`**/${endpoint}`, async (route) => {
        attempts += 1;
        if (attempts === 1) {
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        } else {
          await route.continue();
        }
      });

      await page.goto('/default/rdmp/admin/users', { waitUntil: 'domcontentloaded' });
      const error = page.locator('manage-users [role="alert"]');
      await expect(error).toContainText('Unable to load data');
      await expect(page.locator('#manage-users-search')).toHaveCount(0);
      await error.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.locator('#manage-users-search')).toBeVisible();
      await expect(error).toHaveCount(0);
      expect(attempts).toBe(2);
    });
  }
});
