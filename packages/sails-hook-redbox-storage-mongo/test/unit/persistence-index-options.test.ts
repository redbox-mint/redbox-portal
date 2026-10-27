import assert from 'node:assert/strict';
import { storageIndexes } from '../../src/persistence/preflight';

describe('configured storage index descriptors', () => {
  for (const field of ['indices', 'deletedRecordIndices', 'recordIdentityIndices']) {
    for (const ttl of [0, 60]) {
      it(`preserves native options in ${field} with TTL ${ttl}`, () => {
        const native = {
          key: { expires: 1 as const },
          name: 'institution-expiry',
          expireAfterSeconds: ttl,
          hidden: true,
          sparse: true,
          unique: true,
          collation: { locale: 'en', strength: 2, numericOrdering: true },
        };
        const app = { config: { storage: { mongodb: { [field]: [native] } } } } as unknown as Sails.Application;
        const descriptor = storageIndexes(app).find(index => index.name === native.name);
        assert.deepEqual(descriptor, {
          datastore: 'redboxStorage',
          collection: {
            indices: 'record',
            deletedRecordIndices: 'deletedrecord',
            recordIdentityIndices: 'recordidentity',
          }[field],
          name: native.name,
          keys: native.key,
          expireAfterSeconds: ttl,
          hidden: true,
          sparse: true,
          unique: true,
          collation: native.collation,
        });
      });
    }
  }
  it('retains partial filters and explicit false options', () => {
    const native = {
      key: { expires: 1 as const },
      name: 'filtered-expiry',
      hidden: false,
      unique: false,
      sparse: false,
      partialFilterExpression: { active: true },
    };
    const app = { config: { storage: { mongodb: { indices: [native] } } } } as unknown as Sails.Application;
    assert.deepEqual(
      storageIndexes(app).find(index => index.name === native.name),
      {
        datastore: 'redboxStorage',
        collection: 'record',
        name: native.name,
        keys: native.key,
        hidden: false,
        unique: false,
        sparse: false,
        partialFilter: native.partialFilterExpression,
      }
    );
  });
});
