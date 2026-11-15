import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import WebSocket from 'ws';
import { installedPilot } from './installedPilot';
import { aafAssertion, availablePort } from './authenticationFixture';
import { oidcFixture } from './oidcFixture';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { assertResolvedPilotPins } from './pilotPins';

if (!process.env.HTTP_PILOT_TEST_MONGO_URL || !process.env.HTTP_READ_SOLR_PORT)
  throw new Error('FM-022 requires disposable Mongo /sr_p4_http and Solr; Q12 cannot be skipped.');

// This retained ownership assertion inspects the packed core's private adapter seam.
function companion(raw: import('../../../src/application/portal/rawHttp').PortalRawHttp) {
  const module = require(path.join(packedDirectory, 'node_modules/@researchdatabox/redbox-core/dist/application/portal/rawHttp')) as typeof import('../../../src/application/portal/rawHttp');
  return module.portalCompanion(raw);
}
let packedDirectory: string;

const canonical = 'https://portal.example.invalid';
const target = '/default/rdmp/api/records/metadata/fm019-record';
const upload = '/default/rdmp/api/records/datastreams/fm019-record';
const grant = '/default/rdmp/asynch/socket-token';
const headers = { Authorization: 'Bearer pilot-api-token', Origin: canonical, 'X-ReDBox-Api-Version': '2.0' };

