import type { Page, Route } from '@playwright/test';

/** Exercise the HTTP bootstrap path while cold-start tests retain page snapshots. */
export async function useHttpConfigurationFallback(page: Page): Promise<() => Promise<void>> {
  const handler = async (route: Route) => {
    if (route.request().resourceType() !== 'document') {
      await route.fallback();
      return;
    }
    const response = await route.fetch({ maxRedirects: 0 });
    if (!response.headers()['content-type']?.includes('text/html')) {
      await route.fulfill({ response });
      return;
    }
    const body = (await response.text()).replace(/<meta\b[^>]*\bname=["']rb-client-config["'][^>]*>/gi, '');
    await route.fulfill({ response, body });
  };
  await page.route('**/*', handler);
  return async () => {
    if (!page.isClosed()) await page.unroute('**/*', handler);
  };
}
