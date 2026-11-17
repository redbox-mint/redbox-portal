import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { createPortalFastifyApplication } from '../../src/application/portal/application';
import { runIndexMaintenance } from '../../src/maintenance/indexes';
import * as maintenance from '../../src/persistence/maintenance';
import { persistenceStatus } from '../../src/persistence/runtime';
import { listRecordTypesRoute } from '../../src/api-routes/groups/recordtypes';
import { coreRouteName } from '../../src/http/fastify/routes';
import { bindControllerFactory } from '../../src/http/controllers';

describe('maintenance leaves the portal business graph offline', () => {
  for (const scenario of [
    'core dependency',
    'core module replacement',
    'core route replacement',
    'WSU-like API2 HTTP graph',
    'data-only declaration',
  ]) {
    it(`accepts an otherwise valid hook with a ${scenario}`, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'sr-maintenance-extension-'));
      const boundary = new Error('Observed index preparation boundary');
      const inspect = sinon.stub(maintenance, 'prepareSelectedPersistenceIndexes').rejects(boundary);
      try {
        const name = '@researchdatabox/sails-hook-redbox-storage-mongo';
        const installed = join(directory, 'node_modules', name);
        await mkdir(installed, { recursive: true });
        await writeFile(join(directory, 'package.json'), JSON.stringify({ dependencies: { [name]: '1.0.0' } }));
        await writeFile(
          join(installed, 'package.json'),
          JSON.stringify({ name, exports: { './extension': './extension.cjs' }, redbox: { extension: './extension' } })
        );
        const http = scenario === 'core route replacement' || scenario === 'WSU-like API2 HTTP graph';
        const declaration = {
          apiVersion: 2,
          modules: [
            { name: 'storage' },
            ...(scenario === 'core dependency'
              ? [{ name: 'institution', requires: ['records'] }]
              : scenario === 'core module replacement'
                ? [{ name: 'records', replaces: true }]
                : []),
          ],
          ...(http
            ? {
                controllers: [{ name: 'Institution', actions: ['latestPdf'] }],
                routes: [
                  {
                    name:
                      scenario === 'core route replacement'
                        ? coreRouteName(listRecordTypesRoute.method, listRecordTypesRoute.path)
                        : 'wsu-latest-pdf',
                    method: 'get',
                    path: scenario === 'core route replacement' ? listRecordTypesRoute.path : '/wsu/:oid/latest-pdf',
                    ...(scenario === 'core route replacement' ? { replaces: true } : {}),
                    controller: 'Institution',
                    action: 'latestPdf',
                    access: { kind: 'public' },
                  },
                ],
              }
            : {}),
        };
        await writeFile(
          join(installed, 'extension.cjs'),
          `
          const declaration = ${JSON.stringify(declaration)};
          const fail = () => { throw Error('Maintenance executed business work'); };
          exports.controllers = (declaration.controllers ?? []).map(item => ({...item, create: fail}));
          exports.registerRedboxExtension = () => ({...declaration,
            modules: declaration.modules.map(item => ({...item, create: fail})),
            ...(declaration.controllers ? {controllers: exports.controllers} : {})});
          exports.inspectPrismaStagedStorage = exports.ensurePrismaStagedStorageIndexes = async () => [];
        `
        );
        const offline = () => () => {
          throw Error('Business factory executed');
        };
        const controllers = require(join(installed, 'extension.cjs')).controllers;
        const portal = await createPortalFastifyApplication({
          appPath: directory,
          log: nothingLogger,
          env: { REDBOX_SESSION_SECRET: 'maintenance-test-secret-at-least-32-characters' },
          bindings: { module: offline },
          http: {
            declarations: [listRecordTypesRoute],
            bindings: () =>
              controllers.map((controller: Parameters<typeof bindControllerFactory>[0]) =>
                bindControllerFactory(controller, undefined)
              ),
          },
        });
        assert.equal(persistenceStatus(portal.owner).pools, 0);
        await portal.application.stop();
        await assert.rejects(
          runIndexMaintenance({ appPath: directory, mode: 'inspect', env: {} }),
          error => error === boundary
        );
        assert.equal(inspect.callCount, 1);
        assert.equal(persistenceStatus(inspect.firstCall.args[0]).pools, 0);
      } finally {
        inspect.restore();
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
