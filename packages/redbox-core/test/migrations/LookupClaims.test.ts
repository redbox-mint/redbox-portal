import { expect } from 'chai';
import * as sinon from 'sinon';
const migration = require('../../../../api/migrations/20261106T130000-lookup-claims');

describe('Lookup claim index migration', () => {
  it('installs a native unique index only for lookup namespaces, without deleting live claims', async () => {
    const createIndex = sinon.stub().resolves('lookup_claim_name_unique');
    const collection = sinon.stub().returns({ createIndex });
    const context = { models: { cacheentry: { tableName: 'cacheentry', getDatastore: () => ({ manager: { collection } }) } } };
    await migration.up({ context });
    expect(collection.calledOnceWithExactly('cacheentry')).to.equal(true);
    expect(createIndex.firstCall.args).to.deep.equal([{ name: 1 }, {
      name: 'lookup_claim_name_unique', unique: true,
      partialFilterExpression: { $or: [
        { name: { $gte: 'figshare-vocabulary-sync:', $lt: 'figshare-vocabulary-sync;' } },
        { name: { $gte: 'party-import:', $lt: 'party-import;' } },
      ] },
    }]);
    const duplicate = Object.assign(new Error('duplicate claim'), { code: 11000 });
    createIndex.rejects(duplicate);
    let failure: unknown;
    try { await migration.up({ context }); } catch (error) { failure = error; }
    expect(failure).to.equal(duplicate);
  });
});
