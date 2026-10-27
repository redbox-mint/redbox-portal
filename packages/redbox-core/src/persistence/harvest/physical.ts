import { domainOperation } from '../domainOperation';
import { suppliedDataProperties } from '../suppliedDataProperties';
import { persistenceObjectId, persistenceObjectIdField } from '../mongodb/identity';
import { persistenceStringTimestamps } from '../timestamps';
import { ObjectId } from 'mongodb';
import { PersistenceError } from '../errors';
import { assertJsonValue } from '../cache/validation';
import { normalizePersistenceField } from '../scalars';

export type HarvestCollection = 'harvestrun' | 'harvestrunchunk' | 'harvestrecordevent';
interface Field {
  type: 'string' | 'boolean' | 'number' | 'json' | 'id';
  required?: boolean;
  default?: unknown;
  nullable?: boolean;
}
export const harvestFields: Record<HarvestCollection, Record<string, Field>> = {
  harvestrun: {
    sourceRunId: {
      type: 'string',
      required: true,
    },
    brandId: {
      type: 'string',
      required: true,
    },
    recordType: {
      type: 'string',
      required: true,
    },
    sourceName: {
      type: 'string',
      required: true,
    },
    sourceUri: {
      type: 'string',
    },
    status: {
      type: 'string',
      default: 'running',
    },
    startedAt: {
      type: 'string',
      required: true,
    },
    completedAt: {
      type: 'string',
    },
    startedBy: {
      type: 'string',
    },
    lastChunkAt: {
      type: 'string',
    },
    totalProcessed: {
      type: 'number',
      default: 0,
    },
    created: {
      type: 'number',
      default: 0,
    },
    updated: {
      type: 'number',
      default: 0,
    },
    deleted: {
      type: 'number',
      default: 0,
    },
    unchanged: {
      type: 'number',
      default: 0,
    },
    failed: {
      type: 'number',
      default: 0,
    },
    chunksProcessed: {
      type: 'number',
      default: 0,
    },
    duplicateChunks: {
      type: 'number',
      default: 0,
    },
    metadata: {
      type: 'json',
    },
  },
  harvestrunchunk: {
    runId: {
      type: 'string',
      required: true,
    },
    brandId: {
      type: 'string',
      required: true,
    },
    recordType: {
      type: 'string',
      required: true,
    },
    sourceRunId: {
      type: 'string',
      required: true,
    },
    contentHash: {
      type: 'string',
      required: true,
    },
    attempt: {
      type: 'number',
      default: 1,
    },
    chunkIndex: {
      type: 'number',
    },
    chunkLabel: {
      type: 'string',
    },
    totalExpected: {
      type: 'number',
    },
    status: {
      type: 'string',
      default: 'processing',
    },
    recordCount: {
      type: 'number',
      default: 0,
    },
    totalProcessed: {
      type: 'number',
      default: 0,
    },
    created: {
      type: 'number',
      default: 0,
    },
    updated: {
      type: 'number',
      default: 0,
    },
    deleted: {
      type: 'number',
      default: 0,
    },
    unchanged: {
      type: 'number',
      default: 0,
    },
    failed: {
      type: 'number',
      default: 0,
    },
    duplicate: {
      type: 'boolean',
      default: false,
    },
    submittedAt: {
      type: 'string',
      required: true,
    },
    completedAt: {
      type: 'string',
    },
    errorMessage: {
      type: 'string',
    },
    responseSummary: {
      type: 'json',
    },
  },
  harvestrecordevent: {
    runId: {
      type: 'string',
      required: true,
    },
    chunkId: {
      type: 'string',
      required: true,
    },
    brandId: {
      type: 'string',
      required: true,
    },
    recordType: {
      type: 'string',
      required: true,
    },
    sourceRunId: {
      type: 'string',
      required: true,
    },
    harvestId: {
      type: 'string',
      required: true,
    },
    oid: {
      type: 'string',
    },
    operation: {
      type: 'string',
      default: 'upsert',
    },
    outcome: {
      type: 'string',
      default: 'failed',
    },
    status: {
      type: 'boolean',
      default: false,
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'string',
    },
    errorCode: {
      type: 'string',
    },
    recordSnapshot: {
      type: 'json',
    },
    createdAt: {
      type: 'string',
      required: true,
    },
  },
};
export function harvestId(value: unknown): ObjectId {
  try {
    return persistenceObjectId(value);
  } catch {
    throw new PersistenceError('invalid-harvest', 'J2 identities require existing lowercase hexadecimal string keys.');
  }
}
function plain(value: unknown): void {
  try {
    assertJsonValue(value);
  } catch {
    throw new PersistenceError(
      'invalid-harvest',
      'J2 values require plain JSON. Inventory unsupported BSON and migrate explicitly; reads never rewrite data.'
    );
  }
}
export function encodeHarvest(
  collection: HarvestCollection,
  input: object,
  update = false,
  now?: string
): Record<string, unknown> {
  const values = suppliedDataProperties(input, 'invalid-harvest');
  plain(values);
  const result: Record<string, unknown> = {};
  const invalid = (field: string): never => {
    throw new PersistenceError(
      update ? 'E_INVALID_VALUES_TO_SET' : 'E_INVALID_NEW_RECORD',
      `Invalid J2 field: ${field}.`
    );
  };
  for (const [field, spec] of Object.entries(harvestFields[collection])) {
    let value: unknown;
    try {
      value = normalizePersistenceField(values[field], spec, update);
    } catch {
      invalid(field);
    }
    if (value === undefined) continue;
    result[field] = spec.type === 'id' && value !== null ? harvestId(value) : value;
  }
  for (const [field, value] of Object.entries(values)) {
    if (Object.hasOwn(harvestFields[collection], field) || ['id', 'createdAt', 'updatedAt'].includes(field)) continue;
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
    Object.assign(result, persistenceStringTimestamps(values, update, collection !== 'harvestrecordevent', now));
  } catch {
    invalid('timestamp');
  }
  return result;
}

export const harvestOperation = <T>(operation: () => Promise<T>): Promise<T> =>
  domainOperation(
    operation,
    'harvest-operation',
    'J2 operation failed. Check datastore availability and permissions.',
    'J2 unique key or lease owner conflict.'
  );
