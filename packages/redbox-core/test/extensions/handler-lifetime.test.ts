import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { RequestHandler } from 'express';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../src/application';
import { createPortalApplication } from '../../src/application/portal/application';
import { composeExtensionApplication, resolveExtensions, type RedboxExtension } from '../../src/extensions';
import { ExpressHost } from '../../src/http/express';
import { persistenceOperation } from '../../src/persistence/runtime';

describe('extension HTTP handler ownership', () => {
  for (const production of [false, true]) {
    for (const kind of ['route', 'middleware', 'policy'] as const) {
      it(`retains returned ${kind} work in ${production ? 'production' : 'standalone'} composition`, async () => {
        const directory = await mkdtemp(join(tmpdir(), 'sr-handler-lifetime-'));
        const release = Promise.withResolvers<void>();
        let writes = 0;
        let completionError: unknown;
        let host: ExpressHost | undefined;
        const declaration: RedboxExtension = {
          apiVersion: 1,
          handlers: [
            {
              name: 'write',
              create: () => {
                throw new Error('Use selected binding');
              },
            },
          ],
          ...(kind === 'middleware'
            ? { middleware: [{ name: 'write', stage: 'beforeRoutes', handler: 'write' }] }
            : {
                routes: [
                  {
                    name: 'write',
                    method: 'post',
                    path: '/hook',
                    handler: 'write',
                    access: kind === 'policy' ? ['checked'] : 'public',
                  },
                ],
              }),
        };
        try {
          const installed = join(directory, 'node_modules/owned-hook');
          await mkdir(installed, { recursive: true });
          await writeFile(join(directory, 'package.json'), JSON.stringify({ dependencies: { 'owned-hook': '1.0.0' } }));
          await writeFile(
            join(installed, 'package.json'),
            JSON.stringify({ name: 'owned-hook', version: '1.0.0', main: 'index.cjs', redbox: { extension: '.' } })
          );
          // JSON omits the offline factory; the selected binding supplies it below.
          await writeFile(
            join(installed, 'index.cjs'),
            `
            exports.registerRedboxExtension = () => ({...${JSON.stringify(declaration)},
              modules: [{name:'storage', create() { throw Error('Offline fixture'); }}],
              handlers: [{name:'write', create() { throw Error('Use selected binding'); }}]});
            exports.inspectPrismaStagedStorage = () => { throw Error('Offline fixture'); };
            exports.ensurePrismaStagedStorageIndexes = () => { throw Error('Offline fixture'); };
          `
          );
          const owner = { config: {}, log: nothingLogger };
          const handler: RequestHandler = async (_req, res) => {
            res.json({ accepted: true });
            await release.promise;
            try {
              await persistenceOperation(owner, async () => {
                writes++;
              });
            } catch (error) {
              completionError = error;
            }
          };
          const binding = () => () =>
            kind === 'policy'
              ? () => {
                  throw new Error('The terminating policy must not dispatch the route');
                }
              : handler;
          const policy = (): RequestHandler => (kind === 'policy' ? handler : (_req, _res, next) => next());
          const portal = production
            ? await createPortalApplication({
                appPath: directory,
                log: nothingLogger,
                env: { REDBOX_SESSION_SECRET: 'handler-test-secret-at-least-32-characters' },
                bindings: {
                  handler: binding,
                  module: () => () => {
                    throw new Error('Offline fixture');
                  },
                },
              })
            : undefined;
          const composition = production
            ? undefined
            : composeExtensionApplication(
                owner,
                resolveExtensions([{ name: 'owned-hook', root: directory, declaration }]),
                {
                  module: () => () => {
                    throw new Error('unused');
                  },
                  handler: binding,
                  policies: policy,
                }
              );
          // Use a small runtime to exercise production HTTP preparation without
          // acquiring unrelated production databases or background workers.
          const application = composition?.application ?? new ApplicationRuntime(owner, []);
          host = new ExpressHost(application, {
            owner,
            port: 0,
            hostname: '127.0.0.1',
            prepare: portal
              ? async (router, server) => {
                  await portal.prepareExtensions('beforeRoutes', router, server, policy);
                  await portal.prepareExtensions('afterRoutes', router, server, policy);
                }
              : composition!.prepare,
          });
          await host.initialize();
          await host.activate();
          const response = await fetch(`http://127.0.0.1:${host.address()!.port}/hook`, { method: 'POST' });
          assert.deepEqual(await response.json(), { accepted: true });
          await assert.rejects(host.stop({ deadlineMs: 40 }), /deadline/);
          assert.equal(application.status().cleanupPending, true);
          release.resolve();
          await host.stop({ deadlineMs: 2000 });
          assert.equal(writes, 1);
          assert.equal(completionError, undefined);
          await portal?.application.stop();
        } finally {
          release.resolve();
          await host?.stop({ deadlineMs: 2000 });
          await rm(directory, { recursive: true, force: true });
        }
      });
    }
  }
});
