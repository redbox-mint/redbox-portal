import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import * as runtime from '../../src/persistence/runtime';
import { inspectAgendaIndexes, prepareAgendaIndexes } from '../../src/queues/indexes';

describe('Agenda index option inspection', () => {
  const required = {
    name: 'findAndLockNextJobIndex',
    key: { name: 1, nextRunAt: 1, priority: -1, lockedAt: 1, disabled: 1 },
  };
  const sandbox = sinon.createSandbox();
  afterEach(() => sandbox.restore());
  function database(indexes: Record<string, unknown>[]) {
    return {
      listCollections: () => ({ next: async () => ({ name: 'agendaJobs' }) }),
      collection: () => ({ listIndexes: () => ({ toArray: async () => indexes }) }),
    } as unknown as Parameters<typeof inspectAgendaIndexes>[0];
  }
  for (const hidden of [undefined, false]) {
    it(`accepts a visible index with hidden=${hidden}`, async () => {
      assert.equal((await inspectAgendaIndexes(database([{ ...required, hidden }])))[0].index, 'ready');
    });
  }
  for (const change of [{ hidden: true }, { expireAfterSeconds: 60 }]) {
    for (const alias of [false, true]) {
      it(`reports ${JSON.stringify(change)} drift for ${alias ? 'equivalent keys' : 'the required name'}`, async () => {
        const drift = { ...required, ...change, ...(alias ? { name: 'institution-queue' } : {}) };
        const db = database([drift]);
        assert.equal((await inspectAgendaIndexes(db))[0].index, 'conflicting');
        assert.equal((await inspectAgendaIndexes(database([required, drift])))[0].index, 'conflicting');
        sandbox.stub(runtime, 'mongoDatabase').resolves(db as never);
        await assert.rejects(
          prepareAgendaIndexes({ config: {}, log: { warn() {} } }, {}, 'ensure'),
          /Conflicting Agenda indexes/
        );
      });
    }
  }
});
