import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { MongoClient } from 'mongodb';
import { ApplicationRuntime } from '../../src/application/Application';
import { definePersistenceGroup } from '../../src/persistence/groupRuntime';
import { mongoDatabase, persistenceStatus } from '../../src/persistence/runtime';

describe('persistence startup failure cleanup', () => {
  afterEach(() => sinon.restore());

  for (const stage of ['preparation', 'module']) {
    it(`settles ${stage} group failure before application drain and closes acquired pools`, async () => {
      sinon.stub(MongoClient.prototype, 'connect').resolvesThis();
      const close = sinon.stub(MongoClient.prototype, 'close').resolves();
      const owner = { config: { datastores: { mongodb: { url: 'mongodb://fixture/startup' } } }, log: { warn() {} } };
      const failure = new Error('index readiness failed');
      const group = definePersistenceGroup('failing', async () => {
        await mongoDatabase(owner, 'mongodb');
        throw failure;
      });
      const initialize = () => group.initialize(owner);
      const app = new ApplicationRuntime(
        owner,
        stage === 'module' ? [{ name: 'failing', create: () => ({ initialize, async close() {} }) }] : [],
        stage === 'preparation' ? { preparePersistence: initialize } : {}
      );
      await assert.rejects(app.initialize(), error => error === failure);
      assert.equal(app.status().cleanupPending, false);
      assert.equal(app.status().ready, false);
      assert.equal(persistenceStatus(owner).operations, 0);
      assert.equal(persistenceStatus(owner).pools, 0);
      assert.deepEqual(persistenceStatus(owner).resources, []);
      assert.equal(close.callCount, 1);
    });
  }

  it('still cleans an independently initialized failing group', async () => {
    sinon.stub(MongoClient.prototype, 'connect').resolvesThis();
    const close = sinon.stub(MongoClient.prototype, 'close').resolves();
    const owner = { config: { datastores: { mongodb: { url: 'mongodb://fixture/standalone' } } }, log: { warn() {} } };
    const failure = new Error('standalone group failure');
    const group = definePersistenceGroup('standalone', async () => {
      await mongoDatabase(owner, 'mongodb');
      throw failure;
    });
    await assert.rejects(group.initialize(owner), error => error === failure);
    assert.equal(persistenceStatus(owner).pools, 0);
    assert.equal(close.callCount, 1);
  });
});
