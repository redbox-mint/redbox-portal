import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
const host = JSON.parse(fs.readFileSync('.tmp/playwright/sr-pages-host.json', 'utf8'));
async function providerRecord(page: Page): Promise<string> {
  const csrf = await token(page);
  const response = await page.request.post(host.url + '/default/rdmp/api/records/metadata/dataRecord', {
    headers: { 'X-CSRF-Token': csrf, 'X-ReDBox-Api-Version': '2.0' },
    data: { metadata: { title: 'Provider lifetime record' } },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).data.oid;
}
async function login(page: Page) {
  await page.goto(host.url + '/default/rdmp/user/login');
  await page.getByText('Login as an administrator', { exact: true }).click();
  await page.locator('#username').fill('pilot-admin');
  await page.locator('#password').fill('pilot-password');
  await page.locator('local-auth button[type=submit]').click();
  await expect(page).toHaveURL(/researcher\/home/);
}
async function control(path: string) {
  const response = await fetch(host.control + path);
  expect(response.status).toBe(200);
  return response.json();
}
async function token(page: Page) {
  return page.evaluate(async () => (await (await fetch('/portal/csrfToken')).json())._csrf);
}

test('SR-040 visible Angular login create and edit persist through the standalone host', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await page.goto(host.url + '/default/rdmp/record/dataRecord/edit');
  await expect(page.locator('redbox-form input[type=text]').first()).toBeVisible();
  await page.locator('redbox-form input[type=text]').first().fill('Browser persisted title');
  const created = page.waitForResponse(
    response => response.url().includes('/recordmeta/dataRecord') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const result = await created;
  expect(result.status()).toBe(200);
  const payload = await result.json();
  const oid = payload.meta.oid;
  expect(oid).toBeTruthy();
  expect((await control('/record?oid=' + oid)).metadata.title).toBe('Browser persisted title');
  await page.goto(host.url + '/default/rdmp/record/edit/' + oid);
  await expect(page.locator('redbox-form input[type=text]').first()).toHaveValue('Browser persisted title');
  await page.locator('redbox-form input[type=text]').first().fill('Browser edited title');
  const updated = page.waitForResponse(
    response => response.url().includes('/recordmeta/') && response.request().method() === 'PUT'
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  expect((await updated).status()).toBe(200);
  await expect.poll(async () => (await control('/record?oid=' + oid)).metadata.title).toBe('Browser edited title');
  await page.reload();
  await expect(page.locator('redbox-form input[type=text]').first()).toHaveValue('Browser edited title');
  const missing = await page.goto(host.url + '/default/rdmp/unknown-page');
  expect(missing!.status()).toBe(404);
  await expect(page.getByText('Page Not Found!', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('SR-044 browser multipart tus resume Companion transfer and progress reconnect use real bytes', async ({
  page,
}) => {
  await login(page);
  const oid = await providerRecord(page);
  const csrf = await token(page);
  const result = await page.evaluate(
    async ({ oid, csrf }) => {
      const base = '/portal/default/rdmp';
      const form = new FormData();
      form.append('attachmentFields', new Blob(['browser multipart bytes'], { type: 'text/plain' }), 'browser.txt');
      const multipart = await fetch(base + '/api/records/datastreams/' + oid, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrf, 'X-ReDBox-Api-Version': '2.0' },
        body: form,
      });
      const created = await fetch(base + '/record/' + oid + '/attach', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrf,
          'Tus-Resumable': '1.0.0',
          'Upload-Length': '6',
          'Upload-Metadata': 'filename ' + btoa('browser-tus.txt'),
        },
      });
      const location = created.headers.get('location')!;
      const patch = async (offset: number, body: string) =>
        fetch(location, {
          method: 'PATCH',
          headers: {
            'X-CSRF-Token': csrf,
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream',
          },
          body,
        });
      const first = await patch(0, 'abc');
      const head = await fetch(location, {
        method: 'HEAD',
        headers: { 'X-CSRF-Token': csrf, 'Tus-Resumable': '1.0.0' },
      });
      const second = await patch(3, 'def');
      return {
        multipart: multipart.status,
        multipartBody: await multipart.text(),
        create: created.status,
        first: first.status,
        firstBody: await first.text(),
        offset: head.headers.get('upload-offset'),
        second: second.status,
        secondBody: await second.text(),
        key: location.split('/').pop(),
      };
    },
    { oid, csrf }
  );
  expect(result.multipart, result.multipartBody).toBe(200);
  expect(result.create).toBe(201);
  expect(result.first, JSON.stringify(result)).toBe(204);
  expect(result.offset).toBe('3');
  expect(result.second, JSON.stringify(result)).toBe(204);
  expect((await control('/staged?key=' + result.key)).bytes).toBe('abcdef');
  const remote = await page.evaluate(
    async ({ oid, csrf, sourceUrl }) => {
      const response = await fetch('/portal/companion/url/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({
          url: sourceUrl,
          protocol: 'tus',
          endpoint: location.origin + '/portal/default/rdmp/companion/record/' + oid + '/attach',
          headers: { Authorization: 'Bearer pilot-api-token' },
          metadata: { name: 'remote.txt' },
        }),
      });
      if (response.status !== 200) throw new Error(await response.text());
      const { token } = await response.json();
      return new Promise<{ action: string; payload: { url: string } }>((resolve, reject) => {
        const socket = new WebSocket(location.origin.replace('http:', 'ws:') + '/portal/companion/api/' + token);
        const timer = setTimeout(() => reject(new Error('Remote transfer timed out')), 15000);
        socket.onmessage = event => {
          const message = JSON.parse(event.data);
          if (['success', 'error'].includes(message.action)) {
            clearTimeout(timer);
            socket.close();
            resolve(message);
          }
        };
        socket.onerror = () => reject(new Error('Remote websocket failed'));
      });
    },
    { oid, csrf, sourceUrl: host.sourceUrl }
  );
  expect(remote.action, JSON.stringify(remote)).toBe('success');
  expect((await control('/staged?key=' + remote.payload.url.split('/').pop())).bytes).toBe('companion-real-bytes!');
  await page.addScriptTag({ url: '/portal/progress/socket.io/socket.io.js' });
  await page.addScriptTag({ url: '/portal/js/redbox-progress.js' });
  const progress = await page.evaluate(
    async ({ oid, csrf }) => {
      const base = '/portal/default/rdmp';
      const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
      let receive: (event: unknown) => void = () => {};
      async function connect() {
        const helper = Reflect.get(
          window,
          'createRedboxProgress'
        )({
          io: Reflect.get(window, 'io'),
          endpoint: { origin: location.origin, path: '/portal/progress/socket.io' },
          tokenUrl: base + '/asynch/socket-token',
          csrfToken: () => csrf,
          onProgress: (event: string, progress: unknown) => {
            if (event === 'start') receive(progress);
          },
        });
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Shipped progress helper did not subscribe')), 10000);
          helper.subscribe(oid, (status: { status: boolean }) => {
            clearTimeout(timer);
            if (status.status) resolve();
            else reject(new Error('Denied progress room'));
          });
        });
        return helper;
      }
      let helper = await connect();
      helper.close();
      helper = await connect();
      const received = new Promise<any>(resolve => {
        receive = resolve;
      });
      const response = await fetch(base + '/asynch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ relatedRecordId: oid, name: 'Browser progress', taskType: 'upload' }),
      });
      const event = await received;
      helper.close();
      return { status: response.status, event };
    },
    { oid, csrf }
  );
  expect(progress.status).toBe(200);
  expect(progress.event.relatedRecordId).toBe(oid);
});

