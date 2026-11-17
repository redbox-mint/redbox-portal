import assert from 'node:assert/strict';
import { bindExtensionFactory } from '../../src/extensions';
import { composeExtensionApplication } from '../../src/extensions/composition';
import { resolveExtensions, type ExtensionProvider } from '../../src/extensions/resolution';
import { ExpressHost } from '../../src/http/express';

describe('owned extension composition', () => {
  it('prepares one server, applies policy and middleware, activates explicitly and retries retained cleanup', async () => {
    const events: string[] = [];
    let failClose = true;
    let attached: unknown;
    const resolved = resolveExtensions([
      {
        name: 'hook',
        root: '.',
        declaration: {
          apiVersion: 1,
          handlers: [
            {
              name: 'read',
              create: () => (_req, res) => {
                res.json({ ok: true });
              },
            },
            {
              name: 'before',
              create: () => (_req, _res, next) => {
                events.push('middleware');
                next();
              },
            },
          ],
          middleware: [{ name: 'before', stage: 'beforeRoutes', handler: 'before' }],
          routes: [{ name: 'read', method: 'get', path: '/hook', handler: 'read', access: ['isAdmin'] }],
          integrations: [
            {
              name: 'native',
              create: () => ({
                initialize: async () => {
                  events.push('initialize');
                },
                prepare: async server => {
                  attached = server;
                  events.push('prepare');
                },
                activate: async () => {
                  events.push('activate');
                },
                drain: async () => {
                  events.push('drain');
                },
                close: async () => {
                  if (failClose) throw new Error('retained');
                  events.push('close');
                },
              }),
            },
          ],
        },
      },
    ]);
    assert.throws(
      () =>
        composeExtensionApplication({ config: {}, log: console }, resolved, {
          module: () => () => {
            throw new Error('unused');
          },
        }),
      /bind HTTP/
    );
    const composition = composeExtensionApplication({ config: {}, log: console }, resolved, {
      module: () => () => {
        throw new Error('unused');
      },
      handler: item => bindExtensionFactory(item.declaration, undefined),
      integration: item => bindExtensionFactory(item.declaration, undefined),
      policies: names => (_req, _res, next) => {
        assert.deepEqual(names, ['isAdmin']);
        events.push('policy');
        next();
      },
    });
    const host = new ExpressHost(composition.application, {
      hostname: '127.0.0.1',
      port: 0,
      prepare: composition.prepare,
    });
    await host.initialize();
    assert.ok(attached);
    assert.deepEqual(events, ['initialize', 'prepare']);
    const url = `http://127.0.0.1:${host.address()!.port}/hook`;
    assert.equal((await fetch(url)).status, 503);
    await host.activate();
    assert.deepEqual(await (await fetch(url)).json(), { ok: true });
    assert.deepEqual(events.slice(-3), ['activate', 'middleware', 'policy']);
    await assert.rejects(host.stop(), /cleanup|resource/i);
    assert.equal(host.status().ready, false);
    assert.equal(host.status().application.cleanupPending, true);
    failClose = false;
    await host.stop();
    assert.equal(host.status().stopped, true);
    assert.equal(events.at(-1), 'close');
  });
  it('cleans acquired integrations after preparation failure without activation', async () => {
    let closed = 0,
      activated = 0;
    const resolved = resolveExtensions([
      {
        name: 'hook',
        root: '.',
        declaration: {
          apiVersion: 1,
          integrations: [
            {
              name: 'native',
              create: () => ({
                initialize: async () => {},
                prepare: async () => {
                  throw new Error('prepare failure');
                },
                activate: async () => {
                  activated++;
                },
                close: async () => {
                  closed++;
                },
              }),
            },
          ],
        },
      },
    ]);
    const composition = composeExtensionApplication({ config: {}, log: console }, resolved, {
      module: () => () => {
        throw new Error('unused');
      },
      integration: item => bindExtensionFactory(item.declaration, undefined),
    });
    const host = new ExpressHost(composition.application, {
      hostname: '127.0.0.1',
      port: 0,
      prepare: composition.prepare,
    });
    await assert.rejects(host.initialize(), /prepare failure/);
    assert.equal(closed, 1);
    assert.equal(activated, 0);
    assert.equal(host.status().listening, false);
  });
});
