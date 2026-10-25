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

describe('explicit extension HEAD routing', () => {
  for (const production of [false, true]) {
    for (const headFirst of [false, true]) {
      it(`honours explicit HEAD policy with HEAD ${headFirst ? 'first' : 'last'} in ${production ? 'production' : 'standalone'} composition`, async () => {
        const directory = await mkdtemp(join(tmpdir(), 'sr-head-route-'));
        let host: ExpressHost | undefined;
        const routes: NonNullable<RedboxExtension['routes']> = [
          { name: 'read', method: 'get', path: '/hook', handler: 'read', access: 'public' },
          { name: 'headers', method: 'head', path: '/hook', handler: 'read', access: ['checked'] },
        ];
        const declaration: RedboxExtension = {
          apiVersion: 1,
          routes: headFirst ? [...routes].reverse() : routes,
          handlers: [
            {
              name: 'read',
              create() {
                throw Error('Use selected binding');
              },
            },
          ],
        };
        try {
          const installed = join(directory, 'node_modules/owned-hook');
          await mkdir(installed, { recursive: true });
          await writeFile(join(directory, 'package.json'), JSON.stringify({ dependencies: { 'owned-hook': '1.0.0' } }));
          await writeFile(
            join(installed, 'package.json'),
            JSON.stringify({ name: 'owned-hook', version: '1.0.0', main: 'index.cjs', redbox: { extension: '.' } })
          );
          await writeFile(
            join(installed, 'index.cjs'),
            `
            exports.registerRedboxExtension = () => ({...${JSON.stringify(declaration)},
              modules: [{name:'storage', create() { throw Error('Offline fixture'); }}],
              handlers: [{name:'read', create() { throw Error('Use selected binding'); }}]});
            exports.inspectPrismaStagedStorage = exports.ensurePrismaStagedStorageIndexes = () => { throw Error('Offline fixture'); };
          `
          );
          const owner = { config: {}, log: nothingLogger };
          const handler: RequestHandler = (_req, res) => {
            res.status(200).end();
          };
          const policy = (): RequestHandler => (_req, res) => {
            res.status(403).end();
          };
          const bindings = {
            handler: () => () => handler,
            module: () => () => {
              throw Error('Offline fixture');
            },
          };
          const portal = production
            ? await createPortalApplication({
                appPath: directory,
                log: nothingLogger,
                env: { REDBOX_SESSION_SECRET: 'handler-test-secret-at-least-32-characters' },
                bindings,
              })
            : undefined;
          const composition = production
            ? undefined
            : composeExtensionApplication(
                owner,
                resolveExtensions([{ name: 'owned-hook', root: directory, declaration }]),
                { ...bindings, policies: policy }
              );
          host = new ExpressHost(composition?.application ?? new ApplicationRuntime(owner, []), {
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
          const url = `http://127.0.0.1:${host.address()!.port}/hook`;
          assert.equal((await fetch(url, { method: 'HEAD' })).status, 403);
          assert.equal((await fetch(url)).status, 200);
          await portal?.application.stop();
        } finally {
          await host?.stop({ deadlineMs: 2000 });
          await rm(directory, { recursive: true, force: true });
        }
      });
    }
  }
});
