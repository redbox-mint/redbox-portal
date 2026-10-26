import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io, type Socket } from 'socket.io-client';

const helper = readFileSync(resolve(__dirname, '../../../../assets/js/redbox-progress.js'), 'utf8');

describe('shipped progress client recovery', function () {
  this.timeout(8000);
  for (const failure of ['503', 'network', 'json', 'handshake'])
    it(`recovers from one ${failure} failure with a fresh grant`, async () => {
      let attempts = 0;
      const server = createServer((_req, res) => {
        attempts++;
        res.setHeader('Content-Type', 'application/json');
        if (attempts === 1 && failure === '503') {
          res.writeHead(503).end('{}');
          return;
        }
        if (attempts === 1 && failure === 'json') {
          res.end('{');
          return;
        }
        res.end(JSON.stringify({ data: { token: String(attempts) } }));
      });
      const sockets = new Server(server, { path: '/progress' });
      sockets.use((socket, next) => {
        if (failure === 'handshake' && socket.handshake.auth.token === '1') next(Error('temporary denial'));
        else next();
      });
      sockets.on('connection', socket => socket.on('subscribe', (room, ack) => ack?.({ room })));
      await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
      const address = server.address();
      assert(address && typeof address !== 'string');
      const origin = `http://127.0.0.1:${address.port}`;
      const window: Record<string, any> = {};
      let client: Socket | undefined;
      runInNewContext(helper, {
        window,
        setTimeout,
        clearTimeout,
        fetch: async (...args: Parameters<typeof fetch>) => {
          if (failure === 'network' && attempts++ === 0) throw Error('temporary network failure');
          return fetch(...args);
        },
      });
      const progress = window.createRedboxProgress({
        io: (...args: Parameters<typeof io>) => (client = io(...args)),
        endpoint: { origin, path: '/progress' },
        tokenUrl: origin + '/token',
        csrfToken: () => 'csrf',
        onProgress: () => {},
      });
      try {
        await new Promise<void>((done, reject) => {
          const timeout = setTimeout(() => reject(Error('progress did not recover')), 5000);
          client!.once('connect', () => {
            clearTimeout(timeout);
            done();
          });
        });
        assert(attempts >= 2);
        assert.deepEqual(await client!.timeout(2000).emitWithAck('subscribe', 'record'), { room: 'record' });
      } finally {
        progress.close();
        await new Promise<void>(done => sockets.close(() => done()));
      }
    });

  it('keeps close terminal while token acquisition is pending', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<Response>();
    let callbacks = 0;
    // Capture the actual async auth callback while retaining the public close operation.
    const socket = { io: { on() {} }, on() {}, connect() {}, disconnect() {}, emit() {} };
    const window: Record<string, any> = {};
    runInNewContext(helper, {
      window,
      setTimeout,
      clearTimeout,
      fetch: () => {
        entered.resolve();
        return release.promise;
      },
    });
    let auth: (callback: () => void) => Promise<void> = async () => {};
    const progress = window.createRedboxProgress({
      io: (_origin: string, options: { auth: typeof auth }) => {
        auth = options.auth;
        return socket;
      },
      endpoint: { origin: 'http://localhost', path: '/progress' },
      tokenUrl: '/token',
      csrfToken: () => 'csrf',
      onProgress: () => {},
    });
    const authenticating = auth(() => {
      callbacks++;
    });
    await entered.promise;
    progress.close();
    release.resolve(new Response(JSON.stringify({ data: { token: 'late-token' } })));
    await authenticating;
    assert.equal(callbacks, 0);
  });
});


describe('progress client connection generations', function () {
  this.timeout(10000);
  for (const result of ['token', '401', '503', 'json'] as const)
    it(`ignores an older ${result} grant response after transport reconnect`, async () => {
      const server = createServer();
      const sockets = new Server(server, { path: '/progress' });
      sockets.on('connection', socket => socket.on('subscribe', (_room, ack) => ack?.({ status: true })));
      await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
      const address = server.address();
      assert(address && typeof address !== 'string');
      const origin = `http://127.0.0.1:${address.port}`;
      const first = Promise.withResolvers<Response>();
      const entered = Promise.withResolvers<void>();
      let requests = 0;
      let client!: Socket;
      const window: Record<string, any> = {};
      runInNewContext(helper, { window, setTimeout, clearTimeout, fetch: () => {
        if (++requests === 1) { entered.resolve(); return first.promise; }
        return Promise.resolve(new Response(JSON.stringify({ data: { token: String(requests) } })));
      }});
      const progress = window.createRedboxProgress({
        io: (...args: Parameters<typeof io>) => (client = io(...args)),
        endpoint: { origin, path: '/progress' }, tokenUrl: '/token',
        csrfToken: () => 'csrf', onProgress() {},
      });
      try {
        await entered.promise;
        const connected = new Promise<void>(done => client.once('connect', done));
        client.io.engine.close();
        await connected;
        assert.equal(requests, 2);
        const id = client.id;
        first.resolve(new Response(result === 'json' ? '{' : JSON.stringify({ data: { token: 'old' } }),
          { status: result === '401' ? 401 : result === '503' ? 503 : 200 }));
        // Wait beyond the helper's retry delay to detect stale failure side effects.
        await new Promise(done => setTimeout(done, 1200));
        assert.equal(client.connected, true);
        assert.equal(client.id, id, 'an old grant result cannot replace the current namespace');
        assert.equal(requests, 2, 'an old result must not schedule another grant');
        assert.deepEqual(await client.timeout(2000).emitWithAck('subscribe', 'record'), { status: true });
      } finally {
        first.resolve(new Response('{}'));
        progress.close();
        await new Promise<void>(done => sockets.close(() => done()));
      }
    });
});

