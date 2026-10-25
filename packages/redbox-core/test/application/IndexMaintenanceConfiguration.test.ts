import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';
import { runIndexMaintenance } from '../../src/maintenance/indexes';
import * as maintenance from '../../src/persistence/maintenance';
import { persistenceStatus } from '../../src/persistence/runtime';
import { deploymentSchema } from '../../src/configuration';

describe('standalone maintenance configuration selection', () => {
  it('leaves declared workflows offline while retaining operational job contributions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sr-maintenance-config-'));
    const boundary = new Error('Observed index preparation boundary');
    const inspect = sinon.stub(maintenance, 'prepareSelectedPersistenceIndexes').rejects(boundary);
    try {
      const name = '@researchdatabox/sails-hook-redbox-storage-mongo';
      const installed = join(directory, 'node_modules', name);
      await mkdir(installed, { recursive: true });
      await writeFile(join(directory, 'package.json'), JSON.stringify({ dependencies: { [name]: '1.0.0' } }));
      await writeFile(
        join(installed, 'package.json'),
        JSON.stringify({
          name,
          exports: { './extension': './extension.cjs' },
          redbox: { extension: './extension' },
        })
      );
      await writeFile(
        join(installed, 'extension.cjs'),
        `
        const fail = () => { throw Error('Maintenance executed business work'); };
        exports.registerRedboxExtension = () => ({ apiVersion: 1,
          modules: [{ name: 'storage', create: fail }],
          migrations: [{ name: 'must-not-migrate', run: fail }],
          bootstrap: [{ name: 'must-not-bootstrap', run: fail }],
          workflows: { institutionRecord: { draft: { form: 'institution-form' } } },
          forms: { 'institution-form': { name: 'institution-form' } },
          jobs: { maintenanceProbe: { fnName: 'unbound', schedule: { method: 'now' } } },
          config: { workflow: { otherRecord: {} }, custom: { example: true } }
        });
        exports.inspectPrismaStagedStorage = exports.ensurePrismaStagedStorageIndexes = async () => [];
      `
      );
      await assert.rejects(
        runIndexMaintenance({ appPath: directory, mode: 'inspect', env: {} }),
        error => error === boundary
      );
      assert.equal(inspect.callCount, 1);
      const owner = inspect.firstCall.args[0];
      assert.equal(Object.hasOwn(owner.config, 'workflow'), false);
      assert.equal(Object.hasOwn(owner.config, 'custom'), false);
      assert.equal(deploymentSchema.parse(owner.config).agendaQueue.jobs.maintenanceProbe.fnName, 'unbound');
      assert.equal(persistenceStatus(owner).pools, 0);
    } finally {
      inspect.restore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
