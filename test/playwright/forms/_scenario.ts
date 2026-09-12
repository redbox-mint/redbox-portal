import { expect, type Page } from '@playwright/test';

export async function openScenario(page: Page, id: string): Promise<void> {
  await page.goto(`/default/rdmp/record/e2e-${id}/edit`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('redbox-form').first(), `${id} form root did not render`).toBeVisible();
  await expect(page.locator('redbox-form .rb-form-shell').first()).toBeVisible();
}
