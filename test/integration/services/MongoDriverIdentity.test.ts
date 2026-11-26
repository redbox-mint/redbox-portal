import assert from 'node:assert/strict';

type MongoDriver = typeof import('mongodb');
const portalDriver = require('mongodb') as MongoDriver;
const { assertMongoDriverIdentity } = require('../helpers/mongo-driver-identity.cjs') as {
  assertMongoDriverIdentity(): Promise<void>;
};

declare const Record: {
  getDatastore(): { driver: { mongodb: MongoDriver }; manager: unknown };
};

describe('MongoDB driver identity', () => {
  it('shares MongoDB and BSON modules and accepts an ObjectId from core', assertMongoDriverIdentity);

  it('keeps the shared driver after the Record datastore starts', () => {
    const { driver, manager } = Record.getDatastore();
    assert.strictEqual(driver.mongodb, portalDriver);
    assert.ok(manager instanceof portalDriver.Db);
  });
});
