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
    const socket = { on() {}, connect() {}, disconnect() {}, emit() {} };
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
