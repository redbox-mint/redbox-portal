import type { Db, IndexDescription } from 'mongodb';

// Shared by model metadata and explicit Mongo provisioning: Waterline does not
// create compound indexes from the model's indexes metadata in safe mode.
export const HARVEST_RUN_INDEXES: IndexDescription[] = [
  { key: { status: 1, completedAt: 1, _id: 1 } },
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

/** Read-only deployment check. Never repairs data or changes indexes. */
export async function preflightHarvestRunIndexes(db: Db): Promise<string[]> {
  const issues: string[] = [];
  for (const [name, definitions] of [
    ['harvestrun', HARVEST_RUN_INDEXES],
    ['harvestrunchunk', HARVEST_CHUNK_INDEXES],
    ['harvestrecordevent', HARVEST_EVENT_INDEXES],
  ] as const) {
    // A fresh installation may not have these collections yet.
    if (!(await db.listCollections({ name }, { nameOnly: true }).hasNext())) continue;
    const collection = db.collection(name);
    const existing = await collection.indexes();
    for (const definition of definitions) {
      const key = Object.fromEntries(Object.entries(definition.key));
      const keyEntries = JSON.stringify(Object.entries(key));
      const indexName = Object.entries(key)
        .map(([field, direction]) => `${field}_${direction}`)
        .join('_');
      const conflicts = existing.filter(index => {
        const sameKey = JSON.stringify(Object.entries(index.key)) === keyEntries;
        return (
          (index.name === indexName && !sameKey) ||
          (sameKey &&
            (index.name !== indexName ||
              Boolean(index.unique) !== Boolean(definition.unique) ||
              Boolean(index.sparse) ||
              Boolean(index.partialFilterExpression) ||
              Boolean(index.collation)))
        );
      });
      if (conflicts.length) issues.push(`${name}: conflicting index options for ${indexName}`);
      if (!definition.unique) continue;
      const groupKey = Object.fromEntries(Object.keys(key).map(field => [field, { $ifNull: [`$${field}`, null] }]));
      const duplicates = await collection
        .aggregate<{
          groups: number;
        }>(
          [{ $group: { _id: groupKey, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $count: 'groups' }],
          { allowDiskUse: true }
        )
        .toArray();
      if (duplicates.length) issues.push(`${name}: ${duplicates[0].groups} duplicate groups for ${indexName}`);
    }
  }
  return issues;
}

export async function ensureHarvestRunIndexes(db: Db): Promise<void> {
  // Mongo createIndexes is idempotent. Conflicting options or duplicate unique
  // keys reject initialization; existing indexes and records are never dropped.
  await db.collection('harvestrun').createIndexes(HARVEST_RUN_INDEXES);
  await db.collection('harvestrunchunk').createIndexes(HARVEST_CHUNK_INDEXES);
  await db.collection('harvestrecordevent').createIndexes(HARVEST_EVENT_INDEXES);
}
