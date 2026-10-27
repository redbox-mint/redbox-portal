import assert from 'node:assert/strict';
import { deploymentDefaults, deploymentSchema } from '../../src/configuration/deployment';
import { resolveStartupConfiguration } from '../../src/configuration/resolution';

describe('storage driver configuration layers', () => {
  for (const name of ['primary', 'staging']) {
    it(`replaces the ${name} disk driver configuration and merges later same-driver overrides`, () => {
      const core = deploymentDefaults('test');
      const originalStorage = structuredClone(core.values.storage);
      const config = resolveStartupConfiguration({
        schema: deploymentSchema,
        core,
        application: {
          source: 'GridFS storage',
          values: { storage: { disks: { [name]: { driver: 'gridfs', config: { datastore: 'redboxStorage' } } } } },
        },
        environment: {
          source: 'GridFS bucket',
          values: { storage: { disks: { [name]: { config: { bucketName: 'uploads' } } } } },
        },
      });
      assert.deepEqual(config.storage.disks?.[name], {
        driver: 'gridfs',
        config: { datastore: 'redboxStorage', bucketName: 'uploads' },
      });
      const other = name === 'primary' ? 'staging' : 'primary';
      assert.deepEqual(config.storage.disks?.[other], deploymentSchema.parse(core.values).storage.disks?.[other]);
      assert.deepEqual(core.values.storage, originalStorage);
    });
  }
});
