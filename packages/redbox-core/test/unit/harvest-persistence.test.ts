import { prismaModelRow } from '../../src/persistence/prisma/modelRow';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { encodeHarvest } from '../../src/persistence/harvest/physical';
import { missingRunCounters } from '../../src/persistence/harvest/atomicCounters';
import {
  initializeHarvestPersistence,
  getHarvestRepositories,
  cleanupPersistence,
} from '../../src/persistence/runtime';
import type { HarvestRunRow } from '../../src/persistence/harvest/HarvestRepositories';

describe('J2 harvest boundaries', () => {
  const values = {
    brandId: 'opaque-brand',
    recordType: 'data',
    sourceName: 'test',
    sourceRunId: 'source',
    startedAt: '2026-10-20T00:00:00.000Z',
  };
  const counters = { totalProcessed: 1, created: 0, updated: 0, deleted: 0, unchanged: 0, failed: 1 };
  it('preserves loaded numeric coercion for JSON scalars', () => {
    for (const [value, expected] of [
      [true, 1],
      [false, 0],
      ['2', 2],
    ] as const) {
      const encoded = encodeHarvest('harvestrun', { failed: value }, true);
      assert.equal(encoded.failed, expected);
    }
    for (const value of [' 2 ', '', null, {}, [], NaN, Infinity])
      assert.throws(() => encodeHarvest('harvestrun', { failed: value }, true));
  });
  it('keeps lineage strings and BSON identity private, with numeric/boolean/default JSON parity', () => {
    const doc = encodeHarvest('harvestrun', values);
    assert.equal(doc.brandId, 'opaque-brand');
    assert.equal(doc.totalProcessed, 0);
    assert.equal(doc.metadata, null);
    assert.equal(doc.status, 'running');
    const identity = new ObjectId();
    for (const _id of [identity, identity.toHexString()]) {
      const row = prismaModelRow<HarvestRunRow>({ ...doc, _id })!;
      assert.equal(row.id, identity.toHexString());
      assert.equal(row._id, undefined);
    }
    const chunk = encodeHarvest('harvestrunchunk', {
      runId: 'opaque-run',
      brandId: 'opaque-brand',
      recordType: 'data',
      sourceRunId: 'source',
      contentHash: 'hash',
      submittedAt: values.startedAt,
    });
    assert.equal(chunk.runId, 'opaque-run');
    assert.equal(chunk.attempt, 1);
    assert.equal(chunk.duplicate, false);
  });
  it('requires event createdAt and refuses unsupported BSON without rewriting physical input', () => {
    const event = {
      runId: 'run',
      chunkId: 'chunk',
      brandId: 'brand',
      recordType: 'data',
      sourceRunId: 'source',
      harvestId: 'item',
    };
    assert.throws(() => encodeHarvest('harvestrecordevent', event));
    assert.equal(encodeHarvest('harvestrecordevent', { ...event, createdAt: values.startedAt }).status, false);
    const doc = { metadata: { date: new Date() } };
    assert.throws(() => encodeHarvest('harvestrun', { ...values, ...doc }));
    assert(doc.metadata.date instanceof Date);
  });
  it('retains missing-run counters and completion status', () => {
    const run = { ...values, status: 'completed' };
    const result = missingRunCounters(run, counters, values.startedAt, false);
    assert.equal(result.status, 'completed_with_errors');
    assert.equal(result.failed, 1);
  });
});
