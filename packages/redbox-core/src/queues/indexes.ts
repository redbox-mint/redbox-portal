import type { PersistenceIndexInspection } from '../persistence/indexes';
import type { Db } from '@agendajs/mongo-backend';
import { mongoDatabase, mongoResourceDatabase } from '../persistence/runtime';
import type { PersistenceOwner } from '../persistence/owner';
import type { AgendaQueueConfig, AgendaQueueOptions } from '../config/agendaQueue.config';

/** Maintenance inspects only backends selected by the effective job configuration. */
export function selectedAgendaMongoOptions(config: AgendaQueueConfig): AgendaQueueOptions | undefined {
  const options = config.options ?? {};
  const jobs = Object.values(config.jobs);
  const usesMongo = jobs.length
    ? jobs.some(job => (job.backend ?? options.backend ?? 'mongodb') === 'mongodb')
    : (options.backend ?? 'mongodb') === 'mongodb';
  return usesMongo ? options : undefined;
}

const definitions = [
  { name: 'findAndLockNextJobIndex', keys: { name: 1, nextRunAt: 1, priority: -1, lockedAt: 1, disabled: 1 } },
  { name: 'name_1_disabled_1_lockedAt_1_nextRunAt_1', keys: { name: 1, disabled: 1, lockedAt: 1, nextRunAt: 1 } },
  {
    name: 'name_-1_disabled_-1_lockedAt_-1_nextRunAt_-1',
    keys: { name: -1, disabled: -1, lockedAt: -1, nextRunAt: -1 },
  },
] as const;

/** Same pinned Agenda and historical queue indexes; no job bodies or backend connection. */
export async function inspectAgendaIndexes(
  db: Db,
  collection = 'agendaJobs'
): Promise<Omit<PersistenceIndexInspection, 'datastore'>[]> {
  const info = await db.listCollections({ name: collection }).next();
  if (((info && 'options' in info ? info.options?.collation?.locale : undefined) ?? 'simple') !== 'simple')
    throw new Error('Agenda requires simple collection collation.');
  const indexes = info ? await db.collection(collection).listIndexes().toArray() : [];
  return definitions.map(definition => {
    const found = indexes.find(index => index.name === definition.name);
    const equivalent = (index: (typeof indexes)[number]) =>
      JSON.stringify(index.key) === JSON.stringify(definition.keys) &&
      !index.unique &&
      !index.sparse &&
      !index.partialFilterExpression &&
      index.expireAfterSeconds === undefined &&
      (!index.collation || index.collation.locale === 'simple');
    const index = found
      ? equivalent(found)
        ? 'ready'
        : 'conflicting'
      : indexes.some(index => equivalent(index))
        ? 'ready'
        : 'missing';
    return { collection, name: definition.name, index };
  });
}
export async function requireAgendaIndexes(db: Db, collection?: string): Promise<void> {
  if ((await inspectAgendaIndexes(db, collection)).some(report => report.index !== 'ready'))
    throw new Error('Agenda indexes are not ready. Stop writers and run explicit persistence:indexes maintenance.');
}
export async function prepareAgendaIndexes(
  owner: PersistenceOwner,
  options: AgendaQueueOptions,
  mode: 'inspect' | 'ensure'
) {
  const db = options.db
    ? await mongoResourceDatabase(owner, 'agenda', { mongoUrl: options.db })
    : await mongoDatabase(owner, 'mongodb');
  const collection = options.collection ?? 'agendaJobs';
  const before = await inspectAgendaIndexes(db, collection);
  if (mode === 'ensure') {
    if (before.some(report => report.index === 'conflicting'))
      throw new Error('Conflicting Agenda indexes; review before ensure.');
    for (const [position, definition] of definitions.entries())
      if (before[position].index === 'missing')
        await db.collection(collection).createIndex(definition.keys, { name: definition.name });
  }
  return mode === 'ensure' ? inspectAgendaIndexes(db, collection) : before;
}
