import type { Db, IndexDescription } from 'mongodb';

// Shared by model metadata and explicit Mongo provisioning: Waterline does not
// create compound indexes from the model's indexes metadata in safe mode.
export const HARVEST_RUN_INDEXES: IndexDescription[] = [
  { key: { brandId: 1, recordType: 1, sourceName: 1, sourceRunId: 1 }, unique: true },
  { key: { brandId: 1, startedAt: -1, _id: -1 } },
  { key: { status: 1 } },
  { key: { recordType: 1 } },
];

export const HARVEST_CHUNK_INDEXES: IndexDescription[] = [
  { key: { runId: 1, contentHash: 1, attempt: 1 }, unique: true },
  { key: { runId: 1, contentHash: 1, status: 1 } },
  { key: { runId: 1, chunkIndex: 1 } },
  { key: { runId: 1, brandId: 1, submittedAt: 1, _id: 1 } },
];

export const HARVEST_EVENT_INDEXES: IndexDescription[] = [
  { key: { runId: 1, brandId: 1, createdAt: -1, _id: -1 } },
  { key: { runId: 1, brandId: 1, outcome: 1, createdAt: -1, _id: -1 } },
  { key: { runId: 1, brandId: 1, operation: 1, createdAt: -1, _id: -1 } },
  { key: { runId: 1, brandId: 1, chunkId: 1, createdAt: 1, _id: 1 } },
  { key: { runId: 1, brandId: 1, harvestId: 1, createdAt: -1, _id: -1 } },
  { key: { harvestId: 1, recordType: 1, brandId: 1 } },
  { key: { oid: 1 } },
];

export async function ensureHarvestRunIndexes(db: Db): Promise<void> {
  // Mongo createIndexes is idempotent. Conflicting options or duplicate unique
  // keys reject initialization; existing indexes and records are never dropped.
  await db.collection('harvestrun').createIndexes(HARVEST_RUN_INDEXES);
  await db.collection('harvestrunchunk').createIndexes(HARVEST_CHUNK_INDEXES);
  await db.collection('harvestrecordevent').createIndexes(HARVEST_EVENT_INDEXES);
}
