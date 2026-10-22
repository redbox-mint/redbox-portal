const { expect } = require('chai');
const sinon = require('sinon');
import { inspect } from 'node:util';
import { runRecordRevisionBackfill } from '../../src/persistence/recordRevisionBackfill';

describe('record revision migration policy', function () {
  it('runs bounded active and tombstone batches and reports totals', async () => {
    const backfill = sinon.stub();
    backfill.withArgs('active', 1).resolves({ updated: 2, batches: 2 });
    backfill.withArgs('tombstone', 1).resolves({ updated: 1, batches: 1 });
    const times = [100, 125];
    const stats = await runRecordRevisionBackfill(backfill, { info: sinon.stub(), error: sinon.stub() }, { batchSize: 1, now: () => times.shift()! });
    expect(stats).to.deep.equal({ activeUpdated: 2, tombstonesUpdated: 1, batches: 3, durationMs: 25 });
    expect(backfill.firstCall.args[0]).to.equal('active');
    expect(backfill.secondCall.args[0]).to.equal('tombstone');
  });
  it('bounds failure details including nested causes', async () => {
    const logger = { info: sinon.stub(), error: sinon.stub() };
    let failure: unknown;
    try { await runRecordRevisionBackfill(sinon.stub().rejects(new Error('unsafe-driver-detail')), logger); }
    catch (error) { failure = error; }
    expect((failure as Error).message).to.equal('record-revision-backfill-failed');
    expect(inspect(failure, { depth: 10 })).not.to.include('unsafe-driver-detail');
    expect(logger.error.firstCall.args[0]).not.to.include('unsafe-driver-detail');
  });
  it('refuses invalid bounds before dispatching a batch', async () => {
    const backfill = sinon.stub();
    const logger = { info: sinon.stub(), error: sinon.stub() };
    try { await runRecordRevisionBackfill(backfill, logger, { batchSize: 0 }); } catch {}
    expect(backfill.called).to.equal(false);
    expect(logger.error.firstCall.args[0]).to.include('record-revision-backfill-invalid-batch-size');
  });
});
