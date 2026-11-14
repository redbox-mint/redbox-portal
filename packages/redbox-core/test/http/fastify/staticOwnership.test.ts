import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { createPortalFastifyApplication } from '../../../src/application/portal/application';
import { StaticOwnershipTable } from '../../../src/http/fastify/staticOwnership';
import { coreRouteName } from '../../../src/http/fastify/routes';
import { resumableUploadRoutes } from '../../../src/http/express/resumableUploads';
import { progressSocketHttpOwners } from '../../../src/http/express/progressSockets';
import { persistenceStatus } from '../../../src/persistence/runtime';
import { getMetaRoute } from '../../../src/api-routes/groups/records';

describe('complete production static ownership declarations', function () {
  this.timeout(30000);
  for (const rootContext of ['', '/portal'])
    it(`constructs every owner with Companion, TUS, sockets, OIDC and AAF present (${rootContext || '/'})`, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'fm032-ownership-'));
      let portal: Awaited<ReturnType<typeof createPortalFastifyApplication>> | undefined;
      try {
        const extension = path.join(directory, 'node_modules/ownership-storage');
        await mkdir(extension, { recursive: true });
        await writeFile(
          path.join(directory, 'package.json'),
          JSON.stringify({ dependencies: { 'ownership-storage': '1.0.0' } })
        );
        await writeFile(
          path.join(extension, 'package.json'),
          JSON.stringify({ main: 'index.cjs', redbox: { extension: '.' } })
        );
        await writeFile(
          path.join(extension, 'index.cjs'),
          `const storage = require(${JSON.stringify(require.resolve('@researchdatabox/sails-hook-redbox-storage-mongo/extension'))});
exports.inspectPrismaStagedStorage = storage.inspectPrismaStagedStorage;
exports.ensurePrismaStagedStorageIndexes = storage.ensurePrismaStagedStorageIndexes;
exports.registerRedboxExtension = () => ({...storage.registerRedboxExtension(), apiVersion: 2});`
        );
        const config = path.join(directory, 'config.cjs');
        await writeFile(
          config,
          'module.exports=' +
            JSON.stringify({
              server: { rootContext },
              brandingConfigurationDefaults: { auth: { active: ['local', 'aaf', 'oidc'] } },
              redboxSession: { secret: 'fm032-offline-ownership-secret-at-least-32-characters' },
              companion: {
                enabled: true,
                secret: 'fm032-offline-companion-secret-at-least-32-characters',
                providerOptions: { drive: { key: 'synthetic-key', secret: 'synthetic-secret' } },
                uploadUrls: ['https://portal.example.invalid/uploads'],
              },
            })
        );
        portal = await createPortalFastifyApplication({
          appPath: directory,
          log: nothingLogger,
          files: { application: config },
          env: {},
          argv: [],
          http: { declarations: [getMetaRoute], progress: true, pages: {} },
        });
        const { ownership, routePlan } = portal.installation;
        const table = new StaticOwnershipTable(
          ownership.declarations,
          ownership.configuration,
          rootContext,
          routePlan,
          []
        );
        const paths = new Set(ownership.declarations.map(owner => owner.route.path));
        for (const optional of [
          '/user/login_oidc',
          '/user/begin_oidc',
          '/user/login_aaf',
          '/companion',
          '/companion/*companionPath',
          '/companion/*transportPath',
          ...resumableUploadRoutes.map(route => route.path),
          ...progressSocketHttpOwners('https://portal.example.invalid').map(owner => owner.route.path),
        ])
          assert(paths.has(optional), `Optional owner is missing: ${optional}`);
        assert(portal.installation.raw, 'Raw uploads/progress/Companion are selected');
        assert.equal(portal.config.companion.enabled, true);
        assert.deepEqual(portal.config.brandingConfigurationDefaults.auth.active, ['local', 'aaf', 'oidc']);
        const names = new Set(table.snapshot().map(row => row.name));
        for (const { route } of ownership.declarations)
          assert(names.has(coreRouteName(route.method, route.path)), `${route.method} ${route.path}`);
        for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
          for (const tail of ['', '/', '/drive/list', '/api/transfer']) {
            const url = rootContext + '/companion' + tail;
            const selected = table.select({ method, raw: { url } } as FastifyRequest);
            assert(selected.some(owner => owner.binding.route.declaration.path.startsWith('/companion')));
          }
          const siblings = table.select({
            method,
            raw: { url: rootContext + '/companion-other/health' },
          } as FastifyRequest);
          assert(!siblings.some(owner => owner.binding.route.declaration.path.startsWith('/companion')));
        }
        assert.equal(persistenceStatus(portal.owner).pools, 0, 'Offline construction acquires no database pools');
      } finally {
        await portal?.application.stop();
        await rm(directory, { recursive: true, force: true });
      }
    });
});