test('SR-044 real Keycloak login returns to the branded standalone page', async ({ page }) => {
  await page.goto(host.url + '/default/rdmp/user/login');
  await page.locator('a[href="/portal/user/begin_oidc"]').click();
  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill('test-exception');
  await page.locator('#password').fill('password');
  await page.locator('#kc-login').click();
  await expect(page).toHaveURL(/\/portal\/default\/rdmp\/researcher\/home/);
  await expect(page.locator('.user-menu')).toContainText('menu-welcome-text');
});

test('SR-044 aborted session and accepted PDF retain pools through deadline then persist and retry stop', async ({
  page,
}, testInfo) => {
  try {
    await login(page);
    const oid = await providerRecord(page);
    const csrf = await token(page);
    expect((await control('/status')).upgradeListeners).toBe(2);
    const pdf = await page.request.post(host.url + '/default/rdmp/__test/pdf/' + oid, {
      headers: { 'X-CSRF-Token': csrf },
    });
    expect(pdf.status()).toBe(200);
    await expect.poll(async () => (await control('/status')).pdfSeen, { timeout: 45000 }).toBe(true);
    await page.evaluate(
      ({ csrf }) => {
        const controller = new AbortController();
        Reflect.set(window, 'heldSessionAbort', controller);
        void fetch('/portal/default/rdmp/__test/held-session', {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrf },
          signal: controller.signal,
        }).catch(() => {});
      },
      { csrf }
    );
    await expect.poll(async () => (await control('/status')).sessionSeen).toBe(true);
    await page.evaluate(() => Reflect.get(window, 'heldSessionAbort').abort());
    // Hold a real accepted multipart finalization and tus completion callback.
    await control('/hold-tus');
    await page.evaluate(
      async ({ oid, csrf, sourceUrl }) => {
        const headers = { 'X-CSRF-Token': csrf };
        const base = '/portal/default/rdmp';
        const form = new FormData();
        form.append('attachmentFields', new Blob(['held-real-bytes']), 'held-upload.txt');
        const abort = new AbortController();
        Reflect.set(window, 'heldUploadAbort', abort);
        void fetch(base + '/api/records/datastreams/' + oid, {
          method: 'POST',
          headers,
          body: form,
          signal: abort.signal,
        }).catch(() => {});
        const created = await fetch(base + '/record/' + oid + '/attach', {
          method: 'POST',
          headers: { ...headers, 'Tus-Resumable': '1.0.0', 'Upload-Length': '3' },
        });
        if (created.status !== 201) throw new Error('Held tus creation failed');
        void fetch(created.headers.get('location')!, {
          method: 'PATCH',
          headers: {
            ...headers,
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': '0',
            'Content-Type': 'application/offset+octet-stream',
          },
          body: 'xyz',
        }).catch(() => {});
        const remote = await fetch('/portal/companion/url/get', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: sourceUrl + '/held',
            protocol: 'tus',
            endpoint: location.origin + base + '/companion/record/' + oid + '/attach',
            headers: { Authorization: 'Bearer pilot-api-token' },
            metadata: { name: 'held-remote.txt' },
          }),
        });
        if (remote.status !== 200) throw new Error('Held Companion creation failed');
        const socket = new WebSocket(
          location.origin.replace('http:', 'ws:') + '/portal/companion/api/' + (await remote.json()).token
        );
        Reflect.set(window, 'remoteClosed', false);
        socket.onclose = () => Reflect.set(window, 'remoteClosed', true);
        Reflect.set(window, 'heldRemoteSocket', socket);
      },
      { oid, csrf, sourceUrl: host.sourceUrl }
    );
    await expect
      .poll(async () => {
        const status = await control('/status');
        return status.uploadSeen && status.tusSeen && status.remoteSeen;
      })
      .toBe(true);
    await page.evaluate(() => Reflect.get(window, 'heldUploadAbort').abort());
    const stopped = await control('/stop');
    expect(stopped.stopFailed).toBe(true);
    expect(stopped.persistence.pools).toBeGreaterThan(0);
    expect(stopped.persistence.prismaClients).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'remoteClosed'))).toBe(true);
    await control('/release');
    await expect
      .poll(
        async () => {
          const status = await control('/status');
          return status.pdfSaved && status.sessionSaved && status.uploadSaved && status.tusSaved;
        },
        { timeout: 15000 }
      )
      .toBe(true);
    const durable = await control('/status');
    expect(durable.sessionPersisted).toBe(1);
    expect(durable.pdfBytes).toBeGreaterThan(1000);
    expect(durable.persistedPdfBytes).toBe(durable.pdfBytes);
    const retried = await control('/retry');
    expect(retried.status.stopped).toBe(true);
    expect(retried.persistence.pools).toBe(0);
    expect(retried.persistence.prismaClients).toBe(0);
    expect(retried.upgradeListeners).toBe(0);
    console.log(
      'SR-044 durable completion',
      JSON.stringify({
        sessionPersisted: durable.sessionPersisted,
        pdfBytes: durable.pdfBytes,
        persistedPdfBytes: durable.persistedPdfBytes,
        uploadSaved: durable.uploadSaved,
        tusSaved: durable.tusSaved,
        pools: retried.persistence.pools,
        prismaClients: retried.persistence.prismaClients,
        upgradeListeners: retried.upgradeListeners,
      })
    );
  } finally {
    await testInfo.attach('lifetime-status', {
      body: JSON.stringify(await control('/status'), null, 2),
      contentType: 'application/json',
    });
  }
});
