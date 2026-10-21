import { expect, type Page } from '@playwright/test';
import { field, saveForm } from './forms';

/** Exercise the same timestamp scenario in each configured browser timezone. */
export async function verifyDatePickerRoundTrips(
  page: Page,
  oid: string,
  read: (oid: string) => Promise<{ body: Record<string, unknown> }>,
): Promise<void> {
  const date = field(page, 'Review date');
  const picker = page.locator('bs-datepicker-container');

  async function saveAndReload(expected: string): Promise<void> {
    await expect(date).toHaveValue(expected);
    await saveForm(page);
    await page.reload();
    await expect(date).toHaveValue(expected);
    expect((await read(oid)).body).toMatchObject({ date: `${expected}T00:00:00.000Z` });
  }

  await expect(date).toHaveValue('2026-10-03');
  for (const month of ['2026-10', '2027-04']) {
    if (month === '2027-04') {
      await date.fill(`${month}-03`);
      await field(page, 'Title').click();
      await saveAndReload(`${month}-03`);
    }
    // Cross both DST boundaries in both directions, using the actual calendar.
    for (const day of [4, 5, 3]) {
      await page.locator('redbox-date-input .date-input-addon').click();
      await expect(picker).toBeVisible();
      const cell = picker.locator('td span:not(.is-other-month)').filter({ hasText: new RegExp(`^${day}$`) });
      // ngx replaces a day cell when it becomes hovered. Let that render finish
      // before pressing the mouse, so replacement cannot discard the click.
      await cell.hover();
      await expect(cell).toHaveClass(/\bis-highlighted\b/);
      await cell.click();
      await expect(picker).toBeHidden();
      await saveAndReload(`${month}-0${day}`);
    }
  }

  await date.fill('2027-04-04');
  await field(page, 'Title').click();
  await saveAndReload('2027-04-04');
}
