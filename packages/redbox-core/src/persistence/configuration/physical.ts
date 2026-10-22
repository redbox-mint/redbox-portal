import { domainOperation } from '../domainOperation';
import { suppliedDataProperties } from '../suppliedDataProperties';
import { persistenceObjectId, persistenceObjectIdField } from '../mongodb/identity';
import { persistenceStringTimestamps } from '../timestamps';
import { ObjectId } from 'mongodb';
import { PersistenceError } from '../errors';
import { normalizePersistenceField } from '../scalars';
import { assertJsonValue } from '../cache/validation';

export type ConfigurationCollection = 'appconfig' | 'dashboardconfiguration' | 'i18nbundle' | 'i18ntranslation';
interface Field {
  type: 'string' | 'boolean' | 'number' | 'json' | 'id';
  required?: boolean;
  default?: unknown;
  nullable?: boolean;
}
export const configurationFields: Record<ConfigurationCollection, Record<string, Field>> = {
  appconfig: {
    branding: { type: 'id', required: true },
    configKey: { type: 'string', required: true },
    configData: { type: 'json' },
  },
  dashboardconfiguration: {
    branding: { type: 'string', required: true },
    revision: { type: 'number', required: true },
    configData: { type: 'json', required: true },
    provenance: { type: 'json', default: {} },
  },
  i18nbundle: {
    branding: { type: 'id' },
    locale: { type: 'string', required: true },
    displayName: { type: 'string' },
    namespace: { type: 'string', default: 'translation' },
    enabled: { type: 'boolean', default: true },
    data: { type: 'json', required: true },
    uid: { type: 'string' },
  },
  i18ntranslation: {
    branding: { type: 'id' },
    bundle: { type: 'id' },
    locale: { type: 'string', required: true },
    key: { type: 'string', required: true },
    namespace: { type: 'string', default: 'translation' },
    value: { type: 'json' },
    category: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    contentFormat: { type: 'string', nullable: true },
    uid: { type: 'string' },
  },
};
export function configurationId(value: unknown): ObjectId {
  try {
    return persistenceObjectId(value);
  } catch {
    throw new PersistenceError(
      'invalid-configuration',
      'Q identities require existing lowercase hexadecimal string keys.'
    );
  }
}
function plain(value: unknown): void {
  try {
    assertJsonValue(value);
  } catch {
    throw new PersistenceError(
      'invalid-configuration',
      'Q values require plain JSON. Inventory unsupported BSON and migrate explicitly; reads never rewrite data.'
    );
  }
}
export function encodeConfiguration(
  collection: ConfigurationCollection,
  input: object,
  update = false,
  now?: string
): Record<string, unknown> {
  const values = suppliedDataProperties(input, 'invalid-configuration');
  plain(values);
  const result: Record<string, unknown> = {};
  const invalid = (field: string): never => {
    throw new PersistenceError(
      update ? 'E_INVALID_VALUES_TO_SET' : 'E_INVALID_NEW_RECORD',
      `Invalid Q field: ${field}.`
    );
  };
  for (const [field, spec] of Object.entries(configurationFields[collection])) {
    let value: unknown;
    try {
      value = normalizePersistenceField(values[field], spec, update);
    } catch {
      invalid(field);
    }
    if (value === undefined) continue;
    result[field] = spec.type === 'id' && value !== null ? configurationId(value) : value;
  }
  for (const field of Object.keys(values)) {
    if (Object.hasOwn(configurationFields[collection], field) || ['id', 'createdAt', 'updatedAt'].includes(field))
      continue;
    if (
      ['_id', 'entries', '__proto__', 'prototype', 'constructor'].includes(field) ||
      field.startsWith('$') ||
      field.includes('.')
    )
      invalid(field);
    throw new PersistenceError(
      'invalid-configuration',
      `Undeclared Q field: ${field}. Add it to the Prisma contract before writing it.`
    );
  }
  if (collection === 'i18ntranslation') {
    if ((!update && (values.value === undefined || values.value === null)) || (update && values.value === null))
      invalid('value');
    // Callbacks run against submitted fields (with create defaults), never a merged loaded row.
    const submitted = result;
    if (submitted.locale && submitted.key)
      result.uid = `${values.branding || 'global'}:${submitted.locale}:${submitted.namespace || 'translation'}:${submitted.key}`;
  }
  if (collection === 'i18nbundle' && !update)
    result.uid = `${values.branding || 'global'}:${result.locale}:${result.namespace || 'translation'}`;
  Object.assign(result, persistenceObjectIdField(values));
  try {
    Object.assign(result, persistenceStringTimestamps(values, update, true, now));
  } catch {
    invalid('timestamp');
  }
  return result;
}
export function decodeConfiguration<T>(
  collection: ConfigurationCollection,
  row: Record<string, unknown> | null,
  fromModel = false
): T | null {
  if (!row) return null;
  if (fromModel && typeof row._id === 'string') row = { ...row, _id: configurationId(row._id) };
  if (!(row._id instanceof ObjectId))
    throw new PersistenceError('invalid-configuration', 'Unsupported Q physical identity. Inspect without rewriting.');
  const result: Record<string, unknown> = { id: row._id.toHexString() };
  for (const [field, value] of Object.entries(row)) {
    if (field === '_id') continue;
    if (['__proto__', 'prototype', 'constructor'].includes(field))
      throw new PersistenceError('invalid-configuration', 'Unsupported Q stored field.');
    if (configurationFields[collection][field]?.type === 'id') {
      if (fromModel && typeof value === 'string') {
        result[field] = configurationId(value).toHexString();
        continue;
      }
      if (value !== null && !(value instanceof ObjectId))
        throw new PersistenceError(
          'invalid-configuration',
          'Unsupported Q physical relationship. Inspect without rewriting.'
        );
      result[field] = value === null ? null : value.toHexString();
    } else result[field] = value;
  }
  plain(result);
  return result as T;
}
export const configurationOperation = <T>(operation: () => Promise<T>): Promise<T> =>
  domainOperation(
    operation,
    'configuration-operation',
    'Q operation failed. Check datastore availability and permissions.',
    'Q unique key or lease owner conflict.'
  );
