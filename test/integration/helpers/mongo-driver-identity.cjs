const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

/** @typedef {typeof import('mongodb')} MongoDriver */

function assertMongoDriverIdentity() {
  const fromPortal = createRequire(__filename);
  const portalDriver = require('mongodb');
  /** @type {{ mongodb: MongoDriver }} */
  const { mongodb: datastoreDriver } = fromPortal('sails-mongo');
  const fromDriver = createRequire(require.resolve('mongodb'));
  /** @type {typeof import('bson')} */
  const bson = fromDriver('bson');

  assert.strictEqual(datastoreDriver, portalDriver);
  assert.strictEqual(portalDriver.ObjectId, bson.ObjectId);

  for (const dependency of [
    '@researchdatabox/redbox-core',
    '@researchdatabox/sails-hook-redbox-storage-mongo',
    '@researchdatabox/redbox-mcp',
    'connect-mongo',
  ]) {
    const fromConsumer = createRequire(require.resolve(dependency));
    assert.strictEqual(fromConsumer('mongodb'), portalDriver, `${dependency} must use the portal MongoDB module`);
    assert.strictEqual(fromConsumer('bson'), bson, `${dependency} must use the portal BSON module`);
  }

  const fromCore = createRequire(require.resolve('@researchdatabox/redbox-core'));
  /** @type {{ mongodb: MongoDriver }} */
  const coreAdapter = fromCore('sails-mongo');
  assert.strictEqual(coreAdapter.mongodb, portalDriver, 'the core adapter must use the portal MongoDB module');

  /** @type {MongoDriver} */
  const coreDriver = fromCore('mongodb');
  /** @type {(id: import('mongodb').ObjectId) => import('mongodb').ObjectId} */
  const normalizeObjectId = fromPortal('sails-mongo/lib/private/machines/private/normalize-mongo-object-id');
  const objectId = new coreDriver.ObjectId();
  assert.strictEqual(normalizeObjectId(objectId), objectId);
}

module.exports = { assertMongoDriverIdentity };
