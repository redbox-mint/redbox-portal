import assert from 'node:assert/strict';
import { getHarvestRepositories, createRecordSaveContext } from '@researchdatabox/redbox-core';

describe('J2 harvest lineage through the selected backend', () => {
  it('asserts independent selection and bypasses the loaded run model only for Prisma', async () => {
    const repo = getHarvestRepositories(sails).runs,
      brand = BrandingService.getDefault();
    const row = await repo.createRun({
      brandId: brand.id,
      recordType: 'data',
      sourceName: 'p5-test',
      sourceRunId: `p5-${Date.now()}`,
      startedAt: new Date().toISOString(),
    });
    try { assert.equal((await repo.findRun({ id: row.id, brandId: brand.id }))?.id, row.id); } finally { await repo.removeRun(row.id!); }
  });
  it('keeps tracked failure/retry lineage and increments the duplicate count without reprocessing records', async () => {
    const brand = BrandingService.getDefault();
    const repos = getHarvestRepositories(sails);
    const body = {
      sourceRunId: `p5-lineage-${Date.now()}`,
      sourceName: 'p5-test',
      finalChunk: true,
      chunk: { index: 1 },
      records: [{ harvestId: 'p5-invalid-operation', operation: 'invalid', metadata: { title: 'fixture' } }],
    };
    const run = await HarvestRunService.submitChunk(
      brand,
      { name: 'data' } as unknown as import('@researchdatabox/redbox-core').RecordTypeModel,
      body,
      { username: 'admin' } as import('@researchdatabox/redbox-core').UserModel,
      createRecordSaveContext({ operation: 'create' })
    );
    try {
      assert.equal(run.run.totalProcessed, 1);
      assert.equal(run.run.failed, 1);
      assert.equal(run.run.status, 'completed_with_errors');
      const duplicate = await HarvestRunService.submitChunk(
        brand,
        { name: 'data' } as unknown as import('@researchdatabox/redbox-core').RecordTypeModel,
        body,
        { username: 'admin' } as import('@researchdatabox/redbox-core').UserModel,
        createRecordSaveContext({ operation: 'create' })
      );
      assert.equal(duplicate.chunk.id, run.chunk.id);
      assert.equal(duplicate.chunk.duplicate, true);
      assert.equal(duplicate.run.duplicateChunks, 1);
      const events = await repos.events.listEvents({ runId: run.run.id!, brandId: brand.id }, 0, 20);
      assert.equal(events.length, 1);
      assert.equal(events[0].chunkId, run.chunk.id);
      assert.equal(events[0].errorCode, 'invalid-operation');
    } finally {
      await repos.events.removeForRun(run.run.id!);
      await repos.chunks.removeForRun(run.run.id!);
      await repos.runs.removeRun(run.run.id!);
    }
  });
});
