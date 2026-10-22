import { domainOperation } from '../domainOperation';
import { suppliedDataProperties } from '../suppliedDataProperties';
import { persistenceObjectId, persistenceObjectIdField } from '../mongodb/identity';
import { persistenceStringTimestamps } from '../timestamps';
import { ObjectId } from 'mongodb';
import { PersistenceError } from '../errors';
import { normalizePersistenceField } from '../scalars';
import { assertJsonValue } from '../cache/validation';

export type ProgressCollection = 'asynchprogress' | 'workspaceasync';
interface Field {
  type: 'string' | 'number' | 'json' | 'id';
  required?: boolean;
  default?: unknown;
  nullable?: boolean;
}
export const progressFields: Record<ProgressCollection, Record<string, Field>> = {
  asynchprogress: {
    name: { type: 'string', required: true },
    branding: { type: 'id', required: true },
    date_started: { type: 'string' },
    date_completed: { type: 'string' },
    started_by: { type: 'string', required: true },
    currentIdx: { type: 'number' },
    targetIdx: { type: 'number' },
    status: { type: 'string' },
    message: { type: 'string' },
    metadata: { type: 'json' },
    relatedRecordId: { type: 'string' },
    taskType: { type: 'string' },
  },
  workspaceasync: {
    name: { type: 'string', required: true },
    recordType: { type: 'string', required: true },
    date_started: { type: 'string' },
    date_completed: { type: 'string' },
    started_by: { type: 'string', required: true },
    service: { type: 'string', required: true },
    method: { type: 'string', required: true },
    args: { type: 'json', required: true },
    status: { type: 'string' },
    message: { type: 'json' },
  },
};
export function progressId(value: unknown): ObjectId {
  try {
    return persistenceObjectId(value);
  } catch {
    throw new PersistenceError('invalid-progress', 'J1 identities require existing lowercase hexadecimal string keys.');
  }
}
function plain(value: unknown): void {
  try {
    assertJsonValue(value);
  } catch {
    throw new PersistenceError(
      'invalid-progress',
      'J1 values require plain JSON. Inventory unsupported BSON and migrate explicitly; reads never rewrite data.'
    );
  }
}
export function encodeProgress(collection: ProgressCollection, input: object, update = false): Record<string, unknown> {
  const values = suppliedDataProperties(input, 'invalid-progress');
  plain(values);
  const result: Record<string, unknown> = {};
  const invalid = (field: string): never => {
    throw new PersistenceError(
      update ? 'E_INVALID_VALUES_TO_SET' : 'E_INVALID_NEW_RECORD',
      `Invalid J1 field: ${field}.`
    );
  };
  for (const [field, spec] of Object.entries(progressFields[collection])) {
    let value: unknown;
    try {
      value = normalizePersistenceField(values[field], spec, update);
    } catch {
      invalid(field);
    }
    if (value === undefined) continue;
    result[field] = spec.type === 'id' && value !== null ? progressId(value) : value;
  }
  for (const [field, value] of Object.entries(values)) {
    if (Object.hasOwn(progressFields[collection], field) || ['id', 'createdAt', 'updatedAt'].includes(field)) continue;
    if (
      ['_id', '__proto__', 'prototype', 'constructor'].includes(field) ||
      field.startsWith('$') ||
      field.includes('.')
    )
      invalid(field);
    plain(value);
    result[field] = structuredClone(value);
  }
  Object.assign(result, persistenceObjectIdField(values));
  try {
    Object.assign(result, persistenceStringTimestamps(values, update));
  } catch {
    invalid('timestamp');
  }
  return result;
}
export function decodeProgress<T>(
  collection: ProgressCollection,
  row: Record<string, unknown> | null,
  fromModel = false
): T | null {
  if (!row) return null;
  if (fromModel && typeof row._id === 'string') row = { ...row, _id: progressId(row._id) };
  if (!(row._id instanceof ObjectId))
    throw new PersistenceError('invalid-progress', 'Unsupported J1 physical identity. Inspect without rewriting.');
  const result: Record<string, unknown> = { id: row._id.toHexString() };
  for (const [field, value] of Object.entries(row)) {
    if (field === '_id') continue;
    if (['__proto__', 'prototype', 'constructor'].includes(field))
      throw new PersistenceError('invalid-progress', 'Unsupported J1 stored field.');
    if (progressFields[collection][field]?.type === 'id') {
      if (fromModel && typeof value === 'string') {
        result[field] = progressId(value).toHexString();
        continue;
      }
      if (value !== null && !(value instanceof ObjectId))
        throw new PersistenceError(
          'invalid-progress',
          'Unsupported J1 physical relationship. Inspect without rewriting.'
        );
      result[field] = value === null ? null : value.toHexString();
    } else result[field] = value;
  }
  plain(result);
  return result as T;
}
export const progressOperation = <T>(operation: () => Promise<T>): Promise<T> =>
  domainOperation(
    operation,
    'progress-operation',
    'J1 operation failed. Check datastore availability and permissions.',
    'J1 unique key or lease owner conflict.'
  );
