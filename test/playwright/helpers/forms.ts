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

/** Legacy component values may intentionally disagree with the inferred schema.
 * Keep those warnings explicit while requiring a completed, persisted save. */
export async function saveFormWithSchemaWarnings(
  page: Page,
  issues: { code: string; pointer: string; expected?: { type: string } }[],
): Promise<void> {
  const response = page.waitForResponse(response =>
    response.request().method() === 'PUT' && /\/recordmeta\/[^/]+$/.test(new URL(response.url()).pathname)
  );
  const save = page.getByRole('button', { name: /save/i }).first();
  await expect(save).toBeEnabled();
  await save.click();
  const saved = await response;
  expect(saved.ok()).toBeTruthy();
  const { meta } = await saved.json();
  expect(meta.success).toBe(true);
  expect(meta.outcome).toBe('saved-with-warnings');
  expect(meta.schemaOutcome.enforcement).toBe('shadow');
  expect(meta.problems).toEqual([{
    kind: 'validation', source: 'schema', phase: 'schema',
    issues: issues.map(issue => expect.objectContaining(issue)),
  }]);
  expect(meta.completion.attachments).toEqual({ status: 'not-required', items: [] });
  await expect(page.locator('redbox-form-save-status [role="alert"]'))
    .toContainText('Saved, but the record schema check reported a problem.');
}
