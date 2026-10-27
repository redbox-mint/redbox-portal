import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import * as runtime from '../../src/persistence/runtime';
import { prepareSessionIndexes } from '../../src/persistence/sessions/indexes';

describe('session TTL index option inspection', () => {
  const sandbox = sinon.createSandbox();
  const owner = { config: {}, log: { warn() {} } };
  const required = { name: 'expires_1', key: { expires: 1 }, expireAfterSeconds: 0 };
  let existing: Record<string, unknown>[];
  let create: sinon.SinonStub;
  beforeEach(() => {
    existing = [required];
    create = sandbox.stub().callsFake(async (key, options) => {
      existing = [{ key, ...options }];
      return options.name;
    });
    sandbox.stub(runtime, 'mongoSessionDatabase').resolves({
      listCollections: () => ({ next: async () => ({ name: 'sessions' }) }),
      collection: () => ({ listIndexes: () => ({ toArray: async () => existing }), createIndex: create }),
    } as never);
  });
  afterEach(() => sandbox.restore());
  for (const hidden of [undefined, false]) {
    it(`accepts the visible TTL index with hidden=${hidden}`, async () => {
      existing = [{ ...required, hidden }];
      assert.equal((await prepareSessionIndexes(owner, {}, 'inspect'))[0].index, 'ready');
    });
  }
  for (const change of [{ expireAfterSeconds: 60 }, { hidden: true }]) {
    it(`refuses ${JSON.stringify(change)} drift before ensure`, async () => {
      existing = [{ ...required, ...change }];
      assert.equal((await prepareSessionIndexes(owner, {}, 'inspect'))[0].index, 'conflicting');
      assert.equal((await prepareSessionIndexes(owner, {}, 'ensure'))[0].index, 'conflicting');
      assert.equal(create.callCount, 0);
      existing.push({ ...required, name: 'visible-equivalent' });
      assert.equal((await prepareSessionIndexes(owner, {}, 'inspect'))[0].index, 'conflicting');
    });
  }
  it('creates only a missing TTL index with zero expiry', async () => {
    existing = [];
    assert.equal((await prepareSessionIndexes(owner, {}, 'ensure'))[0].index, 'ready');
    assert.deepEqual(create.firstCall.args, [{ expires: 1 }, { name: 'expires_1', expireAfterSeconds: 0 }]);
  });
});
