import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { io } from 'socket.io-client';
import { canonical, socketPath } from './rawSocketFixture';

if (!process.env.HTTP_PILOT_TEST_MONGO_URL || !process.env.HTTP_READ_SOLR_PORT)
  throw new Error('FM-021 requires disposable real Mongo and Solr.');

const credentials = { Authorization: 'Bearer pilot-api-token', Origin: canonical };
function child(native: boolean, mode = 'enabled') {
  const process = fork(path.join(__dirname, 'fixtures/companion-portal.cjs'), [native ? 'fastify' : 'express', mode], {
    execArgv: ['--no-experimental-strip-types', '--unhandled-rejections=strict'],
    env: { ...global.process.env, NODE_ENV: 'test' },
    silent: true,
  });
  let logs = '',
    sequence = 0;
  process.stdout!.on('data', bytes => {
    logs += bytes.toString();
  });
  process.stderr!.on('data', bytes => {
    logs += bytes.toString();
  });
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  process.on('message', ({ id, result, error, stack }: any) => {
    const call = pending.get(id);
    pending.delete(id);
    if (error) call?.reject(new Error(stack || error));
    else call?.resolve(result);
  });
  process.on('exit', (code, signal) => {
    for (const call of pending.values()) call.reject(new Error(`Companion child exited ${code}/${signal}: ${logs}`));
    pending.clear();
  });
  const call = (command: string, args?: unknown): Promise<any> =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      process.send({ id, command, args });
    });
  return { process, call, logs: () => logs };
}
async function stopChild(c: ReturnType<typeof child>) {
  try {
    const closed = await c.call('close');
    assert.equal(closed.pools, 0);
    assert.equal(closed.stopped, true);
    assert.equal(closed.upgrades, 0);
    if (c.process.exitCode === null) await once(c.process, 'exit');
    return closed;
  } finally {
    if (c.process.exitCode === null) c.process.kill('SIGKILL');
  }
}
function wire(
  url: string,
  method = 'GET',
  headers: Record<string, string> = credentials,
  body?: string,
  rawTarget?: string
) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        ...(rawTarget ? { path: rawTarget } : {}),
        headers: { ...headers, ...(body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) }) },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('HTTP fixture timeout')));
    req.end(body);
  });
}
function snapshot(response: Awaited<ReturnType<typeof wire>>, upstream: string) {
  const { date, connection, 'keep-alive': keepAlive, ...headers } = response.headers;
  return { status: response.status, headers, body: response.body.split(upstream).join('UPSTREAM') };
}
async function eventually(c: ReturnType<typeof child>, key: string, expected: number) {
  for (let i = 0; i < 100; i++) {
    const state = await c.call('state');
    if (state[key] === expected) return state;
    await delay(20);
  }
  assert.fail(`Companion ${key} did not become ${expected}: ${JSON.stringify(await c.call('state'))}`);
}
function ws(url: string, token: string, origin: string | null = canonical, suffix = '') {
  const client = new WebSocket(url.replace('http:', 'ws:') + '/imports/api/' + token + suffix, {
    headers: origin === null ? {} : { Origin: origin },
  });
  client.on('error', () => {});
  return client;
}
async function refused(client: WebSocket, status: number) {
  const actual = await new Promise<number>((resolve, reject) => {
    client.once('unexpected-response', (_request, response) => {
      response.resume();
      client.terminate();
      resolve(response.statusCode!);
    });
    client.once('open', () => {
      client.terminate();
      reject(new Error('Unauthorized upgrade accepted'));
    });
  });
  assert.equal(actual, status);
}
function terminal(client: WebSocket) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Provider terminal timeout')), 10000);
    client.on('message', data => {
      const event = JSON.parse(String(data));
      if (['success', 'error'].includes(event.action)) {
        clearTimeout(timer);
        resolve(event);
      }
    });
  });
}
async function login(url: string) {
  const token = await wire(url + '/csrfToken', 'GET', {});
  const cookie = (token.headers['set-cookie'] as string[])[0].split(';')[0];
  const csrf = JSON.parse(token.body)._csrf;
  const result = await wire(
    url + '/user/login_local',
    'POST',
    {
      Cookie: cookie,
      Origin: canonical,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
      'X-Source': 'jsclient',
    },
    JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' })
  );
  assert.equal(result.status, 200, result.body);
  const rotated = (result.headers['set-cookie'] as string[])[0].split(';')[0];
  const fresh = await wire(url + '/csrfToken', 'GET', { Cookie: rotated });
  return { Cookie: rotated, Origin: canonical, 'X-CSRF-Token': JSON.parse(fresh.body)._csrf };
}

