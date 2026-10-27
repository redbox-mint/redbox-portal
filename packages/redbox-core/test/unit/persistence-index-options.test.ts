import type { PersistenceOwner } from '../../src/persistence/owner';
import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { MongoInspectionExecutor, MongoControlAdapterImpl } from '@prisma/orm-mongo/adapter/control';
import * as runtime from '../../src/persistence/runtime';
import { inspectPersistenceIndex, ensurePersistenceIndex, type PersistenceIndex } from '../../src/persistence/indexes';

describe('native persistence index options', () => {
  const sandbox = sinon.createSandbox();
  const descriptor: PersistenceIndex = {
    datastore: 'mongodb',
    collection: 'expiry',
    name: 'institution-expiry',
    keys: { expires: 1 },
    expireAfterSeconds: 60,
    hidden: true,
    sparse: true,
  };
  let existing: Record<string, unknown>[];
  let ddl: sinon.SinonStub;
  let create: sinon.SinonStub;
  beforeEach(() => {
    existing = [{ name: descriptor.name, key: descriptor.keys, expireAfterSeconds: 60, hidden: true, sparse: true }];
    sandbox.stub(runtime, 'persistenceOperation').callsFake(async (_app, run) => run());
    create = sandbox.stub().callsFake(async (keys, options) => {
      existing = [{ key: keys, ...options }];
      return options.name;
    });
    sandbox.stub(runtime, 'mongoDatabase').resolves({ collection: () => ({ createIndex: create }) } as never);
    sandbox
      .stub(MongoInspectionExecutor.prototype, 'listCollections')
      .resolves([{ name: descriptor.collection }] as never);
    sandbox.stub(MongoInspectionExecutor.prototype, 'listIndexes').callsFake(async () => existing as never);
    ddl = sandbox.stub(MongoControlAdapterImpl.prototype, 'executeDdl').resolves();
  });
  afterEach(() => sandbox.restore());
  for (const ttl of [0, 60]) {
    it(`creates missing indexes with TTL ${ttl} and hidden options intact`, async () => {
      existing = [];
      assert.equal(
        (await ensurePersistenceIndex({} as PersistenceOwner, { ...descriptor, expireAfterSeconds: ttl })).index,
        'ready'
      );
      assert.deepEqual(create.firstCall.args, [
        descriptor.keys,
        {
          name: descriptor.name,
          sparse: true,
          hidden: true,
          expireAfterSeconds: ttl,
          collation: { locale: 'simple' },
        },
      ]);
      assert.equal(ddl.callCount, 0);
    });
  }
  it('accepts matching TTL and hidden options', async () => {
    assert.equal((await inspectPersistenceIndex({} as PersistenceOwner, descriptor)).index, 'ready');
  });
  for (const drift of [
    { expireAfterSeconds: 120 },
    { expireAfterSeconds: undefined },
    { hidden: false },
    { hidden: undefined },
  ]) {
    it(`rejects existing option drift ${JSON.stringify(drift)}`, async () => {
      Object.assign(existing[0], drift);
      assert.equal((await inspectPersistenceIndex({} as PersistenceOwner, descriptor)).index, 'conflicting');
      await assert.rejects(ensurePersistenceIndex({} as PersistenceOwner, descriptor), /Required persistence index/);
      assert.equal(ddl.callCount, 0);
      assert.equal(create.callCount, 0);
    });
  }
  it('treats omitted hidden as visible and refuses an unexpected hidden index', async () => {
    const visible = { ...descriptor, hidden: undefined };
    assert.equal((await inspectPersistenceIndex({} as PersistenceOwner, visible)).index, 'conflicting');
    delete existing[0].hidden;
    assert.equal((await inspectPersistenceIndex({} as PersistenceOwner, visible)).index, 'ready');
    assert.equal(
      (await inspectPersistenceIndex({} as PersistenceOwner, { ...visible, hidden: false })).index,
      'ready'
    );
  });
  it('compares configured collation options with server defaults', async () => {
    existing[0].collation = { locale: 'en', strength: 2, numericOrdering: true, caseLevel: false, version: '57.1' };
    const collated = { ...descriptor, collation: { locale: 'en', strength: 2, numericOrdering: true } };
    assert.equal((await inspectPersistenceIndex({} as PersistenceOwner, collated)).index, 'ready');
    assert.equal(
      (
        await inspectPersistenceIndex({} as PersistenceOwner, {
          ...collated,
          collation: { ...collated.collation, numericOrdering: false },
        })
      ).index,
      'conflicting'
    );
  });
});
