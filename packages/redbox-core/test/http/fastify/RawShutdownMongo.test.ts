import assert from 'node:assert/strict';
import { request } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { rawSocketFixture, canonical, socketPath } from './rawSocketFixture';
import { assertOwnedHttpClosed } from './ownedCleanup';

if (!process.env.HTTP_PILOT_TEST_MONGO_URL || !process.env.HTTP_READ_SOLR_PORT)
  throw new Error('Disposable Mongo and Solr required for G5.');

/** Every case uses the production installation and its actual raw owners. */
describe('FM-036 production raw shutdown matrix', function () {
  this.timeout(60000);
  for (const transport of ['websocket', 'polling'] as const)
    it(`closes an open Engine.IO ${transport} transport and refuses new connections`, async () => {
      const f = await rawSocketFixture(true);
      const endpoint = new URL(f.url).origin + socketPath + '/?EIO=4&transport=' + transport;
      let ws: WebSocket | undefined;
      try {
        let done: Promise<unknown>;
        if (transport === 'websocket') {
          ws = new WebSocket(endpoint.replace('http:', 'ws:'), { origin: canonical });
          await once(ws, 'open');
          done = once(ws, 'close');
        } else {
          const initial = await fetch(endpoint, { headers: { Origin: canonical } });
          assert.equal(initial.status, 200);
          const open = await initial.text();
          assert.equal(open[0], '0');
          const sid = JSON.parse(open.slice(1)).sid;
          const entered = Promise.withResolvers<void>();
          done = new Promise<void>((resolve, reject) => {
            const req = request(endpoint + '&sid=' + sid, { headers: { Origin: canonical } }, res => {
              res.resume();
              res.once('end', resolve);
              res.once('aborted', resolve);
            });
            req.once('finish', entered.resolve);
            req.once('error', error => {
              if (['ECONNRESET', 'ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code!)) resolve();
              else reject(error);
            });
            req.end();
          });
          await entered.promise;
          await delay(30);
        }
        const first = f.host.stop();
        assert.equal(f.host.stop(), first, 'Concurrent stops join the same attempt');
        assert.equal(f.host.status().ready, false);
        await first;
        await done;
        await assert.rejects(fetch(endpoint, { headers: { Origin: canonical } }));
        await f.host.stop();
        assert.equal(f.closeCalls(), 1);
        await assertOwnedHttpClosed(f.host, f.owner, f.server);
      } finally {
        ws?.terminate();
        await f.close();
      }
    });

  for (const phase of ['headers', 'body'] as const)
    it(`retains a slow client during ${phase}, then cleanly cancels it before stop succeeds`, async () => {
      const f = await rawSocketFixture(true);
      const address = f.host.address()!;
      const socket = connect(address.port, '127.0.0.1');
      try {
        await once(socket, 'connect');
        socket.write(
          phase === 'headers'
            ? 'POST /portal/echo HTTP/1.1\r\nHost: portal.example.invalid\r\n'
            : 'POST /portal/echo HTTP/1.1\r\nHost: portal.example.invalid\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{'
        );
        await delay(50);
        await assert.rejects(f.host.stop({ deadlineMs: 80 }), /deadline/);
        assert.equal(f.host.status().ready, false);
        assert.equal(f.host.status().stopped, false);
        await assert.rejects(
          new Promise<void>((resolve, reject) => {
            const late = connect(address.port, '127.0.0.1');
            late.once('error', reject);
            late.once('connect', () => {
              late.destroy();
              resolve();
            });
          })
        );
        const closed = once(socket, 'close');
        socket.destroy();
        await closed;
        await f.host.stop();
        await f.host.stop();
        assert.equal(f.closeCalls(), 1);
        await assertOwnedHttpClosed(f.host, f.owner, f.server);
      } finally {
        socket.destroy();
        await f.close();
      }
    });

  it('stops the production host before activation and never reopens admission', async () => {
    await assert.rejects(
      rawSocketFixture(true, {
        beforeActivate: async host => {
          const first = host.stop();
          assert.equal(host.stop(), first);
          await first;
          await host.stop();
          await assertOwnedHttpClosed(host, Reflect.get(host, 'owner'));
          await assert.rejects(host.activate(), /stopped/i);
        },
      }),
      /stopped/i
    );
  });
});
