import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { of } from 'rxjs';
import WebSocket from 'ws';
import sinon from 'sinon';
import { io, type Socket } from 'socket.io-client';
import { recordWriteFixture } from './recordWriteFixture';
import { CompanionUploads, mountCompanionRoutes } from '../../src/http/express/companion';
import { ResumableUploads, mountResumableUploadRoutes } from '../../src/http/express/resumableUploads';
import { ProgressSockets } from '../../src/http/express/progressSockets';
import { registerPersistenceResource } from '../../src/persistence/runtime';
import { nothingLogger } from '@researchdatabox/sails-ng-common';

/** A single real provider per process, including across all cases in this suite. */
describe('owned Companion URL transfers alongside portal Socket.IO on real Mongo HTTP', function () {
  this.timeout(45000);
  let f: Awaited<ReturnType<typeof recordWriteFixture>>, companion: CompanionUploads, progress: ProgressSockets;
  let source: Server, realServer: Server, sourceUrl: string, oid: string;
  let companionUpgrade: ReturnType<Server['listeners']>[number];
  let brand = 'default';
  let directory: string;
  const clients = new Set<WebSocket>(),
    portalClients = new Set<Socket>();
  let holdPatch: Promise<void> | undefined,
    patchSeen: (() => void) | undefined,
    patches = 0;
  let rejectUpload = false;
  let releaseMeta: (() => void) | undefined, metaSeen: (() => void) | undefined;
  let releaseSlow: (() => void) | undefined;
  const data = Buffer.alloc(512 * 1024, 'x');
  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sr-companion-http-'));
    // Beyond-deadline remote I/O is process-owned. Keep its temporary directory
    // until those provider callbacks have settled naturally, then remove it.
    process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
    source = createServer(async (req, res) => {
      if (req.url === '/held') {
        metaSeen?.();
        await new Promise<void>(resolve => {
          releaseMeta = resolve;
        });
      }
      const bytes = req.url === '/large' ? data : Buffer.from('remote-bytes');
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': bytes.length });
      if (req.url === '/slow') {
        res.write(bytes.subarray(0, 6));
        await new Promise<void>(resolve => {
          releaseSlow = resolve;
        });
        res.end(bytes.subarray(6));
        return;
      }
      res.end(bytes);
    });
    source.listen(0, '127.0.0.1');
    await once(source, 'listening');
    const address = source.address();
    assert(address && typeof address !== 'string');
    sourceUrl = 'http://127.0.0.1:' + address.port;
    f = await recordWriteFixture(
      async (router, fixture, input) => {
        realServer = input.realtime.server;
        const address = realServer.address();
        assert(address && typeof address !== 'string');
        const origin = 'http://127.0.0.1:' + address.port;
        const tus = new ResumableUploads({
          disk: input.disks.stagingDisk(),
          records: input.writer,
          maxSize: 1024 * 1024,
          origins: ['http://127.0.0.1'],
          rootContext: '/portal',
          log: nothingLogger,
          authorizePending: async () => false,
          audit: (actor, action, context) => input.users.addUserAuditEvent(actor, action, context),
        });
        registerPersistenceResource(fixture.owner, 'companion-tus', tus);
        mountResumableUploadRoutes(router, {
          ...input,
          uploads: {
            handle: async (req, res) => {
              if (rejectUpload && req.method === 'POST') {
                res.status(401).end('private-native-companion-response');
                return;
              }
              if (req.method === 'PATCH' && holdPatch && ++patches === 2) {
                patchSeen?.();
                await holdPatch;
              }
              await tus.handle(req, res);
            },
          },
        });
        companion = new CompanionUploads({
          owner: fixture.owner,
          path: '/companion',
          origins: ['http://127.0.0.1'],
          isReady: () => fixture.application.status().ready,
          options: {
            secret: 'synthetic-companion-secret-at-least-32-characters',
            filePath: directory,
            metrics: false,
            providerOptions: {},
            enableUrlEndpoint: true,
            allowLocalUrls: true,
            streamingUpload: false,
            chunkSize: 64 * 1024,
            clientSocketConnectTimeout: 3000,
            uploadUrls: [origin + '/portal/default/rdmp/companion/record'],
            server: {
              host: address.address + ':' + address.port,
              protocol: 'http',
              path: '/companion',
              implicitPath: '/portal',
            },
          },
        });
        assert.equal(realServer.listenerCount('upgrade'), 0, 'Construction does not attach sockets');
        const environment = process.env.NODE_ENV;
        process.env.NODE_ENV = 'test'; // Provider cleanup cron is exercised separately in a production child.
        try {
          await companion.initialize(realServer);
        } finally {
          if (environment === undefined) delete process.env.NODE_ENV;
          else process.env.NODE_ENV = environment;
        }
        await companion.initialize(realServer);
        assert.equal(realServer.listenerCount('upgrade'), 1, 'Companion attaches once');
        companionUpgrade = realServer.listeners('upgrade')[0]!;
        mountCompanionRoutes(router, {
          ...input,
          uploads: companion,
          path: '/companion',
          context: () => ({ branding: brand, portal: 'rdmp' }),
          audit: (actor, action, context) => input.users.addUserAuditEvent(actor, action, context),
        });
        progress = new ProgressSockets({
          owner: fixture.owner,
          path: '/portal/progress/socket.io',
          origins: ['http://127.0.0.1'],
          records: input.writer,
          progress: { get: () => of([]) },
          authenticate: input.realtime.authenticateCredential,
        });
        registerPersistenceResource(fixture.owner, 'companion-progress', progress);
        progress.attach(realServer);
        assert.equal(realServer.listenerCount('upgrade'), 2, 'One filtered forwarder plus one portal owner');
        assert.throws(() => progress.attach(realServer), /already attached/);
      },
      { parserExclusions: ['/companion'] }
    );
    const result = await fetch(f.url + '/default/rdmp/api/records/metadata/dataRecord', {
      method: 'POST',
      headers: { ...f.headers, 'Content-Type': 'application/json', 'X-ReDBox-Api-Version': '2.0' },
      body: JSON.stringify({ metadata: { title: 'Companion' } }),
    });
    assert.equal(result.status, 201, await result.clone().text());
    oid = (await result.json()).data.oid;
    await f.identities.create('pathrule', {
      path: '/companion(/*)',
      role: f.role.id,
      branding: f.brand.id,
      can_update: true,
    });
    await f.pathRules.loadRules();
  });
  after(async () => {
    releaseMeta?.();
    releaseSlow?.();
    for (const client of clients) client.terminate();
    for (const client of portalClients) client.disconnect();
    await f?.close();
    if (source) await new Promise<void>(resolve => source.close(() => resolve()));
  });
  const endpoint = () => f.url + '/default/rdmp/companion/record/' + oid + '/attach';
  async function post(path: string, body: unknown, headers: Record<string, string> = f.headers) {
    return fetch(f.url + '/companion' + path, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  function transferBody(extra: Record<string, unknown> = {}) {
    return {
      url: sourceUrl + '/small',
      protocol: 'tus',
      endpoint: endpoint(),
      headers: f.headers,
      metadata: { name: 'remote.txt' },
      ...extra,
    };
  }
  async function connect(token: string, origin = 'http://127.0.0.1') {
    const client = new WebSocket(f.url.replace('http:', 'ws:') + '/companion/api/' + token, { origin });
    clients.add(client);
    client.on('error', () => {});
    await once(client, 'open');
    return client;
  }
  function terminal(client: WebSocket) {
    return new Promise<{ action: string; payload: { url: string } }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Companion terminal event timed out')), 10000);
      const message = (bytes: WebSocket.RawData) => {
        const event = JSON.parse(bytes.toString());
        if (['success', 'error'].includes(event.action)) {
          clearTimeout(timer);
          client.off('message', message);
          resolve(event);
        }
      };
      client.on('message', message);
    });
  }
  async function start(body = transferBody()) {
    const result = await post('/url/get', body);
    assert.equal(result.status, 200, await result.clone().text());
    return (await result.json()).token as string;
  }
  it('never logs credentials, transfer grants or raw provider responses when a real tus transfer fails', async () => {
    const output = sinon.spy(console, 'log');
    rejectUpload = true;
    try {
      const grant = await start();
      const socket = await connect(grant);
      assert.equal((await terminal(socket)).action, 'error');
      await delay(20);
      const logs = JSON.stringify(output.getCalls().map(call => call.args));
      assert(!logs.includes('pilot-api-token'), 'Bearer credentials must not enter native logs');
      assert(
        !logs.includes('private-native-companion-response'),
        'Provider response bodies must not enter native logs'
      );
      assert(!logs.includes(grant), 'Transfer grants must not enter native logs');
      assert(logs.includes('Companion provider'), 'The native logging boundary must be exercised');
    } finally {
      rejectUpload = false;
      output.restore();
    }
  });

  it('enforces actor brand role CSRF and destination/input gates before remote mutation', async () => {
    assert.equal((await post('/url/meta', { url: sourceUrl + '/small' }, {})).status, 401);
    brand = 'other';
    try {
      assert.equal((await post('/url/meta', { url: sourceUrl + '/small' })).status, 403);
    } finally {
      brand = 'default';
    }
    await f.identities.update('user', { id: f.user.id }, { roles: [f.reader.id] });
    try {
      assert.equal((await post('/url/meta', { url: sourceUrl + '/small' })).status, 403);
    } finally {
      await f.identities.update('user', { id: f.user.id }, { roles: [f.role.id] });
    }
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const missingOrInvalid: Record<string, string>[] = [
      { Cookie: cookie },
      { Cookie: cookie, 'X-CSRF-Token': 'invalid' },
    ];
    for (const headers of missingOrInvalid)
      assert.equal((await post('/url/meta', { url: sourceUrl + '/small' }, headers)).status, 403);
    const csrf = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie } });
    const token = (await csrf.json())._csrf;
    const valid = await post('/url/meta', { url: sourceUrl + '/small' }, { Cookie: cookie, 'X-CSRF-Token': token });
    assert.equal(valid.status, 200, await valid.clone().text());
    assert.equal((await post('/url/get', transferBody({ url: {} }))).status, 400);
    assert.equal((await post('/url/get', transferBody({ endpoint: 'http://evil.invalid/upload' }))).status, 400);
    assert(await f.native.db().collection('useraudit').countDocuments({ action: 'companion-request' }));
  });
  it('moves real URL bytes through the protected tus callback and preserves canonical proxy paths', async () => {
    const client = await connect(await start());
    const event = await terminal(client);
    assert.equal(event.action, 'success', JSON.stringify(event));
    const location = new URL(event.payload.url);
    assert.equal(location.origin, new URL(f.url).origin);
    assert.match(location.pathname, /^\/portal\/default\/rdmp\/companion\/record\/.+\/attach\/[a-f0-9]{32}$/);
    assert.equal(await f.disks.stagingDisk().get(location.pathname.split('/').pop()!), 'remote-bytes');
    client.close();
    await once(client, 'close');
    const meta = await post(
      '/url/meta',
      { url: sourceUrl + '/small' },
      { ...f.headers, 'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-Proto': 'https' }
    );
    assert.equal(meta.status, 200);
    assert(!JSON.stringify(await meta.json()).includes('attacker.invalid'));
  });
  it('denies another brand or user record through the actual transfer, without accepting callback secrets', async () => {
    const original = await f.storage.getMeta(oid);
    for (const change of [
      { 'metaMetadata.brandId': f.otherBrand.id },
      { 'authorization.edit': ['someone-else'], 'authorization.editRoles': [] },
    ]) {
      await f.native.db().collection('record').updateOne({ redboxOid: oid }, { $set: change });
      try {
        const client = await connect(
          await start(transferBody({ headers: { ...f.headers, 'X-Companion-Secret': 'untrusted' } }))
        );
        assert.equal((await terminal(client)).action, 'error');
        client.close();
        await once(client, 'close');
      } finally {
        await f.native
          .db()
          .collection('record')
          .updateOne(
            { redboxOid: oid },
            { $set: { metaMetadata: original.metaMetadata, authorization: original.authorization } }
          );
      }
    }
  });
  it('reconnects with the same transfer token, pauses and resumes stored tus offsets while portal sockets remain independent', async () => {
    let release!: () => void;
    holdPatch = new Promise<void>(resolve => {
      release = resolve;
    });
    const held = new Promise<void>(resolve => {
      patchSeen = resolve;
    });
    patches = 0;
    let rejectUpload = false;
    const actor = await f.identity.bearer('pilot-api-token');
    assert(actor);
    const grant = progress.issue({ authorization: f.headers.Authorization }, f.brand, actor);
    const portal = io(new URL(f.url).origin, {
      path: '/portal/progress/socket.io',
      transports: ['websocket'],
      reconnection: false,
      auth: { token: grant },
      extraHeaders: { Origin: 'http://127.0.0.1' },
    });
    portalClients.add(portal);
    await new Promise<void>((resolve, reject) => {
      portal.once('connect', resolve);
      portal.once('connect_error', reject);
    });
    assert.equal((await portal.timeout(3000).emitWithAck('subscribe', oid)).status, true);
    const token = await start(transferBody({ url: sourceUrl + '/large' }));
    let client = await connect(token);
    try {
      await held;
      // Engine.IO's unrelated-upgrade timeout must not close Companion's ws.
      await delay(1200);
      assert.equal(client.readyState, WebSocket.OPEN);
      assert.equal(portal.connected, true);
      await new Promise<void>((resolve, reject) =>
        client.send(JSON.stringify({ action: 'pause', payload: {} }), error => (error ? reject(error) : resolve()))
      );
      await delay(100);
      client.close();
      await once(client, 'close');
      client = await connect(token);
      const finished = terminal(client);
      release();
      holdPatch = undefined;
      client.send(JSON.stringify({ action: 'resume', payload: {} }));
      const event = await finished;
      assert.equal(event.action, 'success', JSON.stringify(event));
      const bytes = await f.disks.stagingDisk().get(new URL(event.payload.url).pathname.split('/').pop()!);
      assert.equal(Buffer.byteLength(bytes), data.length);
      const received = new Promise<Record<string, unknown>>(resolve => portal.once('update', resolve));
      await progress.emit('update', {
        relatedRecordId: oid,
        branding: f.brand.id,
        message: 'portal survives Companion reconnect',
      });
      assert.equal((await received).message, 'portal survives Companion reconnect');
      assert.equal(realServer.listenerCount('upgrade'), 2);
    } finally {
      release();
      holdPatch = undefined;
      client.close();
      portal.disconnect();
    }
  });
  it('refuses unknown tokens and origins and drains admitted HTTP before terminating a remaining websocket at the stop deadline', async () => {
    await assert.rejects(connect('unknown'));
    // A valid token is necessary but cannot bypass the canonical Origin gate.
    const token = await start();
    await assert.rejects(connect(token, 'https://foreign.invalid'));
    const client = await connect(token);
    assert.equal((await terminal(client)).action, 'success');
    const unfinished = await start(transferBody({ url: sourceUrl + '/slow' }));
    const slowClient = await connect(unfinished);
    // The server can emit first progress in the same turn as the handshake;
    // the source body remains held regardless of when that notification arrives.
    assert.equal(slowClient.readyState, WebSocket.OPEN);
    const held = new Promise<void>(resolve => {
      metaSeen = resolve;
    });
    const request = post('/url/meta', { url: sourceUrl + '/held' });
    await held;
    companion.quiesce();
    assert.equal((await post('/url/meta', { url: sourceUrl + '/small' })).status, 503);
    await assert.rejects(connect(unfinished));
    const startAt = Date.now();
    const stopped = f.host.stop({ deadlineMs: 800 }).then(
      () => undefined,
      error => error
    );
    let closed = false;
    const terminated = once(client, 'close').then(() => {
      closed = true;
    });
    const remoteTerminated = once(slowClient, 'close');
    await delay(100);
    assert.equal(closed, false, 'Admitted sockets remain during drain');
    releaseMeta!();
    assert.equal((await request).status, 200, 'Admitted request finishes during drain');
    assert.equal(closed, false);
    await terminated;
    await remoteTerminated;
    assert(Date.now() - startAt >= 700, 'Remaining connection is retained until the deadline');
    const error = await stopped;
    if (error) assert.match(error.message, /deadline/);
    releaseSlow!(); // Provider-internal remote I/O is explicitly limited to process lifetime beyond the deadline.
    await f.host.stop({ deadlineMs: 5000 }); // Deadline races retain ordinary persistence cleanup for retry.
    assert.equal(f.host.status().stopped, true);
    assert(!realServer.listeners('upgrade').includes(companionUpgrade), 'Companion forwarder detaches');
    assert.equal(realServer.listening, false);
    assert.throws(
      () => progress.issue({}, f.brand, { id: f.user.id, username: f.user.username, roles: [] }),
      /draining/
    );
  });
});