describe('progress client transition table', function () {
  this.timeout(10000);
  for (const scenario of ['initial-intent', 'cancel-initial-intent', 'reconnect', 'delivery', '401', '403', 'close-retry', 'close-json'] as const)
    it(scenario, async () => {
      const server = createServer();
      const sockets = new Server(server, { path: '/progress' });
      const memberships = new Set<string>();
      const tokens: unknown[] = [];
      const joined = Promise.withResolvers<void>();
      sockets.on('connection', socket => {
        tokens.push(socket.handshake.auth.token);
        memberships.clear();
        socket.on('subscribe', (room, ack) => { memberships.add(room); ack?.({ status: true }); joined.resolve(); });
        socket.on('unsubscribe', (room, ack) => { memberships.delete(room); ack?.({ status: true }); });
      });
      await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
      const address = server.address(); assert(address && typeof address !== 'string');
      const origin = `http://127.0.0.1:${address.port}`;
      const started = Promise.withResolvers<void>();
      const response = Promise.withResolvers<Response>();
      const json = Promise.withResolvers<{ data: { token: string } }>();
      let requests = 0;
      let client!: Socket;
      const window: Record<string, any> = {};
      const events: string[] = [];
      runInNewContext(helper, { window, setTimeout, clearTimeout, fetch: async () => {
        requests++; started.resolve();
        if (scenario === '401' || scenario === '403') return new Response('{}', { status: Number(scenario) });
        if (scenario === 'close-retry') return new Response('{}', { status: 503 });
        if (scenario === 'close-json') return { ok: true, status: 200, json: () => json.promise };
        if (requests === 1) return response.promise;
        return new Response(JSON.stringify({ data: { token: String(requests) } }));
      }});
      const progress = window.createRedboxProgress({
        io: (...args: Parameters<typeof io>) => (client = io(...args)),
        endpoint: { origin, path: '/progress' }, tokenUrl: '/token', csrfToken: () => 'csrf',
        onProgress: (event: string) => events.push(event),
      });
      const connected = new Promise<void>(done => client.once('connect', done));
      try {
        await started.promise;
        if (scenario === '401' || scenario === '403' || scenario.startsWith('close-')) {
          await new Promise<void>(done => setImmediate(done));
          if (scenario.startsWith('close-')) progress.close();
          json.resolve({ data: { token: 'late' } });
          await new Promise(done => setTimeout(done, 1200));
          assert.equal(client.connected, false); assert.equal(tokens.length, 0); assert.equal(requests, 1); return;
        }
        let accepted = 0;
        progress.subscribe('record', (result: { status: boolean }) => { assert.equal(result.status, true); accepted++; });
        if (scenario === 'cancel-initial-intent') progress.unsubscribe('record');
        response.resolve(new Response(JSON.stringify({ data: { token: '1' } })));
        await connected;
        await client.timeout(2000).emitWithAck('unsubscribe', 'wire-fence');
        assert.equal(memberships.has('record'), scenario !== 'cancel-initial-intent');
        if (scenario !== 'cancel-initial-intent') assert.equal(accepted, 1);
        if (scenario === 'reconnect') {
          const reconnected = new Promise<void>(done => client.once('connect', done));
          client.io.engine.close(); await reconnected;
          await client.timeout(2000).emitWithAck('unsubscribe', 'wire-fence');
          assert.equal(memberships.has('record'), true);
          assert.equal(requests, 2); assert.deepEqual(tokens, ['1', '2']);
          assert.equal(accepted, 1, 'the original acknowledgement is not replayed');
        }
        if (scenario === 'delivery') {
          const delivered = new Promise<void>(done => client.once('stop', () => done()));
          for (const event of ['start', 'update', 'stop']) sockets.emit(event, { id: 'progress' });
          await delivered; assert.deepEqual(events, ['start', 'update', 'stop']);
        }
        progress.unsubscribe('record'); await client.timeout(2000).emitWithAck('unsubscribe', 'wire-fence');
        assert.equal(memberships.has('record'), false);
      } finally {
        response.resolve(new Response('{}')); json.resolve({ data: { token: 'late' } });
        progress.close(); await new Promise<void>(done => sockets.close(() => done()));
      }
    });
});
