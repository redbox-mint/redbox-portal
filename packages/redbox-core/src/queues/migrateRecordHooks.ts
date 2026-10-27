import { isDeepStrictEqual } from 'node:util';
import type { AgendaQueueConfig } from '../config/agendaQueue.config';
import type { PersistenceOwner } from '../persistence/owner';
import { mongoDatabase, mongoResourceDatabase } from '../persistence/runtime';
import { convertBuiltinRecordHook } from '../recordTypes/RecordHookNames';
import { validateRecordHookConfiguration, RecordHookConfigurationError } from '../services/record-hooks/coordinator';

export const QUEUED_PAYLOAD_OPERATIONS_MIGRATION_NAME = '20261025T010000-v6-persisted-queued-record-hook-operations';

/** Existing queue payloads are data, never executable service-path dispatch. */
export function convertQueuedRecordHookData(
  value: unknown,
  resolveOperation?: (name: string) => unknown
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid queued record hook data.');
  const data = value as Record<string, unknown>;
  const triggerConfiguration = convertBuiltinRecordHook(data.triggerConfiguration);
  if (resolveOperation) {
    validateRecordHookConfiguration({ hooks: { queued: { pre: [triggerConfiguration] } } }, ['queued'], hook => {
      const operation = resolveOperation(String((hook as { function?: unknown }).function ?? ''));
      if (typeof operation !== 'function')
        throw new RecordHookConfigurationError('Unregistered queued record operation');
      return (...args: unknown[]) => operation(...args);
    });
  }
  return { ...data, triggerConfiguration };
}

/** Claims/writers must be stopped. Validate all selected Mongo jobs before writing any. */
export async function migrateQueuedRecordHooks(
  owner: PersistenceOwner,
  config: AgendaQueueConfig,
  resolveOperation?: (name: string) => unknown
): Promise<number> {
  const options = config.options ?? {};
  const names = Object.entries(config.jobs)
    .filter(
      ([, job]) =>
        job.fnName === 'rdmpservice.queuedTriggerSubscriptionHandler' &&
        (job.backend ?? options.backend ?? 'mongodb') === 'mongodb'
    )
    .map(([name]) => name);
  if (!names.length) return 0;
  const db = options.db
    ? await mongoResourceDatabase(owner, 'agenda', { mongoUrl: options.db })
    : await mongoDatabase(owner, 'mongodb');
  const collection = db.collection(options.collection || 'agendaJobs');
  const pending = [];
  for (const row of await collection.find({ name: { $in: names } }).toArray()) {
    try {
      const converted = convertQueuedRecordHookData(row.data, resolveOperation);
      const original = (row.data as Record<string, unknown>).triggerConfiguration;
      if (!isDeepStrictEqual(original, converted.triggerConfiguration))
        pending.push({ id: row._id, original, converted: converted.triggerConfiguration });
    } catch {
      throw new Error(
        `Queued record hook conversion failed for job ID ${String(row._id)}; convert unsupported declarations before retrying.`
      );
    }
  }
  for (const row of pending) {
    const result = await collection.updateOne(
      { _id: row.id, 'data.triggerConfiguration': row.original },
      { $set: { 'data.triggerConfiguration': row.converted } }
    );
    if (result.matchedCount !== 1)
      throw new Error('Queued record hook changed during migration; stop other writers and retry.');
  }
  return pending.length;
}
