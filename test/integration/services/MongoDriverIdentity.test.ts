import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

type MongoDriver = typeof import('mongodb');
const portalDriver = require('mongodb') as MongoDriver;

declare const Record: {
  getDatastore(): { driver: { mongodb: MongoDriver }; manager: unknown };
};

describe('MongoDB driver identity', () => {
  it('shares MongoDB and BSON constructors between the Sails datastore and native consumers', () => {
    const { mongodb: datastoreDriver } = require('sails-mongo') as { mongodb: MongoDriver };
    assert.strictEqual(datastoreDriver.GridFSBucket, portalDriver.GridFSBucket);
    assert.strictEqual(datastoreDriver.ObjectId, portalDriver.ObjectId);
    assert.strictEqual(datastoreDriver.BSON, portalDriver.BSON);

    const fromCore = createRequire(require.resolve('@researchdatabox/redbox-core'));
    const coreAdapter = fromCore('sails-mongo') as { mongodb: MongoDriver };
    assert.strictEqual(coreAdapter.mongodb, datastoreDriver, 'the core adapter must use the portal MongoDB module');

    for (const dependency of [
      '@researchdatabox/redbox-core',
      '@researchdatabox/sails-hook-redbox-storage-mongo',
      '@researchdatabox/redbox-mcp',
      'connect-mongo',
    ]) {
      const fromConsumer = createRequire(require.resolve(dependency));
      const consumerDriver = fromConsumer('mongodb') as MongoDriver;
      assert.strictEqual(
        consumerDriver,
        datastoreDriver,
        `${dependency} must use the Sails datastore's MongoDB module`
      );
    }
  });

  it('keeps the shared driver after the Record datastore starts', () => {
    const { driver, manager } = Record.getDatastore();
    assert.strictEqual(driver.mongodb, portalDriver);
    assert.ok(manager instanceof portalDriver.Db);
  });
});
