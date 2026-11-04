import { expect, test, type Page } from '@playwright/test';
import { MongoClient } from 'mongodb';
import { createHash } from 'node:crypto';
import { relatedPdfProof } from './related-record-pdf';

const prefix = '/default/rdmp';
const password = 'RR20Test123!';
const refresh = '**/record/relatedMetadata/resolve';
const aData = { title: 'Activity A', startDate: '2026-02-01', endDate: '2026-03-01' };
const bData = { title: 'Activity B', startDate: '2025-02-01', endDate: '2025-03-01' };

// Native fixture insertion mirrors RR-19. Never connect to the development datastore.
// The mounted Compose runner resolves `mongodb` on its isolated test network.
test.describe('Related record resolution (RR-20)', () => {
  // Each login owns a new session; reusing admin's cookie would change bootstrap's session.
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ mode: 'default' });
  let mongo: MongoClient;
  let a: string, b: string, p: string;
  const ids: string[] = [];

  test.beforeAll(async ({ request }) => {
    const login = await request.post('/user/login_local', {
      headers: { 'X-Source': 'jsclient' },
      form: { username: 'admin', password: 'rbadmin' },
    });
    expect((await login.json()).user.username).toBe('admin');
    mongo = await new MongoClient(process.env.RR20_MONGO_URL ?? 'mongodb://mongodb:27017').connect();
    for (const [username, roles] of [
      ['related-admin', ['Admin', 'Librarians', 'Researcher']],
      ['related-librarian', ['Librarians']],
    ] as const) {
      const existing = await mongo.db('redbox-portal').collection('user').findOne({ username });
      const response = await request.post(`${prefix}/admin/users/${existing ? 'update' : 'newUser'}`, {
        headers: { 'X-Source': 'jsclient' },
        data: {
          username,
          ...(existing ? { userid: String(existing._id) } : {}),
          details: { name: username, email: `${username}@example.invalid`, password, roles },
        },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      expect(await response.json()).toMatchObject({ status: true });
    }
    await mongo
      .db('redbox-portal')
      .collection('user')
      .updateOne(
        { username: 'related-admin' },
        { $set: { token: createHash('sha256').update('rr20-isolated-pdf-token').digest('base64') } }
      );
  });

  test.beforeEach(async () => {
    const brand = await mongo.db('redbox-portal').collection('brandingconfig').findOne({ name: 'default' });
    expect(brand).toBeTruthy();
    const seed = async (type: string, metadata: object) => {
      const oid = `rr20-${type}-${Date.now()}-${ids.length}`;
      ids.push(oid);
      await mongo
        .db('redbox-storage')
        .collection('record')
        .insertOne({
          redboxOid: oid,
          revision: 0,
          harvestId: '',
          metadata,
          metaMetadata: {
            type,
            packageType: type,
            brandId: String(brand!._id),
            createdBy: 'related-admin',
            form: `${type}-1.0-draft`,
            searchCore: 'default',
            attachmentFields: [],
          },
          workflow: { stage: 'draft', stageLabel: 'Draft' },
          authorization: {
            edit: ['related-admin', 'related-librarian'],
            view: ['related-admin', 'related-librarian'],
            editRoles: [],
            viewRoles: [],
            editPending: [],
            viewPending: [],
          },
        });
      return oid;
    };
    a = await seed('related-activity', aData);
    b = await seed('related-activity', bData);
    p = await seed('related-plan', {
      title: 'Example plan',
      notes: 'Local note',
      primaryActivity: a,
      activities: [{ oid: a }, { oid: b }],
    });
  });

  test.afterAll(async () => {
    if (mongo) {
      await mongo
        .db('redbox-storage')
        .collection('record')
        .deleteMany({ redboxOid: { $in: ids } });
      await mongo.close();
    }
  });

  async function open(page: Page, username = 'related-admin', mode = 'edit') {
    // Dispose the old page before switching identities so its requests cannot race the login cookie.
    await page.goto('about:blank');
    await page.context().clearCookies();
    const response = await page.request.post('/user/login_local', {
      headers: { 'X-Source': 'jsclient' },
      form: { username, password, branding: 'default', portal: 'rdmp' },
    });
    expect((await response.json()).user.username).toBe(username);
    await page.goto(`${prefix}/record/${mode}/${p}`);
    await expect(page.locator('[data-rb-related-state]')).toHaveAttribute('data-rb-related-state', 'ready');
  }

  const title = (page: Page) => page.getByLabel(/^(Current primary activity title|Primary activity)$/);
  const reference = (page: Page) => page.getByLabel('Primary activity OID (clear to unlink)', { exact: true });
  async function populated(page: Page, activity = aData, titleControl = title(page)) {
    await expect(titleControl).toHaveValue(activity.title);
    await expect(page.getByLabel('Start date', { exact: true }).first()).toHaveValue(activity.startDate);
    await expect(page.getByLabel('End date', { exact: true }).first()).toHaveValue(activity.endDate);
    await expect(page.getByLabel('Activity title', { exact: true })).toHaveCount(2);
    await expect(page.getByLabel('Activity title', { exact: true }).nth(0)).toHaveValue(aData.title);
    await expect(page.getByLabel('Activity title', { exact: true }).nth(1)).toHaveValue(bData.title);
    for (const [index, data] of [aData, bData].entries()) {
      await expect(page.getByLabel('Start date', { exact: true }).nth(index + 1)).toHaveValue(data.startDate);
      await expect(page.getByLabel('End date', { exact: true }).nth(index + 1)).toHaveValue(data.endDate);
    }
    await expect(page.getByRole('heading', { name: 'Current activities' })).toBeVisible();
    await expect(page.getByText('Activity A: 2026-02-01', { exact: false })).toBeVisible();
    await expect(page.getByText('Activity B: 2025-02-01', { exact: false })).toBeVisible();
    const oids = page.getByLabel('Activity OID', { exact: true });
    await expect(oids).toHaveCount(2);
    await expect(oids.nth(0)).toHaveValue(a);
    await expect(oids.nth(1)).toHaveValue(b);
  }

  async function readonlyView(page: Page, scalarTitle = title(page)) {
    for (const field of [
      reference(page),
      scalarTitle,
      page.getByLabel('Start date', { exact: true }).first(),
      page.getByLabel('End date', { exact: true }).first(),
      ...(await page.getByLabel('Activity title', { exact: true }).all()),
      ...(await page.getByLabel('Start date', { exact: true }).all()),
      ...(await page.getByLabel('End date', { exact: true }).all()),
      page.getByLabel('Activity OID', { exact: true }).nth(0),
      page.getByLabel('Activity OID', { exact: true }).nth(1),
    ]) {
      await expect(field).not.toBeEditable();
    }
    await expect(page.getByRole('button', { name: /add|remove|move up|move down/i })).toHaveCount(0);
    const dirty = await page.evaluate(
      () => (window as any).ng.getComponent(document.querySelector('redbox-form')).form.dirty
    );
    expect(dirty).toBe(false);
  }

  test('explicit same-ID refresh rereads changed source without dirtying the plan', async ({ page }, testInfo) => {
    await open(page);
    const planBefore = await mongo.db('redbox-storage').collection('record').findOne({ redboxOid: p });
    await mongo
      .db('redbox-storage')
      .collection('record')
      .updateOne({ redboxOid: a }, { $set: { 'metadata.title': 'Same ID updated title' } });
    const response = page.waitForResponse(
      r => r.url().includes('/relatedMetadata/resolve') && r.request().method() === 'POST'
    );
    await page.evaluate(async () => {
      const sources = Array.from(document.querySelectorAll('redbox-related-object-data')).map(element =>
        (window as any).ng.getComponent(element)
      );
      await sources
        .find(source => source.componentDefinition.config.relationId === 'primaryActivity')
        .refreshRelatedData(true);
    });
    expect((await response).ok()).toBeTruthy();
    await expect(title(page)).toHaveValue('Same ID updated title');
    await expect(reference(page)).toHaveValue(a);
    expect(await mongo.db('redbox-storage').collection('record').findOne({ redboxOid: p })).toEqual(planBefore);
    await expect(page.getByRole('button', { name: 'Save plan', exact: true })).toBeDisabled();
    await expect(page.locator('.rb-form-conflict')).toBeHidden();
  });

  test('initial server result populates hidden-source scalar, group and repeatable targets', async ({
    page,
  }, testInfo) => {
    const posts: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/relatedMetadata/resolve')) posts.push(req.url());
    });
    await open(page);
    await populated(page);
    const resolved = await page.request.get(`${prefix}/api/records/resolved/${p}?relations=primaryActivity,activities`);
    expect(resolved.ok(), await resolved.text()).toBeTruthy();
    const envelope = await resolved.json();
    const related = (envelope.data ?? envelope).relatedMetadata;
    await expect(title(page)).toHaveValue(related.primaryActivity.records[0].metadata.title);
    expect(related.activities.records.map((r: { metadata: { title: string } }) => r.metadata.title)).toEqual([
      aData.title,
      bData.title,
    ]);
    await expect(page.locator('redbox-related-object-data:visible').filter({ hasText: 'Activity A' })).toHaveCount(1);
    await expect(page.locator('redbox-related-object-data:not(:visible)')).toHaveCount(2);
    expect(posts, 'matching initial fingerprints reuse the server result').toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`initial-admin.png`), fullPage: true });
  });

  test('unsaved selection POST, unlink and source failure clear previous values', async ({ page }, testInfo) => {
    await open(page);
    const post = page.waitForResponse(
      r => r.url().includes('/relatedMetadata/resolve') && r.request().method() === 'POST'
    );
    await reference(page).fill(b);
    const response = await post;
    expect(response.ok(), `Refresh returned ${response.status()}: ${await response.text()}`).toBeTruthy();
    await populated(page, bData);
    await reference(page).fill('');
    await expect(title(page)).toHaveValue('');
    await expect(title(page)).toBeEditable();
    for (const label of ['Start date', 'End date']) {
      await expect(page.getByLabel(label, { exact: true }).first()).toHaveValue('');
      await expect(page.getByLabel(label, { exact: true }).first()).toBeEditable();
    }
    await page.screenshot({ path: testInfo.outputPath(`unlinked.png`), fullPage: true });
    await reference(page).fill(b);
    await expect(title(page)).toHaveValue(bData.title);
    await page.route(refresh, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await reference(page).fill(a);
    await expect(title(page)).toHaveValue('');
    await expect(page.getByLabel('Start date', { exact: true }).first()).toHaveValue('');
    await expect(page.getByLabel('End date', { exact: true }).first()).toHaveValue('');
    // The visible optional source uses its configured empty/unavailable presentation.
    await page.getByLabel('Activity OID', { exact: true }).first().fill(b);
    const information = page.locator('redbox-related-object-data:visible');
    await expect(information).toContainText('No accessible activities selected.');
    await expect(information).not.toContainText('Activity A:');
    await expect(information).not.toContainText('Activity B:');
    await expect(page.locator('body')).not.toContainText('stack trace');
    await expect(page.locator('[data-rb-related-state]')).toHaveAttribute('data-rb-related-state', 'ready');
    await page.screenshot({ path: testInfo.outputPath(`source-failure.png`), fullPage: true });
  });

  test('late A response cannot overwrite B, including after reload', async ({ page }, testInfo) => {
    await open(page);
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      await expect(title(page)).toHaveValue(aData.title);
      await reference(page).fill('');
      await expect(title(page)).toHaveValue('');
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      let delivered!: () => void;
      const delivery = new Promise<void>(resolve => {
        delivered = resolve;
      });
      let arrived!: () => void;
      const started = new Promise<void>(resolve => {
        arrived = resolve;
      });
      await page.route(refresh, async route => {
        const data = route.request().postDataJSON();
        if (data.references?.primaryActivity === a) {
          const response = await route.fetch();
          arrived();
          await gate;
          await route.fulfill({ response });
          delivered();
        } else await route.continue();
      });
      try {
        await reference(page).fill(a);
        await started;
        await reference(page).fill(b);
        await expect(title(page)).toHaveValue(bData.title);
      } finally {
        release();
      }
      await delivery;
      await page.evaluate(
        () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      );
      await expect(page.locator('[data-rb-related-state]')).toHaveAttribute('data-rb-related-state', 'ready');
      await expect(title(page)).toHaveValue(bData.title);
      await page.unroute(refresh);
    }
    await page.screenshot({ path: testInfo.outputPath(`race-b-wins.png`), fullPage: true });
  });

  test('role presentations share related data in edit and view modes', async ({ page }, testInfo) => {
    for (const mode of ['edit', 'view']) {
      await open(page, 'related-admin', mode);
      await expect(page.locator('redbox-simpleinput input').filter({ visible: true })).not.toHaveCount(0);
      await expect(page.locator('textarea')).toHaveCount(0);
      await expect(title(page)).toHaveValue(aData.title);
      await populated(page);
      if (mode === 'view') {
        await readonlyView(page);
        await page.screenshot({ path: testInfo.outputPath(`admin-view.png`), fullPage: true });
      }
      await open(page, 'related-librarian', mode);
      const summary = page.getByLabel('Primary activity summary (read only)', { exact: true });
      await expect(summary).toHaveValue(aData.title);
      await expect(summary).toHaveAttribute('readonly', '');
      await populated(page, aData, summary);
      if (mode === 'view') await expect(summary).not.toBeEditable();
      if (mode === 'view') await readonlyView(page, summary);
      await expect(page.getByLabel('Current primary activity title', { exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`initial-librarian-${mode}.png`), fullPage: true });
    }
  });
  test('source-only reload stays pristine; local save excludes transient values and real concurrent edits conflict', async ({
    page,
    context,
  }) => {
    await open(page);
    const save = page.getByRole('button', { name: 'Save plan', exact: true });
    await expect(save).toBeDisabled();
    await mongo
      .db('redbox-storage')
      .collection('record')
      .updateOne({ redboxOid: a }, { $set: { 'metadata.title': 'Activity A revised' } });
    await page.reload();
    await expect(title(page)).toHaveValue('Activity A revised');
    await expect(save).toBeDisabled();
    await expect(page.locator('.rb-form-conflict')).toBeHidden();
    await page.getByLabel('Local notes (always stored on this plan)', { exact: true }).fill('Real local edit');
    const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes(`/recordmeta/${p}`));
    await save.click();
    const response = await saved;
    expect(response.ok(), await response.text()).toBeTruthy();
    const payload = response.request().postDataJSON();
    expect(payload.notes).toBe('Real local edit');
    for (const key of ['activityTitle', 'activityDates', 'activitySummaries', 'relatedMetadata']) {
      expect(payload).not.toHaveProperty(key);
    }
    await expect(save).toBeDisabled();
    const stored = await mongo.db('redbox-storage').collection('record').findOne({ redboxOid: p });
    expect(stored!.metadata.notes).toBe('Real local edit');
    expect(stored!.metadata).not.toHaveProperty('activityTitle');

    const other = await context.newPage();
    try {
      await other.goto(`${prefix}/record/edit/${p}`);
      await expect(other.locator('[data-rb-related-state]')).toHaveAttribute('data-rb-related-state', 'ready');
      await page.getByLabel('Local notes (always stored on this plan)', { exact: true }).fill('First editor');
      await other.getByLabel('Local notes (always stored on this plan)', { exact: true }).fill('Second editor');
      const first = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes(`/recordmeta/${p}`));
      await save.click();
      expect((await first).ok()).toBeTruthy();
      const conflict = other.waitForResponse(
        r => r.request().method() === 'PUT' && r.url().includes(`/recordmeta/${p}`)
      );
      await other.getByRole('button', { name: 'Save plan', exact: true }).click();
      expect((await conflict).status()).toBe(412);
      await expect(other.locator('redbox-form-conflict-presenter [role="alert"]')).toBeVisible();
    } finally {
      await other.close();
    }
  });

  test('real PDFService waits for delayed related data and repeatable rendering; required failures stop printing', async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await open(page);
    const cookies = await page.context().cookies();
    for (const wait of [true, false]) {
      await mongo
        .db('redbox-storage')
        .collection('record')
        .updateOne({ redboxOid: a }, { $set: { metadata: aData } });
      await relatedPdfProof({
        outputDir: testInfo.outputPath(),
        baseURL: baseURL!,
        oid: p,
        cookies,
        wait,
        changeSource: () =>
          mongo
            .db('redbox-storage')
            .collection('record')
            .updateOne(
              { redboxOid: a },
              { $set: { metadata: { title: 'PDF final activity', startDate: '2027-02-01', endDate: '2027-03-01' } } }
            ),
      });
    }
    await mongo
      .db('redbox-storage')
      .collection('record')
      .updateOne({ redboxOid: a }, { $set: { metadata: aData } });
    await relatedPdfProof({
      outputDir: testInfo.outputPath(),
      baseURL: baseURL!,
      oid: p,
      cookies,
      wait: true,
      requiredError: true,
      changeSource: () => mongo.db('redbox-storage').collection('record').deleteOne({ redboxOid: a }),
    });
  });
});