const oracle = new Map<string, unknown>();
for (const native of [false, true])
  describe(`FM-021 ${native ? 'Fastify' : 'retained Express'} production Companion`, function () {
    this.timeout(60000);
    let c: ReturnType<typeof child>, url: string, upstream: string;
    const sockets = new Set<WebSocket>();
    const post = (target: string, body: unknown, headers: Record<string, string> = credentials) =>
      wire(url + '/imports' + target, 'POST', { ...headers, 'Content-Type': 'application/json' }, JSON.stringify(body));
    const start = async () => {
      const response = await post('/url/get', {
        url: upstream + '/source/small',
        protocol: 'tus',
        endpoint: upstream + '/sink',
        headers: { Authorization: 'Bearer destination-grant' },
        metadata: { name: 'remote.txt' },
      });
      assert.equal(response.status, 200, response.body);
      const token = JSON.parse(response.body).token;
      assert.equal(typeof token, 'string');
      return token as string;
    };
    before(async () => {
      c = child(native);
      const init = await c.call('init');
      url = init.url;
      upstream = init.upstream;
      if (native) {
        assert.equal(init.prepared, true);
        assert.equal(init.listenCalls, 1);
        assert.equal(init.bridgeIsServer, false);
        assert.equal(init.upgrades, 1, 'One production upgrade dispatcher');
      } else {
        assert.equal(init.reference.revision, '5cc027e11d95994e1dc9d549427a883d65b3269d');
        assert.match(init.reference.sha256, /^[a-f0-9]{64}$/);
      }
    });
    after(async () => {
      for (const client of sockets) client.terminate();
      if (c) await stopChild(c);
    });

    it('activates the Companion-enabled production host after ownership construction', async () => {
      const state = await c.call('state');
      assert.equal(state.listening, true);
      assert.equal(state.stopped, false);
      const health = await wire(url + '/imports/health');
      assert.equal(health.status, 200, health.body);
    });

    const cases: {
      name: string;
      path: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      status: number;
      outside?: boolean;
    }[] = [
      { name: 'root', path: '/imports', status: 404 },
      { name: 'health', path: '/imports/health', status: 200 },
      { name: 'trailing health', path: '/imports/health/', status: 200 },
      { name: 'case mount', path: '/IMPORTS/health', status: 200 },
      { name: 'unconfigured namespace', path: '/companion/health', status: 404, outside: true },
      { name: 'segment sibling', path: '/imports-other/health', status: 404, outside: true },
      { name: 'drive missing provider auth', path: '/imports/drive/list', status: 401 },
      { name: 'canonical send token', path: '/imports/drive/send-token?uppyAuthToken=synthetic', status: 200 },
      { name: 'health HEAD', path: '/imports/health', method: 'HEAD', status: 200 },
      { name: 'health OPTIONS', path: '/imports/health', method: 'OPTIONS', status: 204 },
      { name: 'unauthenticated', path: '/imports/health', headers: {}, status: 401 },
      {
        name: 'bad bearer before input',
        path: '/imports/url/meta',
        method: 'POST',
        headers: { ...credentials, Authorization: 'Bearer invalid', 'Content-Type': 'application/json' },
        body: '{}',
        status: 401,
      },
      {
        name: 'missing URL',
        path: '/imports/url/meta',
        method: 'POST',
        headers: { ...credentials, 'Content-Type': 'application/json' },
        body: '{}',
        status: 400,
      },
      {
        name: 'structured URL',
        path: '/imports/url/get',
        method: 'POST',
        headers: { ...credentials, 'Content-Type': 'application/json' },
        body: '{"url":{}}',
        status: 400,
      },
      {
        name: 'parser before auth',
        path: '/imports/url/meta',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"secret":',
        status: 400,
      },
      {
        name: 'flat form',
        path: '/imports/url/meta',
        method: 'POST',
        headers: { ...credentials, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'url%5Bx%5D=value',
        status: 400,
      },
      {
        name: 'origin',
        path: '/imports/url/meta',
        method: 'POST',
        headers: { ...credentials, Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' },
        body: '{}',
        status: 403,
      },
    ];
    for (const row of cases)
      it(`raw HTTP differential: ${row.name}`, async () => {
        const result = await wire(url + row.path, row.method, row.headers, row.body);
        assert.equal(result.status, row.status, result.body);
        if (row.outside) return;
        const value = snapshot(result, upstream);
        if (!native) oracle.set(row.name, value);
        else assert.deepEqual(value, oracle.get(row.name));
      });
    it('preserves real URL metadata, destination allowlisting and brand roles before remote I/O', async () => {
      const response = await post('/url/meta', { url: upstream + '/source/small' });
      assert.equal(response.status, 200, response.body);
      const value = snapshot(response, upstream);
      if (!native) oracle.set('meta', value);
      else assert.deepEqual(value, oracle.get('meta'));
      const before = (await c.call('state')).metaHits;
      await c.call('actor', 'reader');
      assert.equal((await post('/url/meta', { url: upstream + '/source/small' })).status, 403);
      await c.call('actor', 'admin');
      assert.equal((await c.call('state')).metaHits, before);
      assert.equal(
        (await post('/url/get', { url: upstream + '/source/small', endpoint: 'https://foreign.invalid/upload' }))
          .status,
        400
      );
    });
    it('uses real native/Express sessions and enforces CSRF before the provider', async () => {
      const session = await login(url);
      assert.equal(
        (await post('/url/meta', { url: upstream + '/source/small' }, { Cookie: session.Cookie })).status,
        403
      );
      assert.equal(
        (await post('/url/meta', { url: upstream + '/source/small' }, { ...session, 'X-CSRF-Token': 'invalid' }))
          .status,
        403
      );
      assert.equal((await post('/url/meta', { url: upstream + '/source/small' }, session)).status, 200);
      if (native) {
        await c.call('holdSession');
        let finished = false;
        const response = post('/url/meta', { url: upstream + '/source/small' }, session).then(result => {
          finished = true;
          return result;
        });
        await c.call('waitSession');
        await delay(60);
        assert.equal(finished, false);
        await c.call('releaseSession');
        assert.equal((await response).status, 200);
      }
    });
    it('persists provider session mutations before its raw logout reply', async () => {
      const session = await login(url);
      await c.call('seedGrant');
      const result = await wire(url + '/imports/drive/logout', 'GET', session);
      assert.equal(result.status, 200, result.body);
      assert.deepEqual(JSON.parse(result.body), { ok: true, revoked: false });
      const grants = await c.call('savedGrant');
      assert(grants.some((grant: any) => grant.state === null && grant.dynamic === null));
      // Grant matches originalUrl against server.path without implicitPath in the pinned baseline.
      assert.equal((await wire(url + '/imports/connect/googledrive', 'GET', session)).status, 404);
    });
    if (native)
      it('keeps session write failures behind the shared safe writer before raw provider bytes', async () => {
        const session = await login(url);
        await c.call('failSession');
        try {
          const result = await post('/url/meta', { url: upstream + '/source/small' }, session);
          assert.equal(result.status, 500);
          assert(!result.body.includes('private-session-provider-credential'));
          assert(!result.body.includes('small'));
          assert.equal(result.headers['set-cookie'], undefined);
        } finally {
          await c.call('releaseSession');
        }
      });
    it('refuses untracked/malformed/foreign-origin upgrades and retains a real transfer through reconnect', async () => {
      for (const token of ['unknown', '__proto__', 'constructor', 'unknown/extra']) await refused(ws(url, token), 403);
      await c.call('holdSink');
      const token = await start();
      for (const origin of [null, 'https://foreign.invalid']) await refused(ws(url, token, origin), 403);
      const client = ws(url, token);
      sockets.add(client);
      await once(client, 'open');
      await c.call('waitSink');
      assert.equal((await c.call('state')).transfers, 1);
      client.close();
      await once(client, 'close');
      assert.equal((await c.call('state')).transfers, 1);
      const reconnect = ws(url, token);
      sockets.add(reconnect);
      const done = terminal(reconnect);
      await once(reconnect, 'open');
      await c.call('releaseSink');
      assert.equal((await done).action, 'success');
      await eventually(c, 'transfers', 0);
      assert((await c.call('state')).files.includes('remote-companion-bytes'));
      await refused(ws(url, token), 403);
      reconnect.close();
      await once(reconnect, 'close');
    });
    it('keeps Companion and Socket.IO upgrades independent on the sole listener', async () => {
      await c.call('holdSink');
      const token = await start();
      const client = ws(url, token);
      sockets.add(client);
      const done = terminal(client);
      await once(client, 'open');
      await c.call('waitSink');
      const grant = await wire(url + '/default/rdmp/asynch/socket-token', 'POST', credentials);
      assert.equal(grant.status, 200, grant.body);
      const body = JSON.parse(grant.body);
      const portal = io(new URL(url).origin, {
        path: socketPath,
        transports: ['websocket'],
        reconnection: false,
        auth: { token: body.token ?? body.data?.token },
        extraHeaders: { Origin: canonical },
      });
      try {
        await new Promise<void>((resolve, reject) => {
          portal.once('connect', resolve);
          portal.once('connect_error', reject);
        });
        await delay(1200);
        assert.equal(client.readyState, WebSocket.OPEN);
        assert.equal(portal.connected, true);
        assert.deepEqual(await portal.timeout(3000).emitWithAck('subscribe', 'fm020-record'), { status: true });
        await c.call('releaseSink');
        assert.equal((await done).action, 'success');
      } finally {
        portal.disconnect();
        client.close();
      }
    });
    it('does not log credentials or destination response bodies when the real provider fails', async () => {
      await c.call('rejectSink', true);
      const token = await start(),
        client = ws(url, token);
      sockets.add(client);
      const done = terminal(client);
      await once(client, 'open');
      assert.equal((await done).action, 'error');
      client.close();
      await c.call('rejectSink', false);
      assert(!c.logs().includes('destination-grant'));
      assert(!c.logs().includes('private-provider-response'));
      assert(!c.logs().includes(token));
    });
    it('retains disconnected provider work and borrowed pools through stop/deadline/retry', async () => {
      await c.call('holdSink');
      const activeToken = await start(),
        active = ws(url, activeToken);
      sockets.add(active);
      await once(active, 'open');
      await c.call('waitSink');
      await c.call('holdMeta');
      const req = request(url + '/imports/url/meta', {
        method: 'POST',
        headers: { ...credentials, 'Content-Type': 'application/json' },
      });
      req.on('error', () => {});
      req.end(JSON.stringify({ url: upstream + '/source/held' }));
      await c.call('waitMeta');
      req.destroy();
      if (native) {
        await delay(30);
        assert((await c.call('state')).requests > 0);
        const began = Date.now();
        const disconnected = once(active, 'close');
        const stopping = c.call('stop', 300);
        await delay(60);
        assert.equal(active.readyState, WebSocket.OPEN);
        const stopped = await stopping;
        assert.match(stopped.error, /deadline/i);
        await disconnected;
        assert(Date.now() - began >= 250);
        assert.equal((await c.call('state')).transfers, 0);
        assert.equal((await c.call('state')).sockets, 0);
        const state = await c.call('state');
        assert.equal(state.stopped, false);
        assert(state.pools > 0);
        await c.call('releaseMeta');
        await c.call('releaseSink');
        await eventually(c, 'requests', 0);
        const retried = await c.call('stop', 5000);
        assert.equal(retried.error, null);
        assert.equal((await c.call('state')).closeCalls, 1);
        assert.equal(await c.call('restart'), true);
      } else {
        // The retained baseline does not own a provider callback after disconnect.
        // Release the external provider before closing its historical application.
        const done = terminal(active);
        await c.call('releaseMeta');
        await c.call('releaseSink');
        await done;
        active.close();
        await once(active, 'close');
        await delay(100);
      }
    });
  });

for (const mode of ['disabled', 'denied'])
  describe(`FM-021 optional ${mode} production mode`, function () {
    this.timeout(60000);
    for (const native of [false, true])
      it(`${native ? 'Fastify' : 'Express'} ${mode} acquires no unauthorized provider work`, async () => {
        const c = child(native, mode);
        try {
          const init = await c.call('init');
          const result = await wire(init.url + '/imports/health');
          assert.equal(result.status, mode === 'disabled' ? 404 : 403);
          assert.equal((await c.call('state')).metaHits, 0);
          if (native && mode === 'disabled') assert(!init.routes.some((r: any) => r.path.includes('/imports')));
        } finally {
          await stopChild(c);
        }
      });
  });

for (const mode of ['drive', 'onedrive', 'streaming']) {
  const providerNames = mode === 'drive' ? ['drive'] : mode === 'onedrive' ? ['onedrive'] : ['drive', 'onedrive'];
  const observations = new Map<string, unknown>();
  for (const native of [false, true])
    describe(`FM-035 ${mode} ${native ? 'Fastify' : 'retained Express'} Companion completion`, function () {
      this.timeout(90000);
      let c: ReturnType<typeof child>, url: string, upstream: string, portalEndpoint: string;
      const sockets = new Set<WebSocket>();
      before(async () => {
        c = child(native, mode);
        const init = await c.call('init');
        ({ url, upstream, portalEndpoint } = init);
        if (native) assert.equal(init.upgrades, 1);
      });
      after(async () => {
        for (const client of sockets) client.terminate();
        if (c) await stopChild(c);
      });
      for (const provider of providerNames) {
        it(`${provider} authenticates via callback, lists and transfers provider bytes through portal TUS`, async () => {
          const session = await login(url);
          await c.call('seedProviderGrant', provider);
          const callback = await wire(url + '/imports/' + provider + '/callback', 'GET', session);
          assert.equal(callback.status, 302, callback.body);
          const authToken = new URL(String(callback.headers.location)).searchParams.get('uppyAuthToken');
          assert(authToken);
          const auth = { ...credentials, 'uppy-auth-token': authToken };
          const listed = await wire(url + '/imports/' + provider + '/list', 'GET', auth);
          assert.equal(listed.status, 200, listed.body);
          const listing = JSON.parse(listed.body);
          assert(listing.items.some((item: any) => item.id === 'provider-file'));
          const value = snapshot(listed, upstream),
            key = provider + '-authenticated-list';
          if (!native) observations.set(key, value);
          else assert.deepEqual(value, observations.get(key));
          const response = await wire(
            url + '/imports/' + provider + '/get/provider-file',
            'POST',
            { ...auth, 'Content-Type': 'application/json' },
            JSON.stringify({
              protocol: 'tus',
              endpoint: portalEndpoint,
              headers: credentials,
              metadata: { name: provider + '.txt' },
            })
          );
          assert.equal(response.status, 200, response.body);
          const client = ws(url, JSON.parse(response.body).token);
          sockets.add(client);
          const done = terminal(client);
          await once(client, 'open');
          const completed = await done;
          assert.equal(completed.action, 'success', JSON.stringify(completed));
          assert.equal(
            await c.call('staged', new URL(completed.payload.url).pathname.split('/').pop()),
            'remote-companion-bytes'
          );
          assert((await c.call('state')).providerHits >= 3);
          client.close();
          await once(client, 'close');
        });
        for (const method of ['GET', 'HEAD', 'OPTIONS'])
          for (const endpoint of ['list', 'list/folder', 'search?q=fixture', 'thumbnail/file', 'logout'])
            it(`${provider} ${endpoint} ${method} HTTP parity`, async () => {
              const response = await wire(url + '/imports/' + provider + '/' + endpoint, method);
              const value = snapshot(response, upstream);
              const key = provider + endpoint + method;
              if (!native) observations.set(key, value);
              else assert.deepEqual(value, observations.get(key));
              assert.notEqual(response.status, 500, response.body);
            });
        for (const endpoint of [
          'preauth',
          'get/file',
          'refresh-token',
          'deauthorization/callback',
          'simple-auth',
          'mutate/delete',
        ])
          it(`${provider} ${endpoint} POST HTTP parity`, async () => {
            const response = await wire(
              url + '/imports/' + provider + '/' + endpoint,
              'POST',
              { ...credentials, 'Content-Type': 'application/json' },
              '{}'
            );
            const value = snapshot(response, upstream);
            const key = provider + endpoint;
            if (!native) observations.set(key, value);
            else if (endpoint === 'deauthorization/callback') {
              const retained = observations.get(key) as typeof value;
              assert.equal(value.status, retained.status);
              assert.equal(value.body, retained.body);
              // Thrown provider faults use the existing native opaque-error boundary:
              // only its fixed cache/framing/COOP headers survive, never vendor headers.
              assert.deepEqual(Object.keys(value.headers).sort(), [
                'cache-control',
                'content-length',
                'content-type',
                'cross-origin-opener-policy',
                'expires',
                'pragma',
              ]);
            } else assert.deepEqual(value, observations.get(key));
            // The pinned provider's unsigned deauthorization callback returns 500.
            // Preserve and characterize that existing provider failure on both hosts.
            if (endpoint === 'deauthorization/callback') assert.equal(response.status, 500);
            else assert.notEqual(response.status, 500, response.body);
          });
        for (const absolute of [false, true])
          it(`${provider} canonical callback/connect/popup with hostile Host absolute=${absolute}`, async () => {
            const session = await login(url);
            const hostile = {
              ...session,
              Host: 'hostile.invalid',
              'X-Forwarded-Host': 'hostile.invalid',
              'X-Forwarded-Proto': 'http',
            };
            const target = (suffix: string) =>
              (absolute ? 'http://hostile.invalid' : '') + '/portal/imports/' + provider + suffix;
            const connect = await wire(
              url + '/imports/' + provider + '/connect',
              'GET',
              hostile,
              undefined,
              target('/connect')
            );
            assert.equal(connect.status, absolute ? 404 : 302, connect.body);
            if (!absolute) {
              const location = String(connect.headers.location);
              assert(location.startsWith('https://portal.example.invalid/portal/imports/connect/'));
              assert(!location.includes('hostile.invalid'));
            }
            await c.call('seedProviderGrant', provider);
            const callback = await wire(
              url + '/imports/' + provider + '/callback',
              'GET',
              hostile,
              undefined,
              target('/callback')
            );
            assert.equal(callback.status, absolute ? 404 : 302, callback.body);
            if (!absolute) {
              const callbackLocation = String(callback.headers.location);
              assert(
                callbackLocation.startsWith(
                  'https://portal.example.invalid/portal/imports/' + provider + '/send-token?'
                )
              );
              assert(!callbackLocation.includes('hostile.invalid'));
            }
            const popup = await wire(
              url + '/imports/' + provider + '/send-token',
              'GET',
              hostile,
              undefined,
              target('/send-token?uppyAuthToken=synthetic')
            );
            assert.equal(popup.status, 200, popup.body);
            assert(popup.body.includes('https://portal.example.invalid'));
            assert(!popup.body.includes('hostile.invalid'));
          });
      }
      it('transfers actual remote bytes through the production portal TUS callback', async () => {
        const response = await wire(
          url + '/imports/url/get',
          'POST',
          { ...credentials, 'Content-Type': 'application/json' },
          JSON.stringify({
            url: upstream + '/source/small',
            protocol: 'tus',
            endpoint: portalEndpoint,
            headers: credentials,
            metadata: { name: 'portal-remote.txt' },
          })
        );
        assert.equal(response.status, 200, response.body);
        const client = ws(url, JSON.parse(response.body).token);
        sockets.add(client);
        const done = terminal(client);
        await once(client, 'open');
        const completed = await done;
        assert.equal(completed.action, 'success', JSON.stringify(completed));
        await eventually(c, 'transfers', 0);
        assert.equal(
          await c.call('staged', new URL(completed.payload.url).pathname.split('/').pop()),
          'remote-companion-bytes'
        );
        client.close();
        await once(client, 'close');
      });
      it('keeps callback upgrades independent and rejects unknown/hostile upgrade paths', async () => {
        const callback = new WebSocket(
          url.replace('http:', 'ws:') + '/imports/api2/auth-callback/token/' + 'x'.repeat(32),
          { headers: { Origin: canonical, Host: 'hostile.invalid' } }
        );
        callback.on('error', () => {});
        sockets.add(callback);
        await once(callback, 'open');
        callback.close();
        await once(callback, 'close');
        await refused(ws(url, 'unknown', canonical), 403);
        await refused(ws(url, 'unknown', 'https://hostile.invalid'), 403);
        const unknown = new WebSocket(new URL(url).origin.replace('http:', 'ws:') + '/unknown-upgrade', {
          origin: canonical,
        });
        unknown.on('error', () => {});
        sockets.add(unknown);
        await assert.rejects(
          new Promise<void>((resolve, reject) => {
            unknown.once('open', resolve);
            unknown.once('error', reject);
          })
        );
      });
      it('preserves absolute-form upgrade handling with hostile authority and canonical Origin', async () => {
        const open = (suffix: string, origin: string) => {
          const client = new WebSocket(url.replace('http:', 'ws:') + '/imports' + suffix, {
            headers: { Origin: origin, Host: 'hostile.invalid', 'X-Forwarded-Host': 'hostile.invalid' },
            finishRequest(req) {
              req.path = 'http://hostile.invalid' + req.path;
              req.end();
            },
          });
          client.on('error', () => {});
          sockets.add(client);
          return client;
        };
        // The owner authorizes the parsed target and forwards the normalized path.
        const callback = open('/api2/auth-callback/token/' + 'x'.repeat(32), canonical);
        await once(callback, 'open');
        assert.equal(callback.readyState, WebSocket.OPEN);
        callback.close();
        await once(callback, 'close');
        await refused(open('/api2/auth-callback/token/' + 'x'.repeat(32), 'https://hostile.invalid'), 403);
        await refused(open('/api/unknown', canonical), 403);
      });
      it('drains a retained in-flight transfer with open sockets before graceful stop completes', async () => {
        await c.call('holdSink');
        const response = await wire(
          url + '/imports/url/get',
          'POST',
          { ...credentials, 'Content-Type': 'application/json' },
          JSON.stringify({
            url: upstream + '/source/small',
            protocol: 'tus',
            endpoint: upstream + '/sink',
            headers: { Authorization: 'Bearer destination-grant' },
          })
        );
        assert.equal(response.status, 200, response.body);
        const client = ws(url, JSON.parse(response.body).token);
        sockets.add(client);
        const completed = terminal(client);
        await once(client, 'open');
        await c.call('waitSink');
        const stopping = c.call('stop', 5000);
        await delay(80);
        const state = await c.call('state');
        assert(state.pools > 0);
        assert.equal(state.transfers, 1);
        assert.equal(client.readyState, WebSocket.OPEN);
        await c.call('releaseSink');
        assert.equal((await completed).action, 'success');
        if (!native) {
          client.close();
          await once(client, 'close');
        }
        const result = await stopping;
        const stopped = await c.call('state');
        assert.equal(result.error, null, JSON.stringify(stopped));
        assert.equal(stopped.pools, 0);
        assert.equal(stopped.stopped, true);
      });
    });
}
