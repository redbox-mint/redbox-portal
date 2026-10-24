import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { io, type Socket } from 'socket.io-client';
import { setTimeout as delay } from 'node:timers/promises';
import { recordWriteFixture } from './recordWriteFixture';
import { ProgressSockets } from '../../src/http/express/progressSockets';
import { mountProgressOperationRoutes } from '../../src/http/express/progressOperations';
import { Services } from '../../src/progress/Asynchs';
import { initializeProgressPersistence, getProgressRepositories } from '../../src/persistence/progress/runtime';
import { ensureProgressPersistenceIndexes } from '../../src/persistence/progress/preflight';
import { registerPersistenceResource, runAcceptedPersistenceWork } from '../../src/persistence/runtime';
import { nothingLogger } from '@researchdatabox/sails-ng-common';

describe('direct owned progress sockets on real HTTP Mongo sessions', function () {
  this.timeout(45000);
  let f: Awaited<ReturnType<typeof recordWriteFixture>>, sockets: ProgressSockets, oid: string;
  const clients: Socket[] = [];
  let server: Server;
  let authorizationFailure = false;
  const otherUpgrade = () => {};
  before(async () => {
    f = await recordWriteFixture(async (router, fixture, input) => {
      await ensureProgressPersistenceIndexes(fixture.owner);
      await initializeProgressPersistence(fixture.owner);
      const progress = new Services.Asynchs(getProgressRepositories(fixture.owner).progress);
      sockets = new ProgressSockets({
        owner: fixture.owner,
        path: '/portal/progress/socket.io',
        origins: ['http://127.0.0.1'],
        records: input.writer,
        progress,
        authenticate: credential =>
          authorizationFailure
            ? Promise.reject(new Error('private authorization failure'))
            : input.realtime.authenticateCredential(credential),
      });
      registerPersistenceResource(fixture.owner, 'progress-sockets', sockets);
      server = input.realtime.server;
      server.on('upgrade', otherUpgrade);
      sockets.attach(server);
      assert.throws(() => sockets.attach(input.realtime.server), /already attached/);
      mountProgressOperationRoutes(router, {
        ...input,
        records: input.writer,
        progress,
        sockets,
        log: nothingLogger,
        audit: (actor, action, context) => input.users.addUserAuditEvent(actor, action, context),
      });
    });
    const created = await request('POST', '/api/records/metadata/dataRecord', { metadata: { title: 'Progress' } });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    oid = created.body.data.oid;
  });
  after(async () => {
    for (const client of clients) client.disconnect();
    await f?.close();
  });
  async function request(method: string, path: string, body?: unknown, headers: Record<string, string> = f.headers) {
    const response = await fetch(f.url + '/default/rdmp' + path, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json', 'X-ReDBox-Api-Version': '2.0' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, body: await response.json() };
  }
  async function connect(token: string, origin = 'http://127.0.0.1') {
    const client = io(new URL(f.url).origin, {
      path: '/portal/progress/socket.io',
      transports: ['websocket'],
      reconnection: false,
      auth: { token },
      extraHeaders: { Origin: origin },
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  }
  async function grant(headers: Record<string, string> = f.headers) {
    const result = await request('POST', '/asynch/socket-token', {}, headers);
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    return result.body.data.token;
  }
  it('requires a single-use authenticated grant, trusted origin and persisted record ACL for joins', async () => {
    await assert.rejects(connect('missing'));
    await assert.rejects(connect(await grant(), 'https://foreign.test'));
    const token = await grant(),
      client = await connect(token);
    await assert.rejects(connect(token));
    assert.equal((await client.timeout(3000).emitWithAck('subscribe', oid)).status, true);
    assert.equal((await client.timeout(3000).emitWithAck('subscribe', 'foreign-record')).status, false);
    assert.equal((await client.timeout(3000).emitWithAck('subscribe', oid + '-invented-task')).status, false);
    authorizationFailure = true;
    try {
      assert.deepEqual(await client.timeout(3000).emitWithAck('subscribe', oid), { status: false });
    } finally {
      authorizationFailure = false;
    }
    client.disconnect();
  });
  it('persists progress, emits completion, rechecks revocation and reconnects with a fresh grant', async () => {
    const client = await connect(await grant());
    assert.equal((await client.timeout(3000).emitWithAck('subscribe', oid)).status, true);
    const received = new Promise<Record<string, unknown>>(resolve => client.once('start', resolve));
    const started = await request('POST', '/asynch', {
      name: 'Export',
      relatedRecordId: oid,
      taskType: 'pdf',
      currentIdx: 0,
      targetIdx: 1,
    });
    assert.equal(started.response.status, 200, JSON.stringify(started.body));
    assert.equal((await received).id, started.body.data.id);
    assert.equal((await client.timeout(3000).emitWithAck('subscribe', oid + '-pdf')).status, true);
    const record = await f.storage.getMeta(oid);
    await f.native
      .db()
      .collection('record')
      .updateOne(
        { redboxOid: oid },
        { $set: { authorization: { view: ['someone-else'], edit: ['someone-else'], viewRoles: [], editRoles: [] } } }
      );
    let leaked = false;
    client.once('update', () => {
      leaked = true;
    });
    await sockets.emit('update', { ...started.body.data, message: 'private' });
    await delay(50);
    assert.equal(leaked, false);
    assert.equal((await client.timeout(3000).emitWithAck('subscribe', oid)).status, false);
    await f.native
      .db()
      .collection('record')
      .updateOne({ redboxOid: oid }, { $set: { authorization: record.authorization } });
    client.disconnect();
    const reconnected = await connect(await grant());
    assert.equal((await reconnected.timeout(3000).emitWithAck('subscribe', started.body.data.id)).status, true);
    const completed = new Promise(resolve => reconnected.once('stop', resolve));
    assert.equal((await request('DELETE', '/asynch', { id: started.body.data.id })).response.status, 200);
    await completed;
    assert.equal(
      await f.native.db().collection('asynchprogress').countDocuments({ status: 'finished', relatedRecordId: oid }),
      1
    );
  });
  it('checks browser CSRF and authoritative session invalidation for later subscriptions', async () => {
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    assert.equal((await request('POST', '/asynch/socket-token', {}, { Cookie: cookie })).response.status, 403);
    const token = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie } });
    const headers = { Cookie: cookie, 'X-CSRF-Token': (await token.json())._csrf };
    const client = await connect(await grant(headers));
    assert.equal((await client.timeout(3000).emitWithAck('subscribe', oid)).status, true);
    await f.identities.update('user', { id: f.user.id }, { loginDisabled: true });
    assert.equal((await client.timeout(3000).emitWithAck('subscribe', oid)).status, false);
    await f.identities.update('user', { id: f.user.id }, { loginDisabled: false });
  });
  it('denies malformed/unauthenticated mutations and drains admitted emission', async () => {
    assert(
      [401, 403].includes((await request('POST', '/asynch', { name: 'Bad', relatedRecordId: oid }, {})).response.status)
    );
    assert.equal(
      (await request('POST', '/asynch', { name: 'Bad', relatedRecordId: oid, currentIdx: -1 })).response.status,
      400
    );
    assert.equal((await request('GET', '/asynch/subscribe/' + oid)).response.status, 410);
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const work = runAcceptedPersistenceWork(f.owner, async () => {
      await gate;
      await sockets.emit('update', { branding: f.brand.id, relatedRecordId: oid });
    });
    sockets.quiesce();
    assert.throws(() => sockets.issue({}, f.brand, f.user as never), /draining/);
    await assert.rejects(sockets.emit('update', { branding: f.brand.id, relatedRecordId: oid }), /draining/);
    release();
    await work;
    await sockets.drain();
    await sockets.close();
    assert.deepEqual(server.listeners('upgrade'), [otherUpgrade]);
    server.off('upgrade', otherUpgrade);
  });
});
