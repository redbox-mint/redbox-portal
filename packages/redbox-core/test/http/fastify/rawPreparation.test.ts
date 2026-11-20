import assert from 'node:assert/strict';
import { ApplicationRuntime } from '../../../src/application';
import { FastifyHost } from '../../../src/http/fastify/FastifyHost';
import { prepareNativeParsers } from '../../../src/http/fastify/parsers';
import { rawMultipartParserPlugin, receiveMultipart } from '../../../src/http/fastify/rawMultipart';
import { prepareDatastreamUploads } from '../../../src/http/fastify/datastreamUploads';
import { composeRoutes } from '../../../src/http/fastify/routes';
import { ProgressSockets } from '../../../src/http/integrations/progressSockets';
import WebSocket from 'ws';
import { Server as SocketServer } from 'socket.io';
import { createServer, type RequestListener } from 'node:http';
import { of } from 'rxjs';
import { registerPersistenceResource } from '../../../src/persistence/runtime';

describe('qualified raw preparation capability', () => {
  it('scopes its native handoff, preserves sibling parsers and denies unqualified stream APIs', async () => {
    const owner = { config: {}, log: { warn() {} } };
    const host = new FastifyHost(new ApplicationRuntime(owner, []), {
      owner,
      hostname: '127.0.0.1',
      port: 0,
      prepare: async app => {
        prepareNativeParsers(app);
        const plan = await composeRoutes(
          [
            {
              provider: 'test',
              declaration: {
                name: 'raw',
                method: 'put',
                path: '/upload',
                controller: 'Raw',
                action: 'upload',
                access: { kind: 'public' },
              },
            },
          ],
          { policyNames: [] }
        );
        app.register(async scope => {
          assert.throws(
            () => scope.register(rawMultipartParserPlugin, { bindings: plan.bindings, unauthorized: true } as never),
            /register options/
          );
          const bindings = plan.bindings.filter(binding => binding.kind !== 'automatic-options');
          scope.register(rawMultipartParserPlugin, { bindings });
          scope.post('/upload', { config: { redboxRoute: bindings[0] } }, async request => {
            assert.throws(() => receiveMultipart(request, undefined!, async () => undefined), /scoped raw parser/);
            return request.body;
          });
          plan.install(
            scope,
            {
              action: () => async request => {
                assert.equal(request.body, undefined);
                assert.throws(() => request.raw.pipe, /owned hooks/);
                assert.throws(() => request.raw.on, /owned hooks/);
                assert.throws(() => request.raw[Symbol.asyncIterator], /owned hooks/);
                // A qualified raw binding reaches the owner; its ordinary sibling cannot.
                let received = false;
                await receiveMultipart(
                  request,
                  {
                    receive: async () => {
                      received = true;
                    },
                  } as never,
                  async () => undefined
                );
                assert.ok(received);
                return { raw: true };
              },
            },
            async () => {}
          );
        });
        app.post('/upload/sibling', async request => {
          assert.throws(() => receiveMultipart(request, undefined!, async () => undefined), /scoped raw parser/);
          return request.body;
        });
        // A lookalike plugin is ordinary sealed core code; identity, rather than
        // a skip-override marker or function name, qualifies native transport.
        app.register(async lookalike => {
          assert.throws(() => Reflect.get(lookalike, 'decorateRequest'), /preparation rejects/);
        });
      },
    });
    try {
      await host.initialize();
      await host.activate();
      const url = 'http://127.0.0.1:' + host.address()!.port;
      const raw = await fetch(url + '/upload', {
        method: 'PUT',
        headers: { 'Content-Type': 'multipart/form-data; boundary=owned-upload' },
        body: '--owned-upload--\r\n',
      });
      assert.equal(raw.status, 200);
      assert.deepEqual(await raw.json(), { raw: true });
      const otherMethod = await fetch(url + '/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"method":"unowned"}',
      });
      assert.equal(otherMethod.status, 200);
      assert.deepEqual(await otherMethod.json(), { method: 'unowned' });
      const sibling = await fetch(url + '/upload/sibling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"parsed":true}',
      });
      assert.equal(sibling.status, 200);
      assert.deepEqual(await sibling.json(), { parsed: true });
    } finally {
      await host.stop();
    }
  });
  it('rejects raw owners outside the final plan before registering a plugin', async () => {
    const plan = await composeRoutes([], { policyNames: [] });
    const other = await composeRoutes(
      [
        {
          provider: 'test',
          declaration: {
            name: 'other',
            method: 'post',
            path: '/other',
            controller: 'Other',
            action: 'upload',
            access: { kind: 'public' },
          },
        },
      ],
      { policyNames: [] }
    );
    assert.throws(
      () =>
        prepareDatastreamUploads(undefined!, {
          plan,
          routes: other.routes,
          controllers: undefined!,
          guards: async () => {},
        }),
      /final resolved plan/
    );
  });
  it('prepares upgrades before listening, gates pre-activation ingress and never closes the borrowed server', async () => {
    const owner = { config: {}, log: { warn() {} } };
    const application = new ApplicationRuntime(owner, []);
    let closes = 0,
      sockets!: ProgressSockets;
    const host = new FastifyHost(application, {
      owner,
      hostname: '127.0.0.1',
      port: 0,
      prepare: async (_app, server) => {
        assert.equal(server.listening, false);
        const close = server.close;
        server.close = function (...args) {
          closes++;
          return close.apply(this, args);
        };
        sockets = new ProgressSockets({
          owner,
          path: '/portal-socket.io',
          origins: ['https://portal.invalid'],
          records: { getMeta: async () => null!, hasViewAccess: () => false },
          progress: { get: () => of([]) },
          authenticate: async () => false,
        });
        registerPersistenceResource(owner, 'raw-preparation-sockets', sockets);
        sockets.attach(server, { borrowedServer: true, isReady: () => host.status().ready });
        assert.equal(server.listening, false);
      },
    });
    try {
      await host.initialize();
      const url = 'http://127.0.0.1:' + host.address()!.port;
      const denied = await fetch(url + '/portal-socket.io/?EIO=4&transport=polling', {
        headers: { Origin: 'https://portal.invalid' },
      });
      assert.equal(denied.status, 503);
      await denied.text();
      const script = await fetch(url + '/portal-socket.io/socket.io.js');
      assert.equal(script.status, 503);
      await script.text();
      await host.activate();
      const activeScript = await fetch(url + '/portal-socket.io/socket.io.js');
      assert.equal(activeScript.status, 200);
      await activeScript.text();
      const handshake = await fetch(url + '/portal-socket.io/?EIO=4&transport=polling', {
        headers: { Origin: 'https://portal.invalid' },
      });
      assert.equal(handshake.status, 200);
      await handshake.text();
      const status = application.status.bind(application);
      let failStatus = false;
      application.status = () => {
        if (failStatus) {
          failStatus = false;
          throw new Error('private admission failure');
        }
        return status();
      };
      for (const path of ['/portal-socket.io/socket.io.js', '/portal-socket.io/?EIO=4&transport=polling']) {
        failStatus = true;
        const failed = await fetch(url + path);
        assert.equal(failed.status, 500);
        assert.equal((await failed.text()).includes('private admission failure'), false);
      }
      failStatus = true;
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url.replace('http:', 'ws:') + '/portal-socket.io/?EIO=4&transport=websocket');
        socket.once('open', () => {
          socket.close();
          reject(new Error('Admission fault accepted an upgrade'));
        });
        socket.once('error', error => {
          try {
            assert.match(error.message, /500/);
            resolve();
          } catch (failure) {
            reject(failure);
          }
        });
      });
      application.status = status;
      await sockets.close();
      assert.equal(host.status().listening, true);
      assert.equal(closes, 0);
    } finally {
      await host.stop();
    }
    assert.equal(closes, 1);
  });
  for (const order of ['earlier-first', 'later-first'])
    it(`preserves one HTTP dispatch with stacked attachments closed ${order}`, async () => {
      let calls = 0;
      const server = createServer((_req, res) => {
        calls++;
        res.end('original');
      });
      const owner = { config: {}, log: { warn() {} } };
      const sockets = new ProgressSockets({
        owner,
        path: '/progress',
        origins: [],
        records: { getMeta: async () => null!, hasViewAccess: () => false },
        progress: { get: () => of([]) },
        authenticate: async () => false,
      });
      sockets.attach(server, { borrowedServer: true });
      const previous = server.listeners('request') as RequestListener[];
      // A real later Socket.IO attachment captures the predecessor chain.
      const later = new SocketServer(server, { path: '/later' });
      const laterHandlers = server.listeners('request') as RequestListener[];
      const closeLater = async () => {
        later.disconnectSockets(true);
        await later.of('/').adapter.close();
        later.engine.close();
        for (const listener of laterHandlers) server.off('request', listener);
        for (const listener of previous) server.on('request', listener);
      };
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const url = 'http://127.0.0.1:' + (server.address() as import('node:net').AddressInfo).port;
      const check = async () => {
        const before = calls;
        const response = await fetch(url + '/ordinary');
        assert.equal(await response.text(), 'original');
        assert.equal(calls - before, 1);
      };
      try {
        await check();
        if (order === 'earlier-first') {
          await sockets.close();
          await check();
          await closeLater();
        } else {
          await closeLater();
          await check();
          await sockets.close();
        }
        await check();
      } finally {
        await sockets.close();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
});
