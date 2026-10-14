const { expect } = require('chai');
const sinon = require('sinon');

import { backfillRecordRevisions } from '../../src/migrations/recordRevisionBackfill';

class FakeCollection {
  constructor(
    public readonly kind: 'active' | 'tombstone',
    public readonly documents: Array<Record<string, any>>,
    private failAfterOperations?: number,
    private beforeFirstBulkWrite?: () => void
  ) {}

  private matches(document: Record<string, any>, filter: Record<string, any>): boolean {
    if (Array.isArray(filter.$and) && !filter.$and.every((item: Record<string, any>) => this.matches(document, item))) {
      return false;
    }
    if (Array.isArray(filter.$or) && !filter.$or.some((item: Record<string, any>) => this.matches(document, item))) {
      return false;
    }
    if (filter._id !== undefined) {
      if (filter._id && typeof filter._id === 'object' && Array.isArray(filter._id.$in)) {
        if (!filter._id.$in.includes(document._id)) return false;
      } else if (document._id !== filter._id) {
        return false;
      }
    }
    if (filter.revision === null && document.revision != null) return false;
    if (filter.lifecycleState === null && document.lifecycleState != null) return false;
    return true;
  }

  find(filter: Record<string, any>) {
    const matching = () => this.documents.filter(document => this.matches(document, filter));
    return {
      limit: (limit: number) => ({
        toArray: async () =>
          matching()
            .slice(0, limit)
            .map(document => ({
              _id: document._id,
              revision: document.revision,
              lifecycleState: document.lifecycleState,
            })),
      }),
    };
  }

  async bulkWrite(operations: any[]) {
    if (this.beforeFirstBulkWrite) {
      const callback = this.beforeFirstBulkWrite;
      this.beforeFirstBulkWrite = undefined;
      callback();
    }
    let modifiedCount = 0;
    for (const operation of operations) {
      const document = this.documents.find(item => this.matches(item, operation.updateOne.filter));
      if (document) {
        const set = operation.updateOne.update[0].$set;
        for (const [field, expression] of Object.entries(set) as Array<[string, any]>) {
          if (expression?.$ifNull && document[field] == null) {
            document[field] = expression.$ifNull[1];
          }
        }
        modifiedCount += 1;
      }
      if (this.failAfterOperations !== undefined && modifiedCount >= this.failAfterOperations) {
        this.failAfterOperations = undefined;
        throw new Error('unsafe-driver-detail-oid-123');
      }
    }
    return { modifiedCount };
  }

  async countDocuments(filter: Record<string, any>) {
    return this.documents.some(document => this.matches(document, filter)) ? 1 : 0;
  }
}

function fakeDb(active: FakeCollection, tombstones: FakeCollection): any {
  return {
    collection: (name: string) => (name === 'record' ? active : tombstones),
  };
}

describe('record revision migration', function () {
  it('backfills active/tombstone fields once without touching record content', async function () {
    const activeDocument = {
      _id: 'a1',
      redboxOid: 'active-1',
      metadata: { title: 'Keep me' },
      workflow: { stage: 'draft' },
      authorization: { edit: ['user'] },
      lastSaveDate: '2020-01-01T00:00:00.000Z',
    };
    const tombstoneDocument = {
      _id: 't1',
      redboxOid: 'deleted-1',
      deletedRecordMetadata: { metadata: { title: 'Keep tombstone' } },
      dateDeleted: '2020-01-02T00:00:00.000Z',
    };
    const active = new FakeCollection('active', [activeDocument]);
    const tombstones = new FakeCollection('tombstone', [tombstoneDocument]);
    const logger = { info: sinon.stub(), error: sinon.stub() };
    const times = [100, 125];

    const first = await backfillRecordRevisions(fakeDb(active, tombstones), 'record', 'deletedrecord', logger, {
      batchSize: 1,
      now: () => times.shift() ?? 125,
    });

    expect(first).to.deep.equal({ activeUpdated: 1, tombstonesUpdated: 1, batches: 2, durationMs: 25 });
    expect(activeDocument).to.deep.equal({
      _id: 'a1',
      redboxOid: 'active-1',
      revision: 0,
      metadata: { title: 'Keep me' },
      workflow: { stage: 'draft' },
      authorization: { edit: ['user'] },
      lastSaveDate: '2020-01-01T00:00:00.000Z',
    });
    expect(tombstoneDocument).to.deep.equal({
      _id: 't1',
      redboxOid: 'deleted-1',
      revision: 0,
      lifecycleState: 'deleted',
      deletedRecordMetadata: { metadata: { title: 'Keep tombstone' } },
      dateDeleted: '2020-01-02T00:00:00.000Z',
    });

    const repeated = await backfillRecordRevisions(fakeDb(active, tombstones), 'record', 'deletedrecord', logger, {
      now: () => 200,
    });
    expect(repeated).to.deep.equal({ activeUpdated: 0, tombstonesUpdated: 0, batches: 0, durationMs: 0 });
  });

  it('resumes safely after a partially-applied tombstone batch', async function () {
    const active = new FakeCollection('active', [{ _id: 'a1' }]);
    const tombstones = new FakeCollection('tombstone', [{ _id: 't1' }, { _id: 't2' }], 1);
    const logger = { info: sinon.stub(), error: sinon.stub() };

    let failure: Error | undefined;
    try {
      await backfillRecordRevisions(fakeDb(active, tombstones), 'record', 'deletedrecord', logger);
    } catch (error) {
      failure = error as Error;
    }
    expect(failure?.message).to.equal('record-revision-backfill-failed');
    expect(logger.error.firstCall.args[0]).to.not.include('unsafe-driver-detail');
    expect(active.documents[0].revision).to.equal(0);
    expect(tombstones.documents[0]).to.include({ revision: 0, lifecycleState: 'deleted' });

    const resumed = await backfillRecordRevisions(fakeDb(active, tombstones), 'record', 'deletedrecord', logger);
    expect(resumed.activeUpdated).to.equal(0);
    expect(resumed.tombstonesUpdated).to.equal(1);
    expect(tombstones.documents).to.deep.include.members([
      { _id: 't1', revision: 0, lifecycleState: 'deleted' },
      { _id: 't2', revision: 0, lifecycleState: 'deleted' },
    ]);
  });

  it('does not overwrite a field installed after batch projection', async function () {
    const active = new FakeCollection('active', []);
    const tombstoneDocument: Record<string, any> = { _id: 't1' };
    const tombstones = new FakeCollection('tombstone', [tombstoneDocument], undefined, () => {
      tombstoneDocument.revision = 17;
    });
    const logger = { info: sinon.stub(), error: sinon.stub() };

    const result = await backfillRecordRevisions(fakeDb(active, tombstones), 'record', 'deletedrecord', logger);

    expect(result.tombstonesUpdated).to.equal(1);
    expect(tombstoneDocument).to.deep.equal({ _id: 't1', revision: 17, lifecycleState: 'deleted' });
  });

  it('logs and wraps invalid batch configuration with a bounded code', async function () {
    const active = new FakeCollection('active', []);
    const tombstones = new FakeCollection('tombstone', []);
    const logger = { info: sinon.stub(), error: sinon.stub() };

    let failure: Error | undefined;
    try {
      await backfillRecordRevisions(fakeDb(active, tombstones), 'record', 'deletedrecord', logger, { batchSize: 0 });
    } catch (error) {
      failure = error as Error;
    }

    expect(failure?.message).to.equal('record-revision-backfill-failed');
    expect(logger.error.firstCall.args[0]).to.include('record-revision-backfill-invalid-batch-size');
  });
});
