import { expect, type Page } from '@playwright/test';
import type { SmokeRoute } from './routes';

export const adminStorageStatePath = '.tmp/playwright/storage/admin.json';

type AssetCheckResult = {
  url: string;
  ok: boolean;
  status: number;
};

const assetFetchConcurrency = 4;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function waitForReadyState(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
  } catch {
    // Some pages keep background requests alive; selectors are the source of truth.
  }
}

export async function collectLocalAssetUrls(page: Page): Promise<string[]> {
  const assetUrls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>('link[rel="stylesheet"][href], script[src]'))
      .map((element) => {
        if (element instanceof HTMLLinkElement) {
          return element.href;
        }
        return element.src;
      })
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
  });

  const pageUrl = new URL(page.url());
  return assetUrls.filter((value) => {
    const parsed = new URL(value, pageUrl);
    return parsed.origin === pageUrl.origin;
  });
}

export async function verifyAssets(page: Page, route: SmokeRoute, assetUrls: string[], baseAssetIncludes: string[]): Promise<void> {
  const requiredIncludes = [...baseAssetIncludes, ...route.requiredAssetIncludes];
  for (const requiredInclude of requiredIncludes) {
    expect(assetUrls.some((assetUrl) => assetUrl.includes(requiredInclude))).toBeTruthy();
  }

  const results = await fetchAssets(page, assetUrls);
  for (const result of results) {
    expect.soft(result.ok, `${route.path} asset failed: ${result.url} (${result.status})`).toBeTruthy();
  }
}

async function fetchAssets(page: Page, assetUrls: string[]): Promise<AssetCheckResult[]> {
  const results: AssetCheckResult[] = [];
  for (let index = 0; index < assetUrls.length; index += assetFetchConcurrency) {
    const batch = assetUrls.slice(index, index + assetFetchConcurrency);
    const batchResults = await Promise.all(batch.map(async (url): Promise<AssetCheckResult> => {
      try {
        const response = await page.request.get(url);
        return {
          url,
          ok: response.ok(),
          status: response.status()
        };
      } catch {
        return {
          url,
          ok: false,
          status: 0
        };
      }
    }));
    results.push(...batchResults);
  }
  return results;
}

export async function assertSmokeRoute(page: Page, route: SmokeRoute, baseAssetIncludes: string[]): Promise<void> {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await waitForReadyState(page);
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(route.path)}(?:\\?.*)?$`));
  const selectorState = route.selectorState ?? 'visible';

  for (const selector of route.setupSelectors ?? []) {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'attached' });
    await locator.click();
  }

  for (const selector of route.requiredSelectors) {
    const locator = page.locator(selector).first();
    if (selectorState === 'attached') {
      await expect(locator, `${route.path} missing selector ${selector}`).toBeAttached();
    } else {
      await expect(locator, `${route.path} missing selector ${selector}`).toBeVisible();
    }
  }

  if (route.rootSelector) {
    const locator = page.locator(route.rootSelector).first();
    await expect(locator, `${route.path} root did not render`).toBeAttached();
  }

  for (const selector of route.fallbackSelectors) {
    await expect(page.locator(selector), `${route.path} fallback selector still present: ${selector}`).toHaveCount(0, { timeout: 20_000 });
  }

  const assetUrls = await collectLocalAssetUrls(page);
  await verifyAssets(page, route, assetUrls, baseAssetIncludes);

  expect(pageErrors, `${route.path} emitted browser page errors`).toEqual([]);
}
