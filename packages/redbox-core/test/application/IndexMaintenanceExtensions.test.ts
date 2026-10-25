import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { createPortalApplication } from '../../src/application/portal/application';
import { runIndexMaintenance } from '../../src/maintenance/indexes';
import * as maintenance from '../../src/persistence/maintenance';
import { persistenceStatus } from '../../src/persistence/runtime';
import { portalOwnedHttpRoutes } from '../../src/http/express/ownedRoutes';

describe('maintenance leaves the portal business graph offline', () => {
  for (const scenario of ['core dependency', 'core module replacement', 'core route replacement']) {
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
        const target = portalOwnedHttpRoutes({
          server: { rootContext: '' },
          companion: { enabled: false, route: '/companion' },
        }).find(route => route.method === 'get' && route.path === '/:branding/:portal/api/recordtypes')!;
        const declaration = {
          apiVersion: 1,
          modules: [
            { name: 'storage' },
            ...(scenario === 'core dependency'
              ? [{ name: 'institution', requires: ['records'] }]
              : scenario === 'core module replacement'
                ? [{ name: 'records', replaces: true }]
                : []),
          ],
          handlers: scenario === 'core route replacement' ? [{ name: 'institutionRead' }] : [],
          routes:
            scenario === 'core route replacement'
              ? [{ ...target, replaces: true, handler: 'institutionRead', access: 'public' }]
              : [],
        };
        await writeFile(
          join(installed, 'extension.cjs'),
          `
          const declaration = ${JSON.stringify(declaration)};
          const fail = () => { throw Error('Maintenance executed business work'); };
          exports.registerRedboxExtension = () => ({...declaration,
            modules: declaration.modules.map(item => ({...item, create: fail})),
            handlers: declaration.handlers.map(item => ({...item, create: fail}))});
          exports.inspectPrismaStagedStorage = exports.ensurePrismaStagedStorageIndexes = async () => [];
        `
        );
        const offline = () => () => {
          throw Error('Business factory executed');
        };
        const portal = await createPortalApplication({
          appPath: directory,
          log: nothingLogger,
          env: { REDBOX_SESSION_SECRET: 'maintenance-test-secret-at-least-32-characters' },
          bindings: { module: offline, handler: offline },
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
