import { expect, test } from '../fixtures/test';
import { ResponseGate } from '../helpers/response-gate';
import { applicationManifest } from '../coverage/applications';
import { routeForEntry } from './_routes';

// The generated tests cover the complete manifest: A01 A02 A03 A04 A05 A06
// A07 A08 A09 A10 A11 A12 A13 A14 A15 A16 A17 A18 A19.

const anonymousEntries = applicationManifest.filter(entry => entry.persona === 'anonymous');
const adminEntries = applicationManifest.filter(entry => entry.persona === 'admin');

for (const entry of anonymousEntries) {
  test.describe(`${entry.id} ${entry.project}`, () => {
    test(`${entry.id} useful cold start`, async ({ page }) => {
      await assertUsefulStartup(page, entry.route, entry.usefulSelectors, entry.id);
    });
    test(`${entry.id} delayed configuration startup`, async ({ page }) => {
      await assertDelayedStartup(page, entry.route, entry.delayedDependency, entry.usefulSelectors, entry.id);
    });
  });
}

for (const entry of adminEntries) {
  test.describe(`${entry.id} ${entry.project}`, () => {
    test(`${entry.id} useful cold start`, async ({ adminPage, adminCsrfToken, resources }) => {
      const route = await routeForEntry(entry.route, entry.id, adminPage, adminCsrfToken, resources);
      await assertUsefulStartup(adminPage, route, entry.usefulSelectors, entry.id);
    });
    test(`${entry.id} delayed configuration startup`, async ({ adminPage, adminCsrfToken, resources }) => {
      const route = await routeForEntry(entry.route, entry.id, adminPage, adminCsrfToken, resources);
      await assertDelayedStartup(adminPage, route, entry.delayedDependency, entry.usefulSelectors, entry.id);
    });
  });
}

async function assertUsefulStartup(
  page: import('@playwright/test').Page,
  route: string,
  selectors: string[],
  id: string
): Promise<void> {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await revealCollapsedLogin(page, id);
  for (const selector of selectors)
    await expect(page.locator(`${selector}:visible`).first(), `${id} missing useful content ${selector}`).toBeVisible();
}

async function assertDelayedStartup(
  page: import('@playwright/test').Page,
  route: string,
  dependency: string,
  selectors: string[],
  id: string
): Promise<void> {
  const gate = new ResponseGate(page, { url: dependency, method: 'GET' });
  await gate.install();
  try {
    const navigation = page.goto(route, { waitUntil: 'domcontentloaded' });
    await gate.waitForCapture();
    await revealCollapsedLogin(page, id);
    await expect(page.locator(selectors[selectors.length - 1]).first(), `${id} final content must wait for configuration`).not.toBeVisible();
    await gate.release();
    await navigation;
    for (const selector of selectors) await expect(page.locator(`${selector}:visible`).first()).toBeVisible();
  } finally {
    await gate.dispose();
  }
}

async function revealCollapsedLogin(page: import('@playwright/test').Page, id: string): Promise<void> {
  if (id !== 'A01') return;
  const reveal = page.locator('#adminLoginShow a[data-bs-target="#adminLogin"]');
  if (await reveal.count()) await reveal.click();
}
