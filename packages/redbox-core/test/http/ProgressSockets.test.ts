import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import { ProgressSockets } from '../../src/http/express/progressSockets';
import { initializePersistence, cleanupPersistence } from '../../src/persistence/runtime';

describe('progress socket handshake ownership', () => {
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
