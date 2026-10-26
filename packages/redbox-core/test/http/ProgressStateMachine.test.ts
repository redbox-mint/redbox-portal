import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { io, type Socket } from 'socket.io-client';
import { of } from 'rxjs';
import { ProgressSockets } from '../../src/http/express/progressSockets';
import { initializePersistence, cleanupPersistence, runAcceptedPersistenceWork } from '../../src/persistence/runtime';
import type { AuthenticatedActor } from '../../src/http/express/identity';
import type { RecordModel } from '../../src/model/storage/RecordModel';

const scenarios = [
  'connect', 'origin', 'missing-grant', 'expired-grant', 'one-use-grant', 'handshake-denial', 'handshake-error',
  'handshake-actor', 'handshake-brand', 'handshake-disconnect', 'handshake-quiesce',
  'subscribe', 'subscribe-denial', 'subscribe-error', 'subscribe-brand', 'subscribe-record', 'subscribe-malformed',
  'room-limit', 'pending-limit', 'duplicate-authorization', 'unsubscribe-pending', 'unsubscribe-resubscribe',
  'subscribe-disconnect', 'subscribe-quiesce', 'delivery', 'delivery-denial', 'delivery-brand',
  'delivery-unsubscribe', 'delivery-disconnect', 'disconnect-reconnect', 'grant-expiry-connected',
  'quiesce', 'accepted-completion', 'shutdown-pending', 'close',
] as const;

