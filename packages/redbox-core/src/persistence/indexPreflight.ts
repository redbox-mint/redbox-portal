import type { PersistenceOwner } from './owner';
import type { LogicalDatastore } from './types';
import type { PersistenceIndex, PersistenceIndexInspection } from './indexes';
import { inspectPersistenceIndex, ensurePersistenceIndex, requirePersistenceIndex } from './indexes';
import { mongoDatabase, persistenceOperation } from './runtime';
import { PersistenceError } from './errors';

/** The only retained native readiness command: RC19 has no server-version API. */
export async function inspectPersistenceCollections(
  app: PersistenceOwner,
  datastore: LogicalDatastore,
  names: readonly string[]
): Promise<number> {
  const db = await mongoDatabase(app, datastore);
  const major = Number.parseInt(String((await db.command({ buildInfo: 1 })).version), 10);
  if (!Number.isInteger(major) || major < 8)
    throw new PersistenceError('server-version', 'Persistence requires the qualified MongoDB 8+ runtime.');
  const { persistenceCollections } = require('./prisma/catalog') as typeof import('./prisma/catalog');
  const collections = await persistenceCollections(app, datastore);
  for (const name of names)
    if ((collections.find(row => row.name === name)?.options?.collation?.locale ?? 'simple') !== 'simple')
      throw new PersistenceError(
        'collation',
        'Persistence requires simple collection collation. Review existing collections before startup.'
      );
  return major;
}

/** Inspect every scope before DDL; startup calls inspect only. Legacy constraints are never weakened. */
export function persistenceIndexPreflight(options: {
  collections: Partial<Record<LogicalDatastore, readonly string[]>>;
  indexes: readonly PersistenceIndex[];
  alternative?: (index: PersistenceIndex) => PersistenceIndex;
  audit?: (app: PersistenceOwner, reports: PersistenceIndexInspection[]) => Promise<void>;
}) {
  const inspect = (app: PersistenceOwner): Promise<PersistenceIndexInspection[]> =>
    persistenceOperation(app, async () => {
      try {
        for (const [datastore, names] of Object.entries(options.collections))
          await inspectPersistenceCollections(app, datastore as LogicalDatastore, names);
        const reports: PersistenceIndexInspection[] = [];
        for (const index of options.indexes) {
          let report = await inspectPersistenceIndex(app, index);
          if (report.index === 'conflicting' && options.alternative) {
            const legacy = await inspectPersistenceIndex(app, options.alternative(index));
            if (legacy.index === 'ready') report = legacy;
          }
          reports.push(report);
        }
        await options.audit?.(app, reports);
        return reports;
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError(
          'index-inspection',
          'Cannot inspect persistence readiness. Review datastore connectivity and inspection permissions.'
        );
      }
    });
  const ensure = async (app: PersistenceOwner): Promise<PersistenceIndexInspection[]> => {
    const before = await inspect(app);
    for (const report of before)
      if (report.index === 'conflicting' || report.duplicateKeyGroups) requirePersistenceIndex(report);
    for (const [position, index] of options.indexes.entries())
      if (before[position].index === 'missing') await ensurePersistenceIndex(app, index);
    const after = await inspect(app);
    after.forEach(requirePersistenceIndex);
    return after;
  };
  return { inspect, ensure };
}
