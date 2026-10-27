import { persistenceIndexPreflight } from '../indexPreflight';
import type { PersistenceIndex } from '../indexes';
import { harvestFields } from './physical';

export const harvestIndexes: readonly PersistenceIndex[] = [
  {
    datastore: 'mongodb',
    collection: 'harvestrun',
    name: 'brandId_1_recordType_1_sourceName_1_sourceRunId_1',
    keys: {
      brandId: 1,
      recordType: 1,
      sourceName: 1,
      sourceRunId: 1,
    },
    unique: true,
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrun',
    name: 'brandId_1_startedAt_1',
    keys: {
      brandId: 1,
      startedAt: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrun',
    name: 'status_1',
    keys: {
      status: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrun',
    name: 'recordType_1',
    keys: {
      recordType: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrunchunk',
    name: 'runId_1_contentHash_1_attempt_1',
    keys: {
      runId: 1,
      contentHash: 1,
      attempt: 1,
    },
    unique: true,
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrunchunk',
    name: 'runId_1_contentHash_1_status_1',
    keys: {
      runId: 1,
      contentHash: 1,
      status: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrunchunk',
    name: 'runId_1_chunkIndex_1',
    keys: {
      runId: 1,
      chunkIndex: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrunchunk',
    name: 'runId_1_submittedAt_1',
    keys: {
      runId: 1,
      submittedAt: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrecordevent',
    name: 'runId_1_brandId_1_createdAt_-1',
    keys: {
      runId: 1,
      brandId: 1,
      createdAt: -1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrecordevent',
    name: 'runId_1_brandId_1_outcome_1_createdAt_-1',
    keys: {
      runId: 1,
      brandId: 1,
      outcome: 1,
      createdAt: -1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrecordevent',
    name: 'runId_1_brandId_1_operation_1_createdAt_-1',
    keys: {
      runId: 1,
      brandId: 1,
      operation: 1,
      createdAt: -1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrecordevent',
    name: 'runId_1_brandId_1_chunkId_1_createdAt_1',
    keys: {
      runId: 1,
      brandId: 1,
      chunkId: 1,
      createdAt: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrecordevent',
    name: 'harvestId_1_recordType_1_brandId_1',
    keys: {
      harvestId: 1,
      recordType: 1,
      brandId: 1,
    },
  },
  {
    datastore: 'mongodb',
    collection: 'harvestrecordevent',
    name: 'oid_1',
    keys: {
      oid: 1,
    },
  },
];
const preflight = persistenceIndexPreflight({
  collections: { mongodb: Object.keys(harvestFields) },
  indexes: harvestIndexes,
});
export const inspectHarvestPersistence = preflight.inspect;
export const ensureHarvestPersistenceIndexes = preflight.ensure;
