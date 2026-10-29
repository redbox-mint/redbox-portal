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

// Stage 4 exercises real responses delayed at the transport boundary, never mocked content.
test.describe('stage 4 email editor regressions', () => {
  test.use({ storageState: adminStorageStatePath });
  let headers: Record<string, string>;
  const content = (body: string) => ({ subject: 'Stage 4 regression', body, format: 'html' });
  const url = (id: string) => `${api}/templates/${id}`;
  async function state(page: import('@playwright/test').Page, id = 'test') {
    const response = await page.request.get(url(id));
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
  async function clean(page: import('@playwright/test').Page, id: string) {
    let current = await state(page, id);
    if (current.draft) expect((await page.request.delete(`${url(id)}/draft`, { headers, data: { expectedDraftRevision: current.draft.draftRevision } })).ok()).toBeTruthy();
    current = await state(page, id);
    if (current.live) expect((await page.request.post(`${url(id)}/reset`, { headers, data: { expectedLiveToken: current.live.token } })).ok()).toBeTruthy();
  }
  async function publishFixture(page: import('@playwright/test').Page) {
    const saved = await page.request.put(`${template}/draft`, { headers, data: { content: content('<p>Published fixture</p>'), expectedDraftRevision: null } });
    expect(saved.ok()).toBeTruthy();
    const draft = (await saved.json()).draft;
    expect((await page.request.post(`${template}/publish`, { headers, data: { expectedDraftRevision: draft.draftRevision, expectedLiveToken: null } })).ok()).toBeTruthy();
  }
  async function open(page: import('@playwright/test').Page, id = 'test') {
    await page.goto(`/default/rdmp/admin/email-templates#/templates/${id}`);
    await expect(page.locator('#et-body')).toBeVisible();
  }
  async function hold(page: import('@playwright/test').Page, pattern: string, method = 'GET') {
    let started!: () => void;
    let release!: () => void;
    const startedPromise = new Promise<void>(resolve => started = resolve);
    const gate = new Promise<void>(resolve => release = resolve);
    await page.route(pattern, async route => {
      if (route.request().method() !== method) return route.continue();
      const response = await route.fetch();
      started();
      await gate;
      await route.fulfill({ response });
    });
    return { started: startedPromise, release };
  }
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90000);
    const csrf = await page.request.get('/csrfToken?branding=default&portal=rdmp');
    headers = { 'X-CSRF-Token': (await csrf.json())._csrf, Accept: 'application/json', 'X-Source': 'jsclient' };
    for (const id of ['test', 'publicationReview', 'integrationRecovery']) await clean(page, id);
  });
  test.afterEach(async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await page.goto('/default/rdmp/admin');
    for (const id of ['test', 'publicationReview', 'integrationRecovery']) await clean(page, id);
  });

  test('ET-01 a late template load cannot populate or save another template', async ({ page }) => {
    const second = await state(page, 'publicationReview');
    const gate = await hold(page, `**${url('integrationRecovery')}`);
    try {
      await page.goto('/default/rdmp/admin/email-templates#/templates/integrationRecovery');
      await gate.started;
      await page.evaluate(() => location.hash = '#/templates/publicationReview');
      await expect(page.locator('#et-subject')).toHaveValue(second.suppliedDefault.subject);
      gate.release();
      await expect(page.locator('#et-subject')).toHaveValue(second.suppliedDefault.subject);
      await page.locator('#et-subject').fill('B working copy');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect.poll(async () => (await state(page, 'publicationReview')).draft?.subject).toBe('B working copy');
      expect((await state(page, 'publicationReview')).draft.body.replace(/\r\n/g, '\n')).toBe(second.suppliedDefault.body.replace(/\r\n/g, '\n'));
    } finally { gate.release(); }
  });

  test('ET-02 browser Back during save drains newer typing before Forward', async ({ page }) => {
    await page.goto('/default/rdmp/admin/email-templates');
    await page.locator('tr[data-template-id="test"]').getByRole('button', { name: /Customise/ }).click();
    const gate = await hold(page, `**${template}/draft`, 'PUT');
    try {
      await page.locator('#et-body').fill('First request');
      await gate.started;
      await page.locator('#et-body').fill('Newer typing during save');
      await page.goBack();
      // The editor identity remains mounted while the outgoing save settles.
      await expect(page.locator('#et-body')).toHaveValue('Newer typing during save');
      gate.release();
      await expect(page.locator('email-templates-catalogue')).toBeVisible();
      await page.goForward();
      await expect(page.locator('#et-body')).toHaveValue('Newer typing during save');
      expect((await state(page)).draft.body).toBe('Newer typing during save');
    } finally { gate.release(); }
  });

  test('ET-03 direct template hash navigation preserves pending autosave', async ({ page }) => {
    await open(page);
    await page.locator('#et-body').fill('Pending hash navigation edit');
    await page.evaluate(() => location.hash = '#/templates/publicationReview');
    await expect(page.locator('.et-template-id')).toHaveText('publicationReview');
    expect((await state(page)).draft.body).toBe('Pending hash navigation edit');
    await page.goBack();
    await expect(page.locator('#et-body')).toHaveValue('Pending hash navigation edit');
  });

  test('ET-04 reset preserves unsaved work after a failed preparatory save', async ({ page }) => {
    await publishFixture(page);
    const before = await state(page);
    await open(page);
    await page.locator('#et-subject').fill('X'.repeat(999));
    await page.locator('#et-body').fill('Must retain failed save');
    await expect(page.locator('.et-footer-status')).toContainText('Draft not saved');
    await page.getByRole('button', { name: /Reset to default/ }).click();
    await page.locator('dialog[open] .btn-danger').click();
    await expect(page.locator('#et-body')).toHaveValue('Must retain failed save');
    await expect(page.locator('dialog[open] .btn-danger')).toBeEnabled();
    expect((await state(page)).live.token).toEqual(before.live.token);
  });

  test('ET-05 a pending publish cannot be cancelled or expose editable inputs', async ({ page }) => {
    await open(page);
    await page.locator('#et-body').fill('<p>Publishing original</p>');
    await expect(page.locator('.et-publish')).toBeEnabled();
    await page.locator('.et-publish').click();
    const gate = await hold(page, `**${template}/publish`, 'POST');
    try {
      await page.locator('dialog[open] .btn-primary').click();
      await gate.started;
      await expect(page.locator('dialog[open]').getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toBeVisible();
      await expect(page.locator('#et-body')).toHaveJSProperty('readOnly', true);
      gate.release();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect(page.locator('#et-body')).toHaveValue('<p>Publishing original</p>');
    } finally { gate.release(); }
  });

  test('ET-06 a conflict is retained for its template and does not poison the next editor', async ({ page }) => {
    await open(page);
    const current = await state(page);
    expect((await page.request.put(`${template}/draft`, { headers, data: { expectedDraftRevision: current.draft?.draftRevision ?? null, content: content('<p>Other admin</p>') } })).ok()).toBeTruthy();
    await page.locator('#et-body').fill('Held conflicting work');
    await expect(page.locator('#et-conflict-body')).toHaveValue('Held conflicting work');
    await page.evaluate(() => location.hash = '#/templates/publicationReview');
    await expect(page.locator('#et-body')).toBeVisible();
    await page.locator('#et-body').fill('Independent B draft');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect.poll(async () => (await state(page, 'publicationReview')).draft?.body).toBe('Independent B draft');
    await page.evaluate(() => location.hash = '#/templates/test');
    await expect(page.locator('#et-conflict-body')).toHaveValue('Held conflicting work');
  });

  test('conflict Reload locks navigation and never saves held A content at the latest revision', async ({ page }) => {
    await open(page);
    const initial = await state(page);
    const remote = content('<p>Other admin latest draft A</p>');
    expect((await page.request.put(`${template}/draft`, { headers, data: {
      expectedDraftRevision: initial.draft?.draftRevision ?? null, content: remote,
    } })).ok()).toBeTruthy();
    await page.locator('#et-body').fill('Held conflicting content from A');
    await expect(page.locator('#et-conflict-body')).toHaveValue('Held conflicting content from A');
    await page.evaluate(() => location.hash = '#/templates/publicationReview');
    await expect(page.locator('.et-template-id')).toHaveText('publicationReview');
    await page.evaluate(() => location.hash = '#/templates/test');
    await expect(page.locator('#et-conflict-body')).toHaveValue('Held conflicting content from A');
    const revision = (await state(page)).draft.draftRevision;
    const saves: string[] = [];
    page.on('request', request => {
      if (request.method() === 'PUT' && request.url().endsWith(`${template}/draft`)) saves.push(request.method());
    });
    const gate = await hold(page, `**${template}`);
    try {
      await page.locator('dialog[open]').getByRole('button', { name: /Reload/ }).click();
      await gate.started;
      await page.evaluate(() => location.hash = '#/templates/publicationReview');
      await expect(page).toHaveURL(/#\/templates\/test$/);
      await expect(page.locator('.et-template-id')).toHaveText('test');
      expect((await state(page)).draft.body).toBe(remote.body);
      gate.release();
      await expect(page.locator('#et-body')).toHaveValue(remote.body);
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await page.evaluate(() => location.hash = '#/templates/publicationReview');
      await expect(page.locator('.et-template-id')).toHaveText('publicationReview');
      const after = await state(page);
      expect(after.draft.body).toBe(remote.body);
      expect(after.draft.draftRevision).toBe(revision);
      expect(saves).toEqual([]);
    } finally { gate.release(); }
  });

  test('ET-07 and ET-14 style preview uses its own CSP and relaxed JSON is sent strictly', async ({ page }) => {
    await open(page);
    await page.locator('#et-subject').fill('Record {{record.metadata.title}}');
    await page.locator('#et-body').fill('<p style="color:rgb(255,0,0);font-size:32px">Styled email</p>');
    const request = page.waitForRequest(request => request.url().endsWith('/preview') && request.method() === 'POST' && request.postDataJSON().context.includes('Relaxed title'));
    await page.locator('#et-context').fill("{record: {metadata: {title: 'Relaxed title',}}, }");
    expect(JSON.parse((await request).postDataJSON().context).record.metadata.title).toBe('Relaxed title');
    await expect(page.locator('.et-preview-subject-text')).toHaveText('Record Relaxed title');
    const iframe = page.locator('iframe.et-preview-frame');
    await expect(iframe).toHaveAttribute('sandbox', '');
    await expect(iframe).toHaveAttribute('src', /\/preview-frame\/[\w-]{43}$/);
    expect(await iframe.getAttribute('srcdoc')).toBeNull();
    const paragraph = page.frameLocator('iframe.et-preview-frame').locator('p');
    await expect(paragraph).toHaveCSS('color', 'rgb(255, 0, 0)');
    await expect(paragraph).toHaveCSS('font-size', '32px');
    await page.locator('#et-context').blur();
    expect(JSON.parse(await page.locator('#et-context').inputValue()).record.metadata.title).toBe('Relaxed title');
  });

  test('schema warnings remain advisory through publication', async ({ page }) => {
    await open(page);
    await page.locator('#et-body').fill('{{record.metadata}}');
    await expect(page.locator('#et-body-diagnostics .et-diagnostic-warning')).toContainText('record.metadata is a group of fields');
    await expect(page.locator('#et-body-diagnostics')).toContainText('Warning:');
    await expect(page.locator('.et-publish')).toBeEnabled();
    await page.locator('.et-publish').click();
    await page.locator('dialog[open] .btn-primary').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect((await state(page)).live.body).toBe('{{record.metadata}}');
  });

  test('a real endpoint array field inserts an #each scaffold and passes schema lint', async ({ page }) => {
    // No response rewriting: discover arrays from the actual compiler/endpoint.
    const targetsResponse = await page.request.get(`${api}/schema-targets`, { headers });
    expect(targetsResponse.ok()).toBeTruthy();
    const { recordTypes } = await targetsResponse.json();
    const probes: Array<{ recordType: string; stage: string; precision: string }> = [];
    let selected: { recordType: string; stage: string; path: string; name: string } | undefined;
    function findArray(node: any, path: string[] = []): { path: string; name: string } | undefined {
      if ((node?.type === 'array' || node?.type?.includes?.('array')) && path.length) return { path: path.join('.'), name: path[path.length - 1] };
      for (const [key, value] of Object.entries(node?.properties ?? {})) {
        const found = findArray(value, [...path, key]);
        if (found) return found;
      }
      return undefined;
    }
    for (const target of recordTypes) {
      for (const stage of target.stages) {
        const response = await page.request.get(`${api}/context-schema`, { headers, params: { recordType: target.id, stage: stage.id } });
        expect(response.ok()).toBeTruthy();
        const result = await response.json();
        probes.push({ recordType: target.id, stage: stage.id, precision: result.precision });
        const field = findArray(result.schema.properties?.record?.properties?.metadata, ['record', 'metadata']);
        if (field && !selected) selected = { recordType: target.id, stage: stage.id, ...field };
      }
    }
    await test.info().attach('real-schema-array-probe', { body: JSON.stringify(probes, null, 2), contentType: 'application/json' });
    test.skip(!selected, 'No real metadata array is exposed by any record type/stage in this test environment; list UI coverage uses the explicit injected fixture.');
    const field = selected!;
    await open(page);
    await page.locator('#et-schema-type').selectOption(field.recordType);
    await page.locator('#et-schema-stage').selectOption(field.stage);
    await page.locator('#et-body').fill('');
    await page.locator('.et-help summary').click();
    await page.locator('#et-fields-search').fill(field.path);
    const row = page.locator('.et-field', { has: page.locator('.et-field-key', { hasText: field.name }) }).first();
    await row.locator('.et-field-name').click();
    const body = await page.locator('#et-body').inputValue();
    expect(body).toContain(`{{#each ${field.path}}}`);
    const response = await page.request.post(`${template}/validate`, { headers, data: {
      content: content(body), recordType: field.recordType, stage: field.stage,
    } });
    expect(response.ok()).toBeTruthy();
    const validation = await response.json();
    expect(validation.diagnostics.filter((d: any) => ['UNKNOWN_FIELD', 'EACH_NOT_ARRAY'].includes(d.code))).toEqual([]);
  });

  // Stage 4 part 2: schema-assisted editing UI.
  /** Adds an array field to the real context schema so list scaffolds can be exercised. */
  async function withListField(page: import('@playwright/test').Page) {
    await page.route('**/app/email-templates/context-schema?**', async route => {
      const response = await route.fetch();
      const json = await response.json();
      json.precision = 'record-schema';
      json.schema.properties.record.properties.metadata.properties.contributors = {
        type: 'array',
        title: 'Contributors',
        description: 'People credited on the plan',
        items: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', title: 'Name' }, email: { type: 'string', title: 'Email' } },
        },
      };
      await route.fulfill({ response, json });
    });
  }
  async function shot(page: import('@playwright/test').Page, name: string, focus?: import('@playwright/test').Locator) {
    const dir = process.env.EMAIL_TEMPLATE_SCREENSHOT_DIR;
    if (!dir) return;
    await fs.mkdir(dir, { recursive: true });
    if (focus) await focus.evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
  }

  test('autocomplete inserts a schema field at the caret in the body and subject', async ({ page }) => {
    await open(page);
    await expect(page.locator('#et-schema-status')).toContainText('rdmp');
    const body = page.locator('#et-body');
    await body.fill('<p>Stage: </p>');
    await body.press('Control+End');
    for (let i = 0; i < 4; i++) await body.press('ArrowLeft');
    await body.pressSequentially('{{record.workflow.st');
    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible();
    await expect(listbox.locator('[role="option"]')).toHaveText([/^stage/, /^stageLabel/]);
    await expect(body).toHaveAttribute('aria-activedescendant', /option-0$/);
    await body.press('ArrowDown');
    await expect(body).toHaveAttribute('aria-activedescendant', /option-1$/);
    await body.press('Enter');
    await expect(listbox).toHaveCount(0);
    await expect(body).toHaveValue('<p>Stage: {{record.workflow.stageLabel}}</p>');
    expect(await body.evaluate((area: HTMLTextAreaElement) => area.selectionStart)).toBe(
      '<p>Stage: {{record.workflow.stageLabel}}'.length
    );

    const subject = page.locator('#et-subject');
    await subject.fill('Ready ');
    await subject.press('End');
    await subject.pressSequentially('{{oi');
    await expect(subject).toHaveAttribute('aria-expanded', 'true');
    await subject.press('Tab');
    await expect(subject).toHaveValue('Ready {{oid}}');
    await expect(body).toHaveValue('<p>Stage: {{record.workflow.stageLabel}}</p>');
    await expect.poll(async () => (await state(page)).draft?.subject, { timeout: 15000 }).toBe('Ready {{oid}}');
    expect((await state(page)).draft.body).toBe('<p>Stage: {{record.workflow.stageLabel}}</p>');
  });

  test('a schema warning offers a one-occurrence "did you mean" and does not block publish', async ({ page }) => {
    await open(page);
    await expect(page.locator('#et-schema-status')).toContainText('rdmp');
    const body = page.locator('#et-body');
    await body.fill('<p>{{record.workflow.stag}} / {{record.workflow.stag}}</p>');
    const warnings = page.locator('#et-body-diagnostics .et-diagnostic-warning');
    await expect(warnings).toHaveCount(2);
    await expect(warnings.first()).toContainText("record.workflow.stag isn't in the schema");
    await expect(page.locator('.et-code-mark-warning')).toHaveCount(1);
    await expect(page.locator('.et-advisory')).toContainText("don't block publishing");
    await expect(page.locator('.et-publish')).toBeEnabled();
    await expect(page.locator('#et-publish-reason')).toHaveCount(0);
    const fix = warnings.nth(1).locator('.et-diagnostic-fix');
    await expect(fix).toContainText('Did you mean stage?');
    await fix.click();
    await expect(body).toHaveValue('<p>{{record.workflow.stag}} / {{record.workflow.stage}}</p>');
    await expect(warnings).toHaveCount(1);
    await expect(page.locator('.et-publish')).toBeEnabled();
    await page.locator('.et-publish').click();
    await page.locator('dialog[open] .btn-primary').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect((await state(page)).live.body).toBe('<p>{{record.workflow.stag}} / {{record.workflow.stage}}</p>');
  });

  test('the field tree inserts an #each scaffold for a list at the caret', async ({ page }) => {
    await withListField(page);
    await open(page);
    await expect(page.locator('#et-schema-status')).toContainText('Using the record schema for rdmp');
    const body = page.locator('#et-body');
    await body.fill('<ul>\n</ul>');
    await body.press('Control+Home');
    await body.press('End');
    await body.press('Enter');
    await page.locator('.et-help summary').click();
    const row = page.locator('.et-field', { has: page.locator('.et-field-key', { hasText: /^contributors$/ }) });
    await expect(row.locator('.et-field-type')).toHaveText('array');
    await expect(row.locator('.et-field-name')).toHaveAttribute('title', 'Contributors — People credited on the plan');
    await row.locator('.et-field-name').click();
    await expect(body).toHaveValue('<ul>\n{{#each record.metadata.contributors}}\n  {{this.name}}\n{{/each}}\n</ul>');
    await row.locator('.et-field-toggle').click();
    await expect(page.locator('.et-field-key', { hasText: /^email$/ })).toBeVisible();
    await page.locator('#et-fields-search').fill('email');
    await expect(page.locator('.et-field-key').first()).toContainText('email');
    // Search paths carry zero-width break hints after each dot.
    const paths = (await page.locator('.et-field-key').allTextContents()).map(text => text.replace(/\u200b/g, '').trim());
    const primary = paths.indexOf('record.metadata.contributors[].email');
    expect(primary).toBeGreaterThanOrEqual(0);
    // The legacy `imports` alias mirrors the context, so its copy follows the primary path.
    const alias = paths.findIndex(text => text.startsWith('imports.') && text.endsWith('contributors[].email'));
    if (alias >= 0) expect(alias).toBeGreaterThan(primary);
  });

  test('schema assistance screenshots', async ({ page }) => {
    test.skip(!process.env.EMAIL_TEMPLATE_SCREENSHOT_DIR, 'Set EMAIL_TEMPLATE_SCREENSHOT_DIR to capture screenshots.');
    await page.setViewportSize({ width: 1440, height: 960 });
    await withListField(page);
    await open(page);
    const selector = page.locator('email-templates-schema-target');
    await expect(page.locator('#et-schema-status')).toContainText('Using the record schema for rdmp');
    await shot(page, '01-selector-record-schema', selector);

    await page.locator('.et-help summary').click();
    await shot(page, '02-field-tree', page.locator('.et-fields'));
    await page.locator('#et-fields-search').fill('name');
    await shot(page, '03-field-tree-search', page.locator('.et-fields'));
    await page.locator('#et-fields-search').fill('');
    await page.locator('.et-help summary').click();

    const body = page.locator('#et-body');
    await body.fill(
      '<p>Your {{record.metaMetadata.typ}} plan</p>\n<p>is at {{record.workflow.stag}}.</p>\n<p>{{record.workflow}}</p>\n'
    );
    await expect(page.locator('#et-body-diagnostics .et-diagnostic-warning')).toHaveCount(3);
    await shot(page, '04-warnings-did-you-mean', page.locator('#et-body-diagnostics'));

    await body.press('Control+End');
    await body.pressSequentially('<p>{{record.metadata.co');
    await expect(page.locator('[role="listbox"]')).toBeVisible();
    await shot(page, '05-autocomplete-body', body);
    await body.press('Enter');
    await body.pressSequentially('</p>');
    await expect(body).toHaveValue(/\{\{record\.metadata\.contributors\}\}<\/p>$/);

    const subject = page.locator('#et-subject');
    await subject.fill('Plan ');
    await subject.press('End');
    await subject.pressSequentially('{{record.wor');
    await body.evaluate(() => window.scrollTo(0, 0));
    await shot(page, '06-autocomplete-subject');
    await subject.press('Escape');
    await subject.fill('Plan {{oid}} is ready');

    const context = page.locator('#et-context');
    await context.fill("{record: {metadata: {contributors: 'Ann'}, workflow: {stage: 'draft', stageLabel: 'Draft', phase: 2}}, }");
    await expect(page.locator('.et-context-issues')).toBeVisible();
    await shot(page, '07-context-json-schema-differences', page.locator('.et-context'));
    await context.blur();
    await expect(page.locator('.et-context-note')).toBeVisible();
    await shot(page, '08-context-json-converted', page.locator('.et-context'));
    await page.locator('.et-context-action', { hasText: 'Generate sample data' }).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await shot(page, '09-context-json-sample-confirm');
    await page.locator('dialog[open] .btn-primary').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(context).toHaveValue(/"contributors": \[/);
    await expect(page.locator('.et-context-issues')).toHaveCount(0);
    await shot(page, '10-context-json-sample', page.locator('.et-context'));

    await page.unroute('**/app/email-templates/context-schema?**');
    page.on('dialog', dialog => dialog.accept());
    await page.reload();
    await expect(page.locator('#et-schema-status')).toContainText('Field list from the rdmp form config');
    await page.locator('.et-help summary').click();
    await shot(page, '11-form-config-precision', page.locator('email-templates-schema-target'));
    await shot(page, '12-field-tree-form-config', page.locator('.et-fields'));
  });
});