describe('progress server transition table', function () {
  this.timeout(8000);
  for (const scenario of scenarios) it(scenario, async () => {
    const owner = { config: {}, log: { warn() {} } };
    await initializePersistence(owner);
    const actor: AuthenticatedActor = { id: 'user', username: 'user', roles: [{ id: 'role', brandId: 'brand' }] };
    let authentication: () => Promise<AuthenticatedActor | false> = async () => actor;
    let view = true;
    let recordBrand = 'brand';
    const sockets = new ProgressSockets({ owner, path: '/progress', origins: ['http://allowed'],
      authenticate: () => authentication(),
      records: { getMeta: async redboxOid => ({ redboxOid, metaMetadata: { brandId: recordBrand } } as RecordModel), hasViewAccess: () => view },
      progress: { get: () => of([]) },
    });
    const server = createServer();
    sockets.attach(server);
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const clients: Socket[] = [];
    const grant = () => sockets.issue({ sessionId: 'session' }, { id: 'brand' }, actor);
    const connect = (token = grant(), requestOrigin = 'http://allowed') => {
      const client = io(origin, { path: '/progress', transports: ['websocket'], forceNew: true, reconnection: false,
        extraHeaders: { Origin: requestOrigin }, auth: { token } });
      clients.push(client);
      const ready = new Promise<void>((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
      void ready.catch(() => {});
      return { client, ready };
    };
    const ack = (client: Socket, event: string, room: unknown) => client.timeout(3000).emitWithAck(event, room);
    const state = () => [...Reflect.get(sockets, 'connections').values()][0];
    const gate = () => {
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<AuthenticatedActor | false>();
      authentication = () => { entered.resolve(); return release.promise; };
      return { entered, release };
    };
    let releaseGate: ReturnType<typeof gate> | undefined;
    try {
      if (['origin', 'missing-grant', 'expired-grant', 'one-use-grant', 'handshake-denial', 'handshake-error', 'handshake-actor', 'handshake-brand', 'handshake-disconnect', 'handshake-quiesce'].includes(scenario)) {
        const token = grant();
        if (scenario === 'expired-grant') Reflect.get(sockets, 'grants').get(token).expires = Date.now() - 1;
        if (scenario === 'handshake-denial') authentication = async () => false;
        if (scenario === 'handshake-error') authentication = async () => { throw Error('provider'); };
        if (scenario === 'handshake-actor') authentication = async () => ({ ...actor, id: 'other' });
        if (scenario === 'handshake-brand') authentication = async () => ({ ...actor, roles: [] });
        if (scenario === 'handshake-disconnect' || scenario === 'handshake-quiesce') releaseGate = gate();
        const { client, ready } = connect(scenario === 'missing-grant' ? 'missing' : token, scenario === 'origin' ? 'http://other' : 'http://allowed');
        if (releaseGate) {
          await releaseGate.entered.promise;
          if (scenario === 'handshake-disconnect') {
            const transport = Object.values(Reflect.get(sockets, 'io').engine.clients)[0] as any;
            const closed = once(transport, 'close'); client.disconnect(); await closed;
          } else sockets.quiesce();
          releaseGate.release.resolve(actor); await sockets.drain();
          await new Promise<void>(done => setImmediate(done));
          assert.equal(Reflect.get(sockets, 'connections').size, 0);
        } else if (scenario === 'one-use-grant') {
          await ready; await assert.rejects(connect(token).ready);
          assert.equal(Reflect.get(sockets, 'connections').size, 1);
        } else await assert.rejects(ready);
        return;
      }
      const { client, ready } = connect(); await ready;
      if (scenario === 'connect') { assert.equal(Reflect.get(sockets, 'connections').size, 1); return; }
      if (scenario === 'disconnect-reconnect') {
        const disconnected = once([...Reflect.get(sockets, 'connections').keys()][0], 'disconnect');
        client.disconnect(); await disconnected;
        assert.equal(Reflect.get(sockets, 'connections').size, 0);
        const next = connect(); await next.ready;
        assert.equal(state().rooms.size, 0);
        assert.deepEqual(await ack(next.client, 'subscribe', 'record'), { status: true }); return;
      }
      if (scenario === 'grant-expiry-connected') {
        state().grant.expires = Date.now() - 1;
        assert.deepEqual(await ack(client, 'subscribe', 'record'), { status: true }); return;
      }
      if (['subscribe-denial', 'subscribe-record'].includes(scenario)) { if (scenario === 'subscribe-denial') view = false; else recordBrand = 'other'; }
      if (scenario === 'subscribe-brand') authentication = async () => ({ ...actor, roles: [] });
      if (scenario === 'subscribe-error') authentication = async () => { throw Error('provider'); };
      if (scenario.startsWith('subscribe-') && ['subscribe-denial', 'subscribe-record', 'subscribe-brand', 'subscribe-error', 'subscribe-malformed'].includes(scenario)) {
        assert.deepEqual(await ack(client, 'subscribe', scenario === 'subscribe-malformed' ? {} : 'record'), { status: false });
        assert.equal(state().rooms.size, 0); assert.equal(state().subscriptions.size, 0); return;
      }
      if (scenario === 'room-limit' || scenario === 'pending-limit') {
        if (scenario === 'pending-limit') releaseGate = gate();
        const subscriptions = Array.from({ length: 100 }, (_, i) => ack(client, 'subscribe', `r${i}`));
        if (releaseGate) await releaseGate.entered.promise;
        else await Promise.all(subscriptions);
        assert.deepEqual(await ack(client, 'subscribe', 'overflow'), { status: false });
        releaseGate?.release.resolve(actor); await Promise.all(subscriptions); return;
      }
      if (['duplicate-authorization', 'unsubscribe-pending', 'unsubscribe-resubscribe', 'subscribe-disconnect', 'subscribe-quiesce', 'shutdown-pending'].includes(scenario)) {
        releaseGate = gate();
        const pending = ack(client, 'subscribe', 'record'); void pending.catch(() => {});
        await releaseGate.entered.promise;
        let second: Promise<any> | undefined;
        if (scenario === 'duplicate-authorization') second = ack(client, 'subscribe', 'record');
        if (scenario.startsWith('unsubscribe')) await ack(client, 'unsubscribe', 'record');
        if (scenario === 'unsubscribe-resubscribe') {
          authentication = async () => actor;
          assert.deepEqual(await ack(client, 'subscribe', 'record'), { status: true });
        }
        if (scenario === 'subscribe-disconnect') {
          const disconnected = once([...Reflect.get(sockets, 'connections').keys()][0], 'disconnect'); client.disconnect(); await disconnected;
        }
        if (scenario === 'subscribe-quiesce' || scenario === 'shutdown-pending') sockets.quiesce();
        let closed = false;
        const closing = scenario === 'shutdown-pending' ? sockets.close().then(() => { closed = true; }) : undefined;
        await new Promise<void>(done => setImmediate(done)); assert.equal(closed, false);
        releaseGate.release.resolve(actor);
        if (scenario !== 'subscribe-disconnect') assert.deepEqual(await pending, { status: scenario === 'duplicate-authorization' });
        if (second) assert.deepEqual(await second, { status: true });
        await sockets.drain(); await closing;
        if (scenario === 'subscribe-disconnect' || scenario === 'shutdown-pending') assert.equal(Reflect.get(sockets, 'connections').size, 0);
        else assert.equal(state().rooms.has('record'), scenario === 'duplicate-authorization' || scenario === 'unsubscribe-resubscribe');
        return;
      }
      assert.deepEqual(await ack(client, 'subscribe', 'record'), { status: true });
      if (scenario === 'subscribe') {
        assert.deepEqual(await ack(client, 'unsubscribe', 'record'), { status: true });
        assert.deepEqual(await ack(client, 'unsubscribe', 'record'), { status: true }); assert.equal(state().rooms.size, 0); return;
      }
      if (scenario === 'quiesce' || scenario === 'accepted-completion') {
        if (scenario === 'accepted-completion') {
          await runAcceptedPersistenceWork(owner, async () => { sockets.quiesce(); await sockets.emit('stop', { branding: 'brand', relatedRecordId: 'record' }); });
        } else sockets.quiesce();
        assert.throws(grant, /draining/);
        assert.deepEqual(await ack(client, 'subscribe', 'new'), { status: false });
        await assert.rejects(sockets.emit('update', {}), /draining/); return;
      }
      if (scenario === 'close') {
        await sockets.close(); await sockets.close(); assert.equal(server.listenerCount('upgrade'), 0);
        await assert.rejects(sockets.emit('stop', {}), /draining/); return;
      }
      const updates: unknown[] = []; client.on('update', value => updates.push(value));
      if (scenario === 'delivery-denial') view = false;
      if (scenario === 'delivery-unsubscribe' || scenario === 'delivery-disconnect') releaseGate = gate();
      const emitting = sockets.emit('update', { branding: scenario === 'delivery-brand' ? 'other' : 'brand', relatedRecordId: 'record' });
      if (releaseGate) {
        await releaseGate.entered.promise;
        if (scenario === 'delivery-unsubscribe') await ack(client, 'unsubscribe', 'record');
        else { const disconnected = once([...Reflect.get(sockets, 'connections').keys()][0], 'disconnect'); client.disconnect(); await disconnected; }
        releaseGate.release.resolve(actor);
      }
      await emitting;
      if (client.connected) await ack(client, 'unsubscribe', 'fence');
      assert.equal(updates.length, scenario === 'delivery' ? 1 : 0);
    } finally {
      releaseGate?.release.resolve(actor);
      for (const client of clients) client.disconnect();
      await sockets.close(); await cleanupPersistence(owner);
      if (server.listening) await new Promise<void>(done => server.close(() => done()));
    }
  });
});
