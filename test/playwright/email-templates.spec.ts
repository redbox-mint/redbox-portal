import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { adminStorageStatePath } from './helpers';

const api = '/default/rdmp/app/email-templates';
const templateId = 'test';
const template = `${api}/templates/${templateId}`;

// The normal integration configuration supplies this template and the admin
// account. All lifecycle requests go to the real application and MongoDB.
test.describe('email template administration', () => {
  test.use({ storageState: adminStorageStatePath });

  test('previews a record, validates, publishes, restores and preserves a conflicting edit', async ({ page }) => {
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const tokenResponse = await page.request.get('/csrfToken?branding=default&portal=rdmp');
    expect(tokenResponse.ok()).toBeTruthy();
    const { _csrf } = await tokenResponse.json();
    const headers = { 'X-CSRF-Token': _csrf, 'X-Source': 'jsclient', Accept: 'application/json' };
    const screenshot = async (name: string) => {
      if (process.env.EMAIL_TEMPLATE_SCREENSHOT_DIR) {
        await fs.mkdir(process.env.EMAIL_TEMPLATE_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(process.env.EMAIL_TEMPLATE_SCREENSHOT_DIR, `${name}.png`),
          fullPage: true,
        });
      }
    };
    const state = async () => {
      const response = await page.request.get(template);
      expect(response.ok()).toBeTruthy();
      return response.json();
    };
    const cleanTemplate = async () => {
      let current = await state();
      if (current.draft) {
        expect(
          (
            await page.request.delete(`${template}/draft`, {
              headers,
              data: { expectedDraftRevision: current.draft.draftRevision },
            })
          ).ok()
        ).toBeTruthy();
      }
      current = await state();
      if (current.live) {
        expect(
          (
            await page.request.post(`${template}/reset`, { headers, data: { expectedLiveToken: current.live.token } })
          ).ok()
        ).toBeTruthy();
      }
    };
    await cleanTemplate();
    const initial = await state();
    const expectedVersion = initial.latestVersion + 1;
    const recordTitle = `Soil carbon survey ${Date.now()}`;
    const recordResponse = await page.request.post('/default/rdmp/recordmeta/rdmp', {
      headers,
      data: { title: recordTitle, description: 'Preview data for the email template browser test.' },
    });
    expect(recordResponse.ok(), await recordResponse.text()).toBeTruthy();
    const created = await recordResponse.json();
    const oid = created.oid ?? created.data?.oid;
    expect(typeof oid).toBe('string');
    try {
      await page.goto('/default/rdmp/admin/email-templates');
      const row = page.locator(`tr[data-template-id="${templateId}"]`);
      await expect(row).toBeVisible();
      await screenshot('catalogue');
      await row.getByRole('button', { name: /Customise/ }).click();
      await expect(page.locator('#et-subject')).toBeVisible();
      await page.locator('#et-subject').fill('Ready for review: {{record.metadata.title}}');
      const body = '<h2>Research update</h2>\n<p>{{record.metadata.title}}</p>';
      await page.locator('#et-body').fill(body);
      await page.locator('#et-record-search').fill(oid);
      await page.locator('.et-picker-option').filter({ hasText: oid }).click();
      await expect(page.locator('#et-context')).toHaveValue(new RegExp(recordTitle));
      const editedTitle = 'Soil carbon survey — preview edit';
      const context = JSON.parse(await page.locator('#et-context').inputValue());
      context.record.metadata.title = editedTitle;
      await page.locator('#et-context').fill(JSON.stringify(context, null, 2));
      await expect(page.locator('.et-context-edited')).toBeVisible();
      // Long record JSON must scroll inside the editor, leaving preview in reach.
      expect(await page.locator('#et-context').evaluate(area => area.getBoundingClientRect().height)).toBeLessThan(300);
      expect(
        await page.locator('#et-context').evaluate(area => area.closest('.et-code')!.getBoundingClientRect().height)
      ).toBeLessThan(300);
      await expect(page.locator('.et-preview-subject-text')).toHaveText(`Ready for review: ${editedTitle}`);
      await expect(page.frameLocator('iframe.et-preview-frame').locator('body')).toContainText(editedTitle);
      await expect(page.locator('iframe.et-preview-frame')).toHaveAttribute('sandbox', '');
      await screenshot('editor-preview');
      await page.locator('#et-body').fill(`${body}\n{{unknownEmailRoot.value}}`);
      await expect(page.locator('#et-body-diagnostics')).toContainText('unknownEmailRoot');
      await expect(page.locator('.et-publish')).toBeDisabled();
      await expect(page.locator('.et-code-ln-flag')).toHaveText('3');
      await screenshot('editor-diagnostic');
      await page.locator('#et-body').fill(body);
      await expect(page.locator('.et-publish')).toBeEnabled();
      await page.locator('.et-publish').click();
      const dialog = page.locator('dialog[open]');
      await expect(dialog).toContainText(`v${expectedVersion}`);
      await expect(dialog).toContainText('Ready for review:');
      await screenshot('publish-confirmation');
      await dialog.getByRole('button', { name: new RegExp(`Publish v${expectedVersion}`) }).click();
      await expect(page.locator('.et-title-row')).toContainText(`Live v${expectedVersion}`);
      // Optional screenshot exercise against a disposable generated default.
      // The normal CI flow never changes a supplied template file.
      if (process.env.EMAIL_TEMPLATE_DEFAULT_PATH) {
        const defaultPath = process.env.EMAIL_TEMPLATE_DEFAULT_PATH;
        const original = await fs.readFile(defaultPath, 'utf8');
        try {
          await fs.writeFile(defaultPath, `${original}\n<!-- Supplied default updated for the browser scenario. -->`);
          await page.reload();
          await expect(page.locator('.et-default-updated')).toBeVisible();
          await screenshot('default-updated');
        } finally {
          await fs.writeFile(defaultPath, original);
        }
        await page.reload();
        await expect(page.locator('#et-subject')).toBeVisible();
        await expect(page.locator('.et-default-updated')).toHaveCount(0);
      }
      await page.getByRole('tab', { name: 'History', exact: true }).click();
      const published = page.locator(`tr[data-version="${expectedVersion}"]`);
      await expect(published).toContainText('Live');
      await screenshot('history');
      await published.getByRole('button', { name: /Restore to draft/ }).click();
      await expect(page.getByRole('tab', { name: 'Edit & preview' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#et-body')).toHaveValue(body);
      const restored = await state();
      expect(restored.draft.restoredFromVersion).toBe(expectedVersion);
      expect(restored.live.token.revision).toBe(expectedVersion);
      // A second administrator saves after this editor loaded its revision.
      expect(
        (
          await page.request.put(`${template}/draft`, {
            headers,
            data: {
              expectedDraftRevision: restored.draft.draftRevision,
              content: { subject: 'Another administrator saved this', body, format: 'html' },
            },
          })
        ).ok()
      ).toBeTruthy();
      const localBody = '<p>Keep this unsaved work</p>';
      await page.locator('#et-body').fill(localBody);
      await expect(page.locator('dialog[open] #et-conflict-body')).toHaveValue(localBody);
      await screenshot('conflict');
      await page
        .locator('dialog[open]')
        .getByRole('button', { name: /Reload/ })
        .click();
      await expect(page.locator('#et-subject')).toHaveValue('Another administrator saved this');
      await expect(page.locator('.alert-warning')).toContainText('kept');
      expect(pageErrors).toEqual([]);
    } finally {
      // Exit the editor before cleanup so a pending autosave cannot recreate it.
      await page.goto('/default/rdmp/admin');
      await cleanTemplate();
      const deleted = await page.request.delete(`/default/rdmp/record/delete/${encodeURIComponent(oid)}`, { headers });
      expect(deleted.ok(), await deleted.text()).toBeTruthy();
    }
  });
});
