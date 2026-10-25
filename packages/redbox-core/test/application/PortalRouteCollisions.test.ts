import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { createPortalApplication } from '../../src/application/portal/application';
import { portalOwnedHttpRoutes } from '../../src/http/express/ownedRoutes';

describe('production owned route collision preflight', () => {
  const config = { server: { rootContext: '' }, companion: { enabled: true, route: '/companion' } };
  const owned = portalOwnedHttpRoutes(config);
  for (const [method, path] of [
    ['get', '/:branding/:portal/api/recordtypes'],
    ['get', '/:branding/:portal/api/recordtypes//'],
    ['get', '/:brand/:site/api/recordtypes{}'],
    ['get', '/:brand/:site/api/recordtypes{/}'],
    ['head', '/:brand/:site/api/recordtypes///'],
    ['head', '/:brand/:site/api/recordtypes/'],
    ['get', '/:branding/:portal/home'],
    ['post', '/:branding/:portal/record/:id/attach'],
    ['get', '/companion/{*provider}'],
  ]) {
    it(`rejects an unnamed core replacement ${method} ${path} before acquiring resources`, async () => {
      await withPortal(
        { name: 'accidental-shadow', method, path, handler: 'shadow', access: 'public' },
        async options => {
          await assert.rejects(createPortalApplication(options), /collision with an owned portal route/);
        }
      );
    });
  }
  it('accepts named core replacements with structural aliases and a new custom route', async () => {
    const target = owned.find(route => route.method === 'get' && route.path === '/:branding/:portal/api/recordtypes')!;
    for (const route of [
      { ...target, replaces: true },
      { ...target, path: '/:brand/:site/API/RECORDTYPES{}///', replaces: true },
      { name: 'custom', method: 'get', path: '/:branding/:portal/custom-route' },
    ])
      await withPortal({ ...route, handler: 'shadow', access: 'public' }, async options => {
        const portal = await createPortalApplication(options);
        assert.equal(portal.resolved.routes[0].declaration.name, route.name);
        await portal.application.stop();
      });
  });
  it('rejects named replacements that change the owned method or add matched paths', async () => {
    const target = owned.find(route => route.method === 'get' && route.path === '/:branding/:portal/api/recordtypes')!;
    for (const change of [{ path: '/unrelated' }, { path: target.path + '{/}' }, { method: 'post' }])
      await withPortal({ ...target, ...change, replaces: true, handler: 'shadow', access: 'public' }, async options => {
        await assert.rejects(createPortalApplication(options), /owned route replacement must retain/);
      });
  });
  async function withPortal(
    route: object,
    check: (options: Parameters<typeof createPortalApplication>[0]) => Promise<void>
  ) {
    const directory = await mkdtemp(join(tmpdir(), 'sr-owned-routes-'));
    try {
      const installed = join(directory, 'node_modules/test-storage');
      await mkdir(installed, { recursive: true });
      await writeFile(join(directory, 'package.json'), JSON.stringify({ dependencies: { 'test-storage': '1.0.0' } }));
      await writeFile(
        join(installed, 'package.json'),
        JSON.stringify({ main: 'index.cjs', redbox: { extension: '.' } })
      );
      await writeFile(
        join(installed, 'index.cjs'),
        `
        exports.registerRedboxExtension = () => ({ apiVersion: 1,
          modules: [{ name: 'storage', create() { throw Error('Must not initialize'); } }],
          handlers: [{ name: 'shadow', create() { throw Error('Must not construct handler'); } }],
          routes: [${JSON.stringify(route)}]
        });
        exports.inspectPrismaStagedStorage = exports.ensurePrismaStagedStorageIndexes = async () => [];
      `
      );
      const application = join(directory, 'application.cjs');
      await writeFile(
        application,
        'module.exports=' +
          JSON.stringify({
            companion: {
              enabled: true,
              secret: 'companion-route-secret-at-least-32-characters',
              providerOptions: { drive: { key: 'key', secret: 'secret' } },
              uploadUrls: ['http://localhost:1500'],
            },
          })
      );
      await check({
        appPath: directory,
        log: nothingLogger,
        files: { application },
        bindings: {
          handler: () => () => {
            throw Error('Must not construct handler');
          },
        },
        env: { REDBOX_SESSION_SECRET: 'owned-route-secret-at-least-32-characters' },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
