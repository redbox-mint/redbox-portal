import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { bindExtensionFactory, composeExtensionApplication, resolveExtensions } from '../../src/extensions';
import { ExpressHost } from '../../src/http/express/ExpressHost';

describe('HTTP preparation and application cleanup', () => {
  for (const explicitOwner of [false, true])
    it(`joins late integration acquisition before cleanup (owner=${explicitOwner})`, async () => {
      const owner = { config: {}, log: { warn() {} } };
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const events: string[] = [];
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let server: Server | undefined;
      const upgrade = () => {};
      const composition = composeExtensionApplication(
        owner,
        resolveExtensions([
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
                    prepare: async listener => {
                      server = listener;
                      entered.resolve();
                      await release.promise;
                      heartbeat = setInterval(() => {}, 1000);
                      listener.on('upgrade', upgrade);
                      events.push('acquire');
                    },
                    quiesce: () => {
                      events.push('quiesce');
                    },
                    close: async () => {
                      clearInterval(heartbeat);
                      heartbeat = undefined;
                      server?.off('upgrade', upgrade);
                      events.push('close');
                    },
                  }),
                },
              ],
            },
          },
        ]),
        {
          module: () => () => {
            throw Error('unused');
          },
          integration: registration => bindExtensionFactory(registration.declaration, undefined),
        }
      );
      const host = new ExpressHost(composition.application, {
        hostname: '127.0.0.1',
        port: 0,
        prepare: composition.prepare,
        ...(explicitOwner ? { owner } : {}),
      });
      const initializing = assert.rejects(host.initialize(), /stop has begun/);
      try {
        await entered.promise;
        await assert.rejects(host.stop({ deadlineMs: 30 }), /deadline/);
        assert(events.includes('quiesce'));
        assert.equal(events.includes('close'), false, 'preparation still owns its pending acquisition');
        assert.equal(host.status().application.cleanupPending, true);
        release.resolve();
        await initializing;
        await host.stop();
        assert(events.indexOf('close') > events.indexOf('acquire'));
        assert.equal(heartbeat, undefined);
        assert.equal(server!.listenerCount('upgrade'), 0);
        assert.equal(host.status().stopped, true);
        assert.equal(host.status().application.cleanupPending, false);
      } finally {
        release.resolve();
        await initializing;
        await host.stop();
        clearInterval(heartbeat);
        server?.off('upgrade', upgrade);
      }
    });
});
