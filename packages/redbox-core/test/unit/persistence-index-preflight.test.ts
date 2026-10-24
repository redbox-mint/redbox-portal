import type { PersistenceOwner } from '../../src/persistence/owner';
import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import * as runtime from '../../src/persistence/runtime';
import * as indexes from '../../src/persistence/indexes';
import * as catalog from '../../src/persistence/prisma/catalog';
import { persistenceIndexPreflight } from '../../src/persistence/indexPreflight';

/** A late failure must leave earlier, otherwise safe indexes untouched. */
describe('shared persistence index barrier', () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => sandbox.restore());
  it('refuses all DDL when the last inspected index conflicts or its audit finds duplicates', async () => {
    sandbox.stub(runtime, 'persistenceOperation').callsFake(async (_app, run) => run());
    sandbox.stub(runtime, 'mongoDatabase').resolves({ command: async () => ({ version: '9.0.4' }) } as never);
    sandbox.stub(catalog, 'persistenceCollections').resolves([]);
    const inspect = sandbox.stub(indexes, 'inspectPersistenceIndex');
    const ensure = sandbox.stub(indexes, 'ensurePersistenceIndex');
    const descriptors: indexes.PersistenceIndex[] = ['first', 'last'].map(name => ({
      datastore: 'mongodb',
      collection: name,
      name,
      keys: { key: 1 },
      unique: true,
    }));
    for (const failure of ['conflict', 'audit']) {
      inspect.reset();
      inspect.callsFake(async (_app, index) => ({
        ...index,
        index: index.name === 'last' && failure === 'conflict' ? 'conflicting' : 'missing',
      }));
      const preflight = persistenceIndexPreflight({
        collections: { mongodb: ['first', 'last'] },
        indexes: descriptors,
        audit: async (_app, reports) => {
          if (failure === 'audit') reports[1].duplicateKeyGroups = 1;
        },
      });
      await assert.rejects(preflight.ensure({} as PersistenceOwner), /Required persistence index/);
      assert.equal(inspect.callCount, 2);
      assert.equal(ensure.callCount, 0);
    }
  });
});
