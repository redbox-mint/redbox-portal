import { storage } from '../config/storage';
import {
  inspectPersistenceIndex,
  ensurePersistenceIndex,
  requirePersistenceIndex,
  PersistenceError,
} from '@researchdatabox/redbox-core';
import type { PersistenceIndex, PersistenceIndexInspection } from '@researchdatabox/redbox-core';
import { mongoDatabase, persistenceCollections, persistenceCollectionIndexes } from '@researchdatabox/redbox-core';
import {
  RECORD_SCHEMA_ARTIFACT_INDEXES,
  RECORD_SCHEMA_REFERENCE_INDEXES,
  indexKeysEqual,
  indexOptionsEqual,
} from './StorageProtocol';

export const prismaStagedStorageIndexes: readonly PersistenceIndex[] = [
  ...[
    ['recordschemaartifact', RECORD_SCHEMA_ARTIFACT_INDEXES],
    ['recordschemareference', RECORD_SCHEMA_REFERENCE_INDEXES],
  ].flatMap(([collection, indexes]: [string, typeof RECORD_SCHEMA_ARTIFACT_INDEXES]) =>
    indexes.map(index => ({
      datastore: 'redboxStorage' as const,
      collection,
      name: index.name,
      keys: index.key as Record<string, 1 | -1>,
      ...(index.unique !== undefined ? { unique: index.unique } : {}),
      ...(index.sparse !== undefined ? { sparse: index.sparse } : {}),
      ...(index.partialFilterExpression ? { partialFilter: index.partialFilterExpression } : {}),
      ...(index.expireAfterSeconds !== undefined ? { expireAfterSeconds: index.expireAfterSeconds } : {}),
      ...(index.hidden !== undefined ? { hidden: index.hidden } : {}),
      ...(index.collation !== undefined ? { collation: index.collation } : {}),
    }))
  ),
  {
    datastore: 'redboxStorage',
    collection: 'recordaudit',
    name: 'redboxOid_1_createdAt_1',
    keys: { redboxOid: 1, createdAt: 1 },
  },
];
export async function inspectPrismaStagedStorage(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  try {
    const db = await mongoDatabase(app, 'redboxStorage');
    const build = await db.command({ buildInfo: 1 });
    if (Number.parseInt(build.version, 10) < 8)
      throw new PersistenceError('server-version', 'Storage requires the qualified MongoDB 8+ runtime.');
    for (const name of [
      'record',
      'deletedrecord',
      'recordidentity',
      'recordschemaartifact',
      'recordschemareference',
      'recordaudit',
      'integrationaudit',
    ]) {
      const info = (await persistenceCollections(app, 'redboxStorage')).find(row => row.name === name);
      if ((info?.options?.collation?.locale ?? 'simple') !== 'simple')
        throw new PersistenceError(
          'model-mapping',
          'Storage collections require simple collation. Review the stored data and migrate institution extensions before startup; qualify the institution mapping before selection.'
        );
    }
    const reports = await Promise.all(storageIndexes(app).map(index => inspectPersistenceIndex(app, index)));
    // Keep the existing native schema readiness contract, including
    // persistent options outside the foundation's common descriptor subset.
    for (const [collection, required] of [
      ['recordschemaartifact', RECORD_SCHEMA_ARTIFACT_INDEXES],
      ['recordschemareference', RECORD_SCHEMA_REFERENCE_INDEXES],
    ] as const) {
      if (!(await persistenceCollections(app, 'redboxStorage')).some(row => row.name === collection)) continue;
      const existing = await persistenceCollectionIndexes(app, 'redboxStorage', collection);
      for (const index of required) {
        const relevant = existing.filter(
          candidate => candidate.name === index.name || indexKeysEqual(candidate, index)
        );
        if (relevant.some(candidate => !indexKeysEqual(candidate, index) || !indexOptionsEqual(candidate, index)))
          reports.find(report => report.collection === collection && report.name === index.name).index = 'conflicting';
      }
    }
    return reports;
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError(
      'index-inspection',
      'Cannot inspect storage readiness. Review datastore connectivity and inspection permissions.'
    );
  }
}
export async function ensurePrismaStagedStorageIndexes(app: Sails.Application): Promise<PersistenceIndexInspection[]> {
  const reports = await inspectPrismaStagedStorage(app);
  for (const report of reports)
    if (report.index === 'conflicting' || report.duplicateKeyGroups) requirePersistenceIndex(report);
  for (const index of storageIndexes(app)) await ensurePersistenceIndex(app, index);
  const after = await inspectPrismaStagedStorage(app);
  after.forEach(requirePersistenceIndex);
  return after;
}

/** Effective configured native indexes for explicit maintenance and readiness. @internal */
export function storageIndexes(app: Sails.Application): readonly PersistenceIndex[] {
  const config = (app.config.storage as { mongodb?: typeof storage.mongodb })?.mongodb ?? storage.mongodb;
  const groups: [string, import('mongodb').IndexDescription[]][] = [
    ['record', config.indices ?? []],
    ['deletedrecord', config.deletedRecordIndices ?? []],
    ['recordidentity', config.recordIdentityIndices ?? [{ key: { redboxOid: 1 }, unique: true }]],
    [
      'record',
      [
        {
          key: {
            'figshareSyncIntent.pending': 1,
            'figshareSyncIntent.readiness': 1,
            'figshareSyncIntent.requestedAt': 1,
          },
        },
      ],
    ],
  ];
  return [
    ...prismaStagedStorageIndexes,
    ...groups.flatMap(([collection, indexes]) =>
      indexes.map(index => ({
        datastore: 'redboxStorage' as const,
        collection,
        name:
          index.name ??
          Object.entries(index.key)
            .map(([key, direction]) => `${key}_${direction}`)
            .join('_'),
        keys: index.key as Record<string, 1 | -1>,
        ...(index.unique !== undefined ? { unique: index.unique } : {}),
        ...(index.sparse !== undefined ? { sparse: index.sparse } : {}),
        ...(index.partialFilterExpression ? { partialFilter: index.partialFilterExpression } : {}),
        ...(index.expireAfterSeconds !== undefined ? { expireAfterSeconds: index.expireAfterSeconds } : {}),
        ...(index.hidden !== undefined ? { hidden: index.hidden } : {}),
        ...(index.collation !== undefined ? { collation: index.collation } : {}),
      }))
    ),
  ];
}