describe('FM-022 Q12 integrated packed production pilot', function () {
  this.timeout(360000);
  let packed: Awaited<ReturnType<typeof installedPilot>>;
  let f: Awaited<ReturnType<typeof packed.nativeProductionFixture>>;
  let provider: Awaited<ReturnType<typeof oidcFixture>>;
  let source: Server, server: Server, upstream: string;
  let listens = 0,
    closes = 0,
    rawCloses = 0;
  let prepared = false,
    activationGated = false,
    failClose = false;
  let session: { cookie: string; csrf: string };
  let sourceHits = 0,
    holdSink = false;
  const remoteBytes = Buffer.from('FM-022 real Companion transfer');
  const files = new Map<string, Buffer>();
  const sinkRelease = Promise.withResolvers<void>();
  const sinkEntered = Promise.withResolvers<void>();
  const metaRelease = Promise.withResolvers<void>();
  const metaEntered = Promise.withResolvers<void>();
  const sockets = new Set<WebSocket>();
  const progress = new Set<Socket>();
  const cookie = (response: Response) => response.headers.get('set-cookie')!.split(';')[0];
  const post = (route: string, body: unknown, extra: Record<string, string> = headers) =>
    fetch(f.url + route, {
      method: 'POST',
      headers: { ...extra, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const pools = () =>
    require(
      path.join(packed.directory, 'node_modules/@researchdatabox/redbox-core/dist/persistence/runtime')
    ).persistenceStatus(f.owner).pools as number;
  async function login() {
    const initial = await fetch(f.url + '/csrfToken');
    assert.equal(initial.status, 200);
    const initialCookie = cookie(initial);
    const csrf = (await initial.json())._csrf;
    const response = await post(
      '/user/login_local',
      { username: 'pilot-admin', password: 'pilot-password' },
      { Cookie: initialCookie, Origin: canonical, 'X-CSRF-Token': csrf, 'X-Source': 'jsclient' }
    );
    assert.equal(response.status, 200, await response.clone().text());
    await response.text();
    const rotated = cookie(response);
    assert.notEqual(rotated, initialCookie);
    const fresh = await fetch(f.url + '/csrfToken', { headers: { Cookie: rotated } });
    assert.equal(fresh.status, 200);
    return { cookie: rotated, csrf: (await fresh.json())._csrf as string };
  }
  function companionSocket(token: string, origin = canonical) {
    const client = new WebSocket(f.url.replace('http:', 'ws:') + '/imports/api/' + token, { origin });
    client.on('error', () => {});
    sockets.add(client);
    return client;
  }
  async function transfer() {
    const response = await post('/imports/url/get', {
      url: upstream + '/source/small',
      protocol: 'tus',
      endpoint: upstream + '/sink',
      headers: { Authorization: 'Bearer destination-grant' },
      metadata: { name: 'fm022.txt' },
    });
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).token as string;
  }
  before(async () => {
    source = createServer(async (req, res) => {
      try {
        if (req.url!.startsWith('/source/')) {
          sourceHits++;
          if (req.url === '/source/held') {
            metaEntered.resolve();
            await metaRelease.promise;
          }
          res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': remoteBytes.length });
          res.end(remoteBytes);
          return;
        }
        assert.equal(req.headers.authorization, 'Bearer destination-grant');
        res.setHeader('Tus-Resumable', '1.0.0');
        const id = req.url!.split('/').pop()!;
        if (req.method === 'POST') {
          const next = String(files.size + 1);
          files.set(next, Buffer.alloc(0));
          res.writeHead(201, { Location: '/sink/' + next });
          res.end();
        } else if (req.method === 'HEAD') {
          res.writeHead(200, { 'Upload-Offset': files.get(id)!.length });
          res.end();
        } else if (req.method === 'PATCH') {
          if (holdSink) {
            sinkEntered.resolve();
            await sinkRelease.promise;
          }
          const chunks = [files.get(id)!];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const bytes = Buffer.concat(chunks);
          files.set(id, bytes);
          res.writeHead(204, { 'Upload-Offset': bytes.length });
          res.end();
        } else {
          res.writeHead(405);
          res.end();
        }
      } catch {
        res.writeHead(500);
        res.end();
      }
    });
    source.listen(0, '127.0.0.1');
    await once(source, 'listening');
    const address = source.address();
    assert(address && typeof address !== 'string');
    upstream = 'http://127.0.0.1:' + address.port;
    provider = await oidcFixture();
    const port = await availablePort();
    packed = await installedPilot({ integrated: true });
    console.log('FM022 packed SHA256 ' + JSON.stringify(packed.hashes));
    packedDirectory = packed.directory;
    f = await packed.nativeProductionFixture(packed.application, packed.module, {
      // The unbranded public probe selects its own mapping; API routes retain
      // their production mappings and host-owned contract validation.
      policyConfiguration: { ...portalHttpPolicies(), ProbeController: { read: true } },
      providerConfiguration: provider.config(port),
      server: { port },
      companion: {
        enabled: true,
        route: '/imports',
        secret: 'fm022-companion-secret-at-least-32-characters',
        filePath: path.join(packed.directory, 'companion'),
        metrics: false,
        server: { host: 'portal.example.invalid', protocol: 'https', path: '/imports' },
        enableUrlEndpoint: true,
        allowLocalUrls: true,
        streamingUpload: false,
        clientSocketConnectTimeout: 3000,
        uploadUrls: [upstream + '/sink'],
      },
      auth: {
        rules: [
          { path: '/:branding/:portal/api(/*)', role: 'Admin', can_update: true },
          { path: '/:branding/:portal/asynch(/*)', role: 'Admin', can_update: true },
          { path: '/imports(/*)', role: 'Admin', can_update: true },
        ],
      },
      raw: {
        async prepare(portal) {
          const raw = portal.installation.raw!;
          server = Reflect.get(raw.sockets, 'io').httpServer;
          assert.equal(server.listening, false);
          assert.equal(server.address(), null);
          assert(raw.upload && raw.progress && companion(raw));
          const listen = server.listen,
            close = server.close;
          server.listen = function (this: Server, ...args: Parameters<Server['listen']>) {
            listens++;
            return listen.apply(this, args);
          } as Server['listen'];
          server.close = function (...args) {
            closes++;
            return close.apply(this, args);
          };
          const closeRaw = raw.close.bind(raw);
          raw.close = async () => {
            rawCloses++;
            if (failClose) {
              failClose = false;
              throw new Error('FM022 controlled cleanup failure');
            }
            await closeRaw();
          };
          prepared = true;
        },
        async beforeActivate(host) {
          const base = 'http://127.0.0.1:' + host.address()!.port;
          for (const route of [
            target,
            upload,
            '/installed-probe',
            '/imports/health',
            '/portal-socket.io/socket.io.js',
          ]) {
            const response = await fetch(base + '/portal' + route);
            assert.equal(response.status, 503);
            await response.text();
          }
          const denied = new WebSocket(base.replace('http:', 'ws:') + '/portal/imports/api/untracked', {
            origin: canonical,
          });
          denied.on('error', () => {});
          const [, response] = await once(denied, 'unexpected-response');
          assert.equal(response.statusCode, 503);
          response.resume();
          denied.terminate();
          activationGated = true;
        },
      },
    });
  });
  after(async () => {
    sinkRelease.resolve();
    metaRelease.resolve();
    for (const client of sockets) client.terminate();
    for (const client of progress) client.disconnect();
    try {
      if (f) {
        await f.close();
        assert.equal(pools(), 0);
        assert.equal(server.listenerCount('upgrade'), 0);
      }
    } finally {
      if (source) await new Promise<void>(resolve => source.close(() => resolve()));
      await provider?.close();
      await packed?.close();
    }
  });
  it('Q12 composition prepares every integration before one listen and gates activation', () => {
    assertResolvedPilotPins(path.join(packed.directory, 'node_modules/@researchdatabox/redbox-core/package.json'));
    assert(prepared && activationGated);
    assert.equal(listens, 1);
    assert.strictEqual(f.nativePlan.resolved, f.portal.installation);
    assert.equal(
      f.portal.installation.controllerPlan.controllers.find(c => c.declaration.name === 'webservice/RecordController')!
        .provider,
      'fm019-api2-pilot'
    );
    assert.equal(
      Reflect.get(companion(f.portal.installation.raw!)!, 'bridge') instanceof require('node:http').Server,
      false
    );
  });
  it('Q12 session rotates, persists in native Mongo and authenticates a subclass read', async () => {
    session = await login();
    const response = await fetch(f.url + target, {
      headers: { Cookie: session.cookie, 'X-ReDBox-Api-Version': '2.0' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-institution'), 'Installed institution');
    assert.equal((await response.json()).data.title, 'Original');
    const rows = await f.native.db().collection('pilotSessions').find({}).toArray();
    assert(
      rows.some(
        row => String(row._id).startsWith('redbox-fastify-v1:') && JSON.parse(row.session).passport?.user === f.user.id
      )
    );
  });
  it('Q12 authenticated mutation preserves CSRF, origin, bearer precedence and persisted state', async () => {
    const read = await fetch(f.url + target, { headers });
    await read.text();
    for (const [extra, expected] of [
      [{ 'X-CSRF-Token': 'invalid' }, 403],
      [{ Origin: 'https://foreign.invalid' }, 403],
      [{ Authorization: 'Bearer invalid' }, 401],
      [{}, 200],
    ] as const) {
      const response = await fetch(f.url + target, {
        method: 'PUT',
        headers: Object.assign(
          {
            Cookie: session.cookie,
            Origin: canonical,
            'X-CSRF-Token': session.csrf,
            'If-Match': read.headers.get('etag')!,
            'X-ReDBox-Api-Version': '2.0',
            'Content-Type': 'application/json',
          },
          extra
        ),
        body: JSON.stringify({ title: 'Integrated mutation', retained: true }),
      });
      assert.equal(response.status, expected, await response.clone().text());
      await response.text();
    }
    assert.equal((await f.storage.getMeta('fm019-record')).metadata.title, 'Integrated mutation');
  });
  it('Q12 AAF verifies real assertions and rotates a persisted session in the combined production host', async () => {
    const initial = await fetch(f.url + '/csrfToken');
    const anonymous = cookie(initial);
    await initial.text();
    const payload = {
      sub: 'fm022-aaf',
      'https://aaf.edu.au/attributes': { mail: 'aaf@example.invalid', displayname: 'AAF Pilot' },
    };
    for (const valid of [false, true]) {
      const response = await fetch(f.url + '/user/login_aaf', {
        method: 'POST',
        redirect: 'manual',
        headers: { Cookie: anonymous, 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertion: aafAssertion(payload, valid ? undefined : 'invalid-key') }),
      });
      assert.equal(response.status, valid ? 302 : 403, await response.clone().text());
      await response.text();
      if (valid) {
        const active = cookie(response);
        assert.notEqual(active, anonymous);
        const info = await fetch(f.url + '/user/info', { headers: { Cookie: active } });
        assert.equal(info.status, 200);
        assert.equal((await info.json()).user.username, Buffer.from(payload.sub).toString('base64'));
        assert(await f.identities.one('user', { username: Buffer.from(payload.sub).toString('base64') }));
        const stale = await fetch(f.url + '/user/info', { headers: { Cookie: anonymous } });
        assert.equal(stale.status, 403);
        await stale.text();
      }
    }
  });
  it('Q12 OIDC completes real PKCE exchange and denies wrong state, replay and provider failure on the combined host', async () => {
    for (const mode of ['wrong-state', 'good', 'token-error']) {
      provider.setMode(mode);
      const begin = await fetch(f.url + '/user/begin_oidc', { redirect: 'manual' });
      assert.equal(begin.status, 302);
      const anonymous = cookie(begin);
      const authorize = begin.headers.get('location')!;
      await begin.text();
      const authorized = await fetch(authorize, { redirect: 'manual' });
      assert.equal(authorized.status, 302);
      const callback = new URL(authorized.headers.get('location')!);
      await authorized.text();
      if (mode === 'wrong-state') callback.searchParams.set('state', 'wrong');
      const response = await fetch(callback, { redirect: 'manual', headers: { Cookie: anonymous } });
      assert.equal(response.status, mode === 'good' ? 302 : 403, await response.clone().text());
      await response.text();
      if (mode === 'good') {
        const active = cookie(response);
        assert.notEqual(active, anonymous);
        const info = await fetch(f.url + '/user/info', { headers: { Cookie: active } });
        assert.equal(info.status, 200);
        assert.equal((await info.json()).user.username, 'allowed');
        const account = await f.identities.one('user', { username: 'allowed' });
        assert(account);
        assert.equal(account.type, 'oidc');
        assert.equal(account.email, 'allowed@example.invalid');
        const replay = await fetch(callback, { redirect: 'manual', headers: { Cookie: active } });
        assert.equal(replay.status, 403);
        await replay.text();
        const stale = await fetch(f.url + '/user/info', { headers: { Cookie: anonymous } });
        assert.equal(stale.status, 403);
        await stale.text();
      }
    }
    assert.equal(provider.calls.authorization, 3);
    assert.equal(provider.calls.token, 2);
    assert.equal(provider.calls.pkce, 2);
    assert.equal(provider.calls.userinfo, 1);
  });
  it('Q12 installed controller validation, hooks and fallback share the resolved security pipeline', async () => {
    for (const [title, expected] of [
      ['', 400],
      ['valid', 200],
    ] as const) {
      const response = await post(
        '/default/rdmp/institution/publish',
        { title },
        { Cookie: session.cookie, Origin: canonical, 'X-CSRF-Token': session.csrf }
      );
      assert.equal(response.status, expected, await response.clone().text());
      assert.equal(response.headers.get('x-pilot-guarded'), expected === 200 ? 'true' : null);
      await response.text();
    }
    assert.equal(await f.native.db().collection('institutionPublication').countDocuments(), 1);
    for (const route of ['/installed-probe', '/installed-fallback/missing']) {
      const response = await fetch(f.url + route);
      assert.equal(response.status, 200, route + ': ' + (await response.clone().text()));
      assert.equal(response.headers.get('x-installation-hook'), 'selected');
      assert.deepEqual(await response.json(), { reached: true });
    }
  });
  it('Q12 raw multipart passes through the installed subclass into real storage without consuming siblings', async () => {
    const read = await fetch(f.url + target, { headers });
    await read.text();
    const body = new FormData();
    body.append('before', 'first');
    body.append('attachmentFields', new Blob(['FM022 raw bytes'], { type: 'text/plain' }), 'pilot.txt');
    body.append('after', 'last');
    const response = await fetch(f.url + upload, {
      method: 'POST',
      headers: { ...headers, 'If-Match': read.headers.get('etag')! },
      body,
    });
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    const stored = await f.storage.getMeta('fm019-record');
    assert(stored.metadata);
    const runtime = require(
      path.join(packed.directory, 'node_modules/@researchdatabox/redbox-core/dist/persistence/runtime')
    );
    await runtime.runAcceptedPersistenceWork(f.owner, async () => {
      const stream = await f.datastream.getDatastream('fm019-record', result.data.message.fileIds[0].fileId, {
        username: 'pilot-admin',
      });
      const chunks: Buffer[] = [];
      for await (const chunk of stream.readstream as Readable) chunks.push(Buffer.from(chunk));
      assert.equal(Buffer.concat(chunks).toString(), 'FM022 raw bytes');
    });
    const staging = f.disks.getStagingDiskConfig();
    assert(staging.driver === 'fs');
    assert.deepEqual(await readdir(staging.config.root), []);
    const sibling = await post(
      '/default/rdmp/institution/publish',
      { title: 'After raw' },
      { Cookie: session.cookie, Origin: canonical, 'X-CSRF-Token': session.csrf }
    );
    assert.equal(sibling.status, 200);
    await sibling.text();
  });
  it('Q12 socket upgrades enforce origin and session grants on the same server', async () => {
    const response = await post(
      grant,
      {},
      { Cookie: session.cookie, Origin: canonical, 'X-CSRF-Token': session.csrf, 'X-ReDBox-Api-Version': '2.0' }
    );
    assert.equal(response.status, 200, await response.clone().text());
    const token = (await response.json()).data.token;
    for (const origin of ['https://foreign.invalid', canonical]) {
      const client = io(new URL(f.url).origin, {
        path: '/portal/portal-socket.io',
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
        extraHeaders: { Origin: origin },
        auth: { token },
      });
      progress.add(client);
      const connected = new Promise<void>((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });
      if (origin !== canonical) {
        await assert.rejects(connected);
        client.disconnect();
      } else {
        await connected;
        assert.deepEqual(await client.timeout(3000).emitWithAck('subscribe', 'fm019-record'), { status: true });
        client.disconnect();
      }
    }
    assert.equal(listens, 1);
  });
  it('Q12 Companion denies unauthenticated HTTP and untracked or foreign-origin upgrades', async () => {
    const hits = sourceHits;
    const denied = await post('/imports/url/meta', { url: upstream + '/source/small' }, {});
    assert.equal(denied.status, 401);
    await denied.text();
    assert.equal(sourceHits, hits);
    for (const [token, origin] of [
      ['__proto__', canonical],
      ['unknown', 'https://foreign.invalid'],
    ]) {
      const client = companionSocket(token, origin);
      const [, response] = await once(client, 'unexpected-response');
      assert.equal(response.statusCode, 403);
      response.resume();
      client.terminate();
    }
  });
  it('Q12 Companion tracks a real URL-to-TUS transfer and consumes its grant', async () => {
    const token = await transfer();
    const client = companionSocket(token);
    const done = new Promise<string>(resolve =>
      client.on('message', bytes => {
        const event = JSON.parse(String(bytes));
        if (['success', 'error'].includes(event.action)) resolve(event.action);
      })
    );
    await once(client, 'open');
    assert.equal(await done, 'success');
    assert([...files.values()].some(bytes => bytes.equals(remoteBytes)));
    client.close();
    await once(client, 'close');
    const stale = companionSocket(token);
    const [, response] = await once(stale, 'unexpected-response');
    assert.equal(response.statusCode, 403);
    response.resume();
    stale.terminate();
  });
  it('Q12 logout revokes the persisted session while integrations remain live', async () => {
    const response = await fetch(f.url + '/default/rdmp/user/logout', {
      method: 'POST',
      headers: { Cookie: session.cookie, Origin: canonical, 'X-CSRF-Token': session.csrf },
      redirect: 'manual',
    });
    assert.equal(response.status, 302);
    await response.text();
    const revoked = await fetch(f.url + target, { headers: { Cookie: session.cookie } });
    assert.equal(revoked.status, 401);
    await revoked.text();
    const health = await fetch(f.url + '/imports/health', { headers });
    assert.equal(health.status, 200);
    await health.text();
  });
  it('Q12 disconnect, stop deadline and cleanup failure retain dependencies until explicit retry', async () => {
    holdSink = true;
    const token = await transfer();
    const active = companionSocket(token);
    await once(active, 'open');
    await sinkEntered.promise;
    const req = request(f.url + '/imports/url/meta', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
    req.on('error', () => {});
    req.end(JSON.stringify({ url: upstream + '/source/held' }));
    await metaEntered.promise;
    req.destroy();
    await assert.rejects(f.host.stop({ deadlineMs: 50 }), /deadline|timed out/i);
    assert.equal(f.host.status().stopped, false);
    assert(pools() > 0);
    assert.equal(closes, 1);
    failClose = true;
    sinkRelease.resolve();
    metaRelease.resolve();
    await assert.rejects(f.host.stop({ deadlineMs: 30000 }), /Persistence resource close failed/);
    assert(pools() > 0);
    assert.equal(f.host.status().stopped, false);
    assert.equal(rawCloses, 1);
    await f.host.stop({ deadlineMs: 30000 });
    await f.host.stop();
    assert.equal(rawCloses, 2);
    assert.equal(closes, 1);
    assert.equal(pools(), 0);
    assert.equal(f.host.status().stopped, true);
    assert.equal(server.listenerCount('upgrade'), 0);
    console.log(
      'FM022 owned cleanup: one transport close, retried module close, zero pools/upgrades before test process exit'
    );
  });
});

describe('FM-022 production identity disconnect ownership', function () {
  this.timeout(360000);
  let packed: Awaited<ReturnType<typeof installedPilot>>;
  let provider: Awaited<ReturnType<typeof oidcFixture>>;
  before(async () => {
    // Companion has a process-lifetime stop guard. These identity-only instances
    // use the normal resolved installation with Companion/raw explicitly absent.
    packed = await installedPilot();
    provider = await oidcFixture();
  });
  after(async () => {
    await provider?.close();
    await packed?.close();
  });

  async function qualify(kind: 'local' | 'aaf' | 'oidc', boundary: 'session' | 'audit' | 'token', denied = false) {
    const port = await availablePort();
    provider.setMode(denied ? 'token-error' : 'good');
    const enteredToken = Promise.withResolvers<void>();
    const releaseToken = Promise.withResolvers<void>();
    provider.pauseToken(async () => {
      if (boundary !== 'token') return;
      enteredToken.resolve();
      await releaseToken.promise;
    });
    const f = await packed.nativeProductionFixture(packed.application, packed.module, {
      server: { port },
      providerConfiguration: provider.config(port),
      session: { mongoOptions: { appName: 'fm022-identity-session' } },
    });
    const runtime: typeof import('../../../src/persistence/runtime') = require(
      path.join(packed.directory, 'node_modules/@researchdatabox/redbox-core/dist/persistence/runtime')
    );
    const status = () => runtime.persistenceStatus(f.owner);
    const auditRows = () => f.native.db().collection('useraudit').find({ action: 'login' }).toArray();
    const sessionRows = () => f.native.db().collection('pilotSessions').find({}).toArray();
    const server: Server = Reflect.get(f.host, 'fastify').server;
    const close = server.close;
    let closes = 0;
    server.close = function (...args) {
      closes++;
      return close.apply(this, args);
    };
    const armWrite = async (session: boolean) => {
      const result = await f.native
        .db()
        .admin()
        .command({
          configureFailPoint: 'failCommand',
          mode: { times: 1 },
          data: {
            failCommands: session ? ['insert', 'update'] : ['insert'],
            ...(session ? { appName: 'fm022-identity-session' } : {}),
            blockConnection: true,
            blockTimeMS: 2000,
          },
        });
      return Number(result.count);
    };
    const armedAudit = Promise.withResolvers<number>();
    const audit = f.users.addUserAuditEvent;
    if (boundary === 'audit') {
      // Arm only at the production audit call, after AAF/OIDC account creation.
      // The unchanged Users method performs the real Mongo insert and security
      // event delivery; no fake persistence promise supplies the held work.
      f.users.addUserAuditEvent = async (...args) => {
        armedAudit.resolve(await armWrite(false));
        const result = await audit(...args);
        assert(result, 'a successful login must persist its audit');
        return result;
      };
    }
    let req: ReturnType<typeof request> | undefined;
    try {
      let url = f.url + '/user/login_' + kind;
      let body: string | undefined;
      const initial = await fetch(f.url + (kind === 'oidc' ? '/user/begin_oidc' : '/csrfToken'), {
        redirect: 'manual',
      });
      assert.equal(initial.status, kind === 'oidc' ? 302 : 200);
      const anonymous = initial.headers.get('set-cookie')!.split(';')[0];
      const rowsBefore = await sessionRows();
      const oldIds = rowsBefore.map(row => row._id);
      const requestHeaders: Record<string, string> = { Cookie: anonymous };
      if (kind === 'oidc') {
        const authorized = await fetch(initial.headers.get('location')!, { redirect: 'manual' });
        await initial.text();
        assert.equal(authorized.status, 302);
        url = authorized.headers.get('location')!;
        await authorized.text();
      } else {
        const csrf = (await initial.json())._csrf;
        requestHeaders['Content-Type'] = 'application/json';
        if (kind === 'local') {
          Object.assign(requestHeaders, { Origin: canonical, 'X-CSRF-Token': csrf, 'X-Source': 'jsclient' });
          body = JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' });
        } else {
          body = JSON.stringify({
            assertion: aafAssertion({
              sub: 'fm022-disconnected-aaf',
              'https://aaf.edu.au/attributes': { mail: 'aaf@example.invalid', displayname: 'AAF Disconnect' },
            }),
          });
        }
      }
      const sessionCount = boundary === 'session' ? await armWrite(true) : undefined;
      const poolCount = status().pools;
      const tokens = provider.calls.token;
      req = request(url, { method: kind === 'oidc' ? 'GET' : 'POST', agent: false, headers: requestHeaders });
      req.on('error', () => {});
      // A response before the held boundary would invalidate the disconnect proof.
      let responded = false;
      req.on('response', response => {
        responded = true;
        response.resume();
      });
      req.end(body);
      if (boundary === 'token') await enteredToken.promise;
      else {
        const count = boundary === 'session' ? sessionCount! : await armedAudit.promise;
        await f.native
          .db()
          .admin()
          .command({ waitForFailPoint: 'failCommand', timesEntered: count + 1, maxTimeMS: 5000 });
      }
      assert.equal(responded, false);
      assert.equal((await auditRows()).length, 0, 'the real audit insert has not completed');
      if (boundary === 'session') {
        assert(!(await sessionRows()).some(row => JSON.parse(row.session).passport?.user));
      }
      const disconnected = new Promise<void>(resolve => req!.once('close', resolve));
      req.destroy();
      await disconnected;
      await assert.rejects(f.host.stop({ deadlineMs: 25 }), /deadline|timed out|drain/i);
      assert.equal(f.host.status().stopped, false);
      assert.equal(status().pools, poolCount, 'pending identity work must retain every borrowed pool');
      assert.equal(closes, 1);
      assert.equal((await auditRows()).length, 0);
      releaseToken.resolve();
      // Retry waits for actual Mongo/provider settlement, including both session
      // writes and the persisted Users audit after the client has disconnected.
      await f.host.stop({ deadlineMs: 15000 });
      await f.host.stop();
      assert.equal(f.host.status().stopped, true);
      assert.equal(closes, 1);
      assert.equal(status().pools, 0);
      assert.equal(status().operations, 0);
      const audits = await auditRows();
      const rows = await sessionRows();
      const authenticated = rows.filter(row => JSON.parse(row.session).passport?.user);
      if (denied) {
        assert.deepEqual(audits, []);
        assert.deepEqual(authenticated, []);
      } else {
        assert.equal(audits.length, 1, 'exactly one persisted production login audit');
        assert.equal(authenticated.length, 1);
        const row = authenticated[0];
        const session = JSON.parse(row.session);
        assert(!oldIds.some(id => String(id) === String(row._id)), 'the anonymous credential must rotate');
        assert(!rows.some(row => oldIds.some(id => String(id) === String(row._id))), 'old credential is revoked');
        assert.equal(session.authenticationVersion, 6);
        assert.equal(session.branding, 'default');
        assert.equal(session.portal, 'rdmp');
        assert.equal(row.version, 1);
        assert.equal(audits[0].user.id, session.passport.user);
        assert.equal(audits[0].user.type, kind);
        assert.equal(JSON.parse(audits[0].additionalContext).brandId, f.brand.id);
      }
      if (kind === 'oidc') assert.equal(provider.calls.token, tokens + 1);
      console.log(
        `FM022 production ${kind}/${boundary}/${denied ? 'denied' : 'allowed'}: disconnected, deadline, retained ${poolCount} pools, retry, ${authenticated.length} session/${audits.length} audit, zero pools`
      );
    } finally {
      req?.destroy();
      releaseToken.resolve();
      f.users.addUserAuditEvent = audit;
      await f.native.db().admin().command({ configureFailPoint: 'failCommand', mode: 'off' });
      await f.close();
    }
  }

  for (const kind of ['local', 'aaf', 'oidc'] as const)
    for (const boundary of ['session', 'audit'] as const)
      it(`retains production ${kind} ${boundary} persistence after disconnect, deadline and stop retry`, () =>
        qualify(kind, boundary));
  for (const denied of [false, true])
    it(`retains production OIDC token exchange after disconnect, deadline and stop retry: ${denied ? 'denied' : 'allowed'}`, () =>
      qualify('oidc', 'token', denied));
});
