import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import { of } from 'rxjs';
import { ProgressSockets } from '../../src/http/express/progressSockets';
import { initializePersistence, cleanupPersistence } from '../../src/persistence/runtime';
import type { RecordModel } from '../../src/model/storage/RecordModel';

describe('progress socket handshake ownership', () => {
  it('keeps an unsubscribe ahead of an older pending join and preserves a later join', async () => {
    const owner = { config: {}, log: { warn() {} } };
    await initializePersistence(owner);
    const server = createServer();
    const actor = { id: 'user', username: 'user', roles: [{ id: 'role', brandId: 'brand' }] };
    const record = { redboxOid: 'record', metaMetadata: { brandId: 'brand' } } as RecordModel;
    const gates: Array<{
      entered: ReturnType<typeof Promise.withResolvers<void>>;
      release: ReturnType<typeof Promise.withResolvers<typeof actor>>;
    }> = [];
    const first = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<typeof actor>() };
    const later = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<typeof actor>() };
    const sockets = new ProgressSockets({
      owner,
      path: '/progress/socket.io',
      origins: ['http://127.0.0.1'],
      records: { getMeta: async () => record, hasViewAccess: () => true },
      progress: { get: () => of([]) },
      authenticate: async () => {
        const gate = gates.shift();
        if (!gate) return actor;
        gate.entered.resolve();
        return gate.release.promise;
      },
    });
    sockets.attach(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const client = io(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
      path: '/progress/socket.io',
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: 'http://127.0.0.1' },
      auth: { token: sockets.issue({ sessionId: 'session' }, { id: 'brand' }, actor) },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        client.once('connect', resolve);
        client.once('connect_error', reject);
      });
      gates.push(first);
      const pending = client.timeout(3000).emitWithAck('subscribe', 'record');
      void pending.catch(() => {});
      await first.entered.promise;
      assert.deepEqual(await client.timeout(3000).emitWithAck('unsubscribe', 'record'), { status: true });
      gates.push(later);
      const rejoined = client.timeout(3000).emitWithAck('subscribe', 'record');
      void rejoined.catch(() => {});
      await later.entered.promise;
      first.release.resolve(actor);
      assert.deepEqual(await pending, { status: false });
      const connection = [...Reflect.get(sockets, 'connections').values()][0];
      assert.equal(connection.rooms.has('record'), false);
      later.release.resolve(actor);
      assert.deepEqual(await rejoined, { status: true });
      const update = new Promise<{ message: string }>(resolve => client.once('update', resolve));
      await sockets.emit('update', { branding: 'brand', relatedRecordId: 'record', message: 'current join' });
      assert.equal((await update).message, 'current join');
      assert.deepEqual(await client.timeout(3000).emitWithAck('unsubscribe', 'record'), { status: true });
      assert.equal(connection.rooms.has('record'), false);
    } finally {
      first.release.resolve(actor);
      later.release.resolve(actor);
      client.disconnect();
      await sockets.close();
      await cleanupPersistence(owner);
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  it('retains no session binding when the client disconnects during authentication', async () => {
    const owner = { config: {}, log: { warn() {} } };
    await initializePersistence(owner);
    const server = createServer();
    const actor = { id: 'user', username: 'user', roles: [{ id: 'role', brandId: 'brand' }] };
    const authenticating = Promise.withResolvers<void>();
    const release = Promise.withResolvers<typeof actor>();
    const unused = () => {
      throw Error('No room work expected');
    };
    const sockets = new ProgressSockets({
      owner,
      path: '/progress/socket.io',
      origins: ['http://127.0.0.1'],
      records: { getMeta: unused, hasViewAccess: unused },
      progress: { get: unused },
      authenticate: () => {
        authenticating.resolve();
        return release.promise;
      },
    });
    sockets.attach(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const engine = Reflect.get(sockets, 'io').engine;
    const transportConnected = once(engine, 'connection');
    const client = io(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
      path: '/progress/socket.io',
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: 'http://127.0.0.1' },
      auth: { token: sockets.issue({ sessionId: 'session' }, { id: 'brand' }, actor) },
    });
    try {
      const [transport] = await transportConnected;
      await authenticating.promise;
      const closed = once(transport, 'close');
      client.disconnect();
      await closed;
      release.resolve(actor);
      await sockets.drain();
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(engine.clientsCount, 0);
      assert.equal(Reflect.get(sockets, 'io').of('/').sockets.size, 0);
      assert.equal(Reflect.get(sockets, 'connections').size, 0);
    } finally {
      release.resolve(actor);
      client.disconnect();
      await sockets.close();
      await cleanupPersistence(owner);
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
