import { domainOperation } from '../domainOperation';
import { suppliedDataProperties } from '../suppliedDataProperties';
import { persistenceObjectId, persistenceObjectIdField } from '../mongodb/identity';
import { persistenceStringTimestamps } from '../timestamps';
import { normalizePersistenceField } from '../scalars';
import { ObjectId } from 'mongodb';
import { assertJsonValue } from '../cache/validation';
import { PersistenceError } from '../errors';
import type { DefinitionValues, Definition } from './ReferenceRepositories';
export type ReferenceCollection =
  | 'themeconfig'
  | 'form'
  | 'recordtype'
  | 'workflowstep'
  | 'dashboardtype'
  | 'report'
  | 'namedquery'
  | 'workspacetype';
interface Field {
  type: 'string' | 'boolean' | 'json' | 'id';
  required?: boolean;
  default?: unknown;
  /** Known stored extension: no implicit Waterline create default or loaded attribute. */
  extension?: boolean;
}
/** Explicit observed R contract, including Waterline's implicit defaults. */
export const referenceFields: Record<ReferenceCollection, Record<string, Field>> = {
  themeconfig: {
    name: {
      type: 'string',
    },
    css: {
      type: 'string',
    },
  },
  form: {
    attachmentFields: { type: 'json', extension: true },
    name: {
      type: 'string',
      required: true,
    },
    branding: {
      type: 'id',
      required: true,
    },
    configuration: {
      type: 'json',
    },
  },
  recordtype: {
    key: {
      type: 'string',
    },
    name: {
      type: 'string',
      required: true,
    },
    branding: {
      type: 'id',
      required: true,
    },
    packageType: {
      type: 'string',
    },
    searchCore: {
      type: 'string',
      default: 'default',
    },
    searchFilters: {
      type: 'json',
    },
    searchable: {
      type: 'boolean',
      default: true,
    },
    transferResponsibility: {
      type: 'json',
    },
    relatedTo: {
      type: 'json',
    },
    hooks: {
      type: 'json',
    },
    dashboard: {
      type: 'json',
    },
    recordValidation: {
      type: 'json',
    },
    concurrentModification: {
      type: 'json',
    },
    recordSchema: {
      type: 'json',
    },
  },
  workflowstep: {
    name: {
      type: 'string',
      required: true,
    },
    form: {
      type: 'id',
    },
    config: {
      type: 'json',
      required: true,
    },
    starting: {
      type: 'boolean',
      required: true,
    },
    recordType: {
      type: 'id',
    },
    hidden: {
      type: 'boolean',
      default: false,
    },
  },
  dashboardtype: {
    key: {
      type: 'string',
    },
    name: {
      type: 'string',
      required: true,
    },
    branding: {
      type: 'id',
      required: true,
    },
    description: {
      type: 'string',
    },
    formatRules: {
      type: 'json',
      required: true,
    },
    tableConfig: {
      type: 'json',
      default: {},
    },
    searchable: {
      type: 'boolean',
      default: true,
    },
    system: {
      type: 'boolean',
      default: false,
    },
  },
  report: {
    key: {
      type: 'string',
    },
    name: {
      type: 'string',
      required: true,
    },
    title: {
      type: 'string',
      required: true,
    },
    branding: {
      type: 'id',
      required: true,
    },
    reportSource: {
      type: 'string',
    },
    solrQuery: {
      type: 'json',
    },
    databaseQuery: {
      type: 'json',
    },
    filter: {
      type: 'json',
      required: true,
    },
    columns: {
      type: 'json',
      required: true,
    },
  },
  namedquery: {
    key: {
      type: 'string',
    },
    name: {
      type: 'string',
      required: true,
    },
    branding: {
      type: 'id',
      required: true,
    },
    mongoQuery: {
      type: 'string',
      required: true,
    },
    queryParams: {
      type: 'string',
      required: true,
    },
    collectionName: {
      type: 'string',
      required: true,
    },
    resultObjectMapping: {
      type: 'string',
      required: true,
    },
    brandIdFieldPath: {
      type: 'string',
    },
    sort: {
      type: 'string',
    },
    expandRelations: {
      type: 'boolean',
      default: false,
    },
    relatedRecordFilters: {
      type: 'string',
    },
  },
  workspacetype: {
    label: { type: 'string', extension: true },
    name: {
      type: 'string',
      required: true,
    },
    branding: {
      type: 'id',
      required: true,
    },
    logo: {
      type: 'string',
    },
    subtitle: {
      type: 'string',
    },
    description: {
      type: 'string',
    },
    externallyProvisioned: {
      type: 'boolean',
      default: false,
    },
  },
};
export const keyedReferences: readonly ReferenceCollection[] = ['recordtype', 'dashboardtype', 'report', 'namedquery'];
export function referenceId(value: unknown): ObjectId {
  try {
    return persistenceObjectId(value);
  } catch {
    throw new PersistenceError(
      'invalid-reference',
      'Reference identities must be the existing 24-character lowercase hexadecimal strings.'
    );
  }
}
export function encodeReference(
  collection: ReferenceCollection,
  input: DefinitionValues,
  update = false
): DefinitionValues {
  const values = suppliedDataProperties(input, 'invalid-reference');
  assertPlainReferenceData(values);
  const result: DefinitionValues = {};
  const invalid = (field: string): never => {
    throw new PersistenceError(
      update ? 'E_INVALID_VALUES_TO_SET' : 'E_INVALID_NEW_RECORD',
      `Invalid reference field: ${field}.`
    );
  };
  for (const [field, spec] of Object.entries(referenceFields[collection])) {
    if (spec.extension && values[field] === undefined) continue;
    let value: unknown;
    try {
      value = normalizePersistenceField(values[field], spec, update);
    } catch {
      invalid(field);
    }
    if (value === undefined) continue;
    result[field] = spec.type === 'id' && value !== null ? referenceId(value) : value;
  }
  for (const [field, value] of Object.entries(values)) {
    if (
      value === undefined ||
      ['id', 'createdAt', 'updatedAt'].includes(field) ||
      Object.hasOwn(referenceFields[collection], field)
    )
      continue;
    if (
      field === '_id' ||
      ['__proto__', 'prototype', 'constructor'].includes(field) ||
      field.startsWith('$') ||
      field.includes('.') ||
      (collection === 'recordtype' && field === 'workflowSteps')
    )
      throw new PersistenceError(
        'invalid-reference',
        'Use explicit reference relationship operations and string IDs; raw identity or association writes are unsupported.'
      );
    throw new PersistenceError(
      'invalid-reference',
      `Undeclared reference field: ${field}. Add it to the Prisma contract before writing it.`
    );
  }
  if (!update) {
    if (keyedReferences.includes(collection)) result.key = `${values.branding}_${result.name}`;
  }
  Object.assign(result, persistenceObjectIdField(values));
  try {
    Object.assign(result, persistenceStringTimestamps(values, update));
  } catch {
    invalid('timestamp');
  }
  return result;
}
function assertPlainReferenceData(value: unknown): void {
  try {
    assertJsonValue(value);
    return;
  } catch {
    throw new PersistenceError(
      'invalid-reference',
      'Reference data contains unsupported BSON or non-JSON values. Review the stored data and migrate institution extensions before startup;, inventory the raw fields and migrate them explicitly before selecting prisma. Reads never rewrite data. See p3-r-operations.md.'
    );
  }
}
export function decodeReference<T extends Definition>(
  collection: ReferenceCollection,
  row: DefinitionValues | null,
  fromModel = false
): T | null {
  if (!row) return null;
  const result: DefinitionValues = {};
  if (row._id instanceof ObjectId) result.id = row._id.toHexString();
  else if (fromModel && typeof row._id === 'string') result.id = referenceId(row._id).toHexString();
  else
    throw new PersistenceError(
      'invalid-reference',
      'Reference data has an unsupported physical identity; inspect the collection without rewriting it.'
    );
  for (const [field, value] of Object.entries(row)) {
    if (['__proto__', 'prototype', 'constructor'].includes(field))
      throw new PersistenceError(
        'invalid-reference',
        'Unsupported stored reference field; inspect and migrate it explicitly.'
      );
    if (field === 'createdAt' || field === 'updatedAt') result[field] = value;
    else if (Object.hasOwn(referenceFields[collection], field)) {
      if (referenceFields[collection][field].type === 'id') {
        if (fromModel && typeof value === 'string') {
          result[field] = referenceId(value).toHexString();
          continue;
        }
        if (value !== null && !(value instanceof ObjectId))
          throw new PersistenceError(
            'invalid-reference',
            'Reference data has an unsupported physical relationship; inspect the collection without rewriting it.'
          );
        result[field] = value === null ? null : value.toHexString();
      } else result[field] = value;
    } else if (field !== '_id') result[field] = value;
  }
  assertPlainReferenceData(result);
  return result as T;
}
export const referenceOperation = <T>(operation: () => Promise<T>): Promise<T> =>
  domainOperation(
    operation,
    'reference-operation',
    'Reference operation failed. Check datastore availability and permissions.',
    'A reference definition with this key already exists.'
  );
