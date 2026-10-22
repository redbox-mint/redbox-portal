import { domainOperation } from '../domainOperation';
import { suppliedDataProperties } from '../suppliedDataProperties';
import { persistenceObjectId, persistenceObjectIdField } from '../mongodb/identity';
import { persistenceStringTimestamps } from '../timestamps';
import { ObjectId } from 'mongodb';
import { PersistenceError } from '../errors';
import { assertJsonValue } from '../cache/validation';
import { normalizePersistenceField } from '../scalars';

export type SiemCollection = 'securityevent' | 'siemdeliveryattempt';
interface Field {
  type: 'string' | 'boolean' | 'number' | 'json' | 'id';
  required?: boolean;
  default?: unknown;
  nullable?: boolean;
}
export const siemFields: Record<SiemCollection, Record<string, Field>> = {
  securityevent: {
    eventId: {
      type: 'string',
      required: true,
    },
    brandId: {
      type: 'string',
      required: true,
    },
    portalId: {
      type: 'string',
    },
    eventType: {
      type: 'string',
      required: true,
    },
    category: {
      type: 'string',
      required: true,
    },
    severity: {
      type: 'string',
      required: true,
    },
    occurredAt: {
      type: 'string',
      required: true,
    },
    source: {
      type: 'string',
      required: true,
    },
    actor: {
      type: 'json',
    },
    subject: {
      type: 'json',
    },
    resource: {
      type: 'json',
    },
    requestContext: {
      type: 'json',
    },
    payload: {
      type: 'json',
    },
    correlationId: {
      type: 'string',
    },
    traceId: {
      type: 'string',
    },
    deliveryState: {
      type: 'string',
      required: true,
    },
    leaseToken: {
      type: 'string',
      nullable: true,
    },
    leaseExpiresAt: {
      type: 'string',
      nullable: true,
    },
    nextEligibleAt: {
      type: 'string',
      nullable: true,
    },
    terminalAt: {
      type: 'string',
      nullable: true,
    },
    destinationStates: {
      type: 'json',
    },
  },
  siemdeliveryattempt: {
    eventId: {
      type: 'string',
      required: true,
    },
    brandId: {
      type: 'string',
      required: true,
    },
    destinationId: {
      type: 'string',
      required: true,
    },
    adapterType: {
      type: 'string',
      required: true,
    },
    attemptNumber: {
      type: 'number',
      required: true,
    },
    leaseToken: {
      type: 'string',
    },
    status: {
      type: 'string',
      required: true,
    },
    startedAt: {
      type: 'string',
      required: true,
    },
    completedAt: {
      type: 'string',
    },
    durationMs: {
      type: 'number',
    },
    httpStatusCode: {
      type: 'number',
    },
    responseSummary: {
      type: 'json',
    },
    errorSummary: {
      type: 'json',
    },
  },
};
export function siemId(value: unknown): ObjectId {
  try {
    return persistenceObjectId(value);
  } catch {
    throw new PersistenceError('invalid-siem', 'J3 identities require existing lowercase hexadecimal string keys.');
  }
}
function plain(value: unknown): void {
  try {
    assertJsonValue(value);
  } catch {
    throw new PersistenceError(
      'invalid-siem',
      'J3 values require plain JSON. Inventory unsupported BSON and migrate explicitly; reads never rewrite data.'
    );
  }
}
export function encodeSiem(collection: SiemCollection, input: object, update = false): Record<string, unknown> {
  const values = suppliedDataProperties(input, 'invalid-siem');
  plain(values);
  const result: Record<string, unknown> = {};
  const invalid = (field: string): never => {
    throw new PersistenceError(
      update ? 'E_INVALID_VALUES_TO_SET' : 'E_INVALID_NEW_RECORD',
      `Invalid J3 field: ${field}.`
    );
  };
  for (const [field, spec] of Object.entries(siemFields[collection])) {
    let value: unknown;
    try {
      value = normalizePersistenceField(values[field], spec, update);
    } catch {
      invalid(field);
    }
    if (value === undefined) continue;
    result[field] = spec.type === 'id' && value !== null ? siemId(value) : value;
  }
  for (const [field, value] of Object.entries(values)) {
    if (Object.hasOwn(siemFields[collection], field) || ['id', 'createdAt', 'updatedAt'].includes(field)) continue;
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
export const siemOperation = <T>(operation: () => Promise<T>): Promise<T> =>
  domainOperation(
    operation,
    'siem-operation',
    'J3 operation failed. Check datastore availability and permissions.',
    'J3 unique key conflict.'
  );
