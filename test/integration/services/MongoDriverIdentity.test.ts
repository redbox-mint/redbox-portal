import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

type MongoDriver = typeof import('mongodb');
const portalDriver = require('mongodb') as MongoDriver;

declare const Record: {
  getDatastore(): { driver: { mongodb: MongoDriver }; manager: unknown };
};

describe('MongoDB driver identity', () => {
  // Mounted checkouts keep each package's own install, so only the image layout guarantees one copy.
  const itInImageLayout = process.env.RBPORTAL_MOCHA_LAYOUT === 'mount' ? it.skip : it;

  itInImageLayout('resolves MongoDB and BSON to the same installed modules across portal packages', () => {
    const mongoPath = require.resolve('mongodb');
    const bsonPath = createRequire(mongoPath).resolve('bson');

    for (const consumer of [
      'sails-mongo',
      'connect-mongo',
      '@researchdatabox/redbox-core',
      '@researchdatabox/redbox-mcp',
      '@researchdatabox/sails-hook-redbox-storage-mongo',
    ]) {
      const requireFromConsumer = createRequire(require.resolve(consumer));
      assert.strictEqual(
        requireFromConsumer.resolve('mongodb'),
        mongoPath,
        `${consumer} uses a separate MongoDB install`
      );
      assert.strictEqual(requireFromConsumer.resolve('bson'), bsonPath, `${consumer} uses a separate BSON install`);
    }
  });

  it('keeps the shared driver after the Record datastore starts', () => {
    const { driver, manager } = Record.getDatastore();
    assert.strictEqual(driver.mongodb, portalDriver);
    assert.ok(manager instanceof portalDriver.Db);
  });
});
