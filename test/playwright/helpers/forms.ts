import { expect, type Locator, type Page } from '@playwright/test';

export function field(page: Page | Locator, label: string): Locator {
  const labelled = page.getByLabel(label, { exact: true }).first();
  // Older form renderers expose the label text without a matching `for`/id pair.
  // Keep the semantic query first, then resolve the control in that field's group.
  return page
    .locator('label')
    .filter({ hasText: label })
    .first()
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " rb-form-field-layout ")][1]')
    .locator('input, textarea, select')
    .first()
    .or(labelled)
    .first();
}

export async function fillField(page: Page, label: string, value: string): Promise<void> {
  const control = field(page, label);
  await expect(control, `Missing form field '${label}'.`).toBeVisible();
  await control.fill(value);
}

export async function saveForm(page: Page): Promise<void> {
  const save = page.getByRole('button', { name: /save/i }).first();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('redbox-form-save-status [role="status"]')).toContainText(/saved|success/i);
}
