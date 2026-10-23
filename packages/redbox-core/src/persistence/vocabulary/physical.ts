import { ObjectId } from 'mongodb';
import { vocabularyFields } from './fields';
import { coercePersistenceQueryScalar } from '../scalars';
import { normalizeVocabularyFields } from './validation';
import { persistenceStringTimestamps } from '../timestamps';
import { assertJsonValue } from '../cache/validation';
import { PersistenceError } from '../errors';
import { buildInvalidNewRecordError, buildInvalidUpdateRecordError } from '../validationErrors';
import {
  normalizeVocabulary,
  normalizeEntry,
  normalizeSource,
  normalizeCategory,
  normalizeCrosswalk,
  normalizeMapping,
  normalizeSyncRun,
} from './normalization';
import type { EntryLookup, EntryRow, VocabularyPage, VocabularyValues } from './VocabularyRepositories';

function assertVocabularyData(value: unknown): void {
  try {
    assertJsonValue(value);
  } catch {
    throw new PersistenceError(
      'model-mapping',
      'Vocabulary values require plain JSON data. Review the stored data and migrate institution extensions before startup; inventory native BSON fields; reads never rewrite them.'
    );
  }
}
export function vocabularyId(value: unknown): ObjectId | string {
  // Loaded sails-mongo casts valid IDs, but an invalid string query simply misses.
  if (typeof value !== 'string')
    throw new PersistenceError('scalar-validation', 'Vocabulary identities require strings.');
  return /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : value;
}
function invalidWrite(patch: boolean, message: string): never {
  throw (patch ? buildInvalidUpdateRecordError : buildInvalidNewRecordError)(message);
}
export function prepareVocabulary(
  collection: string,
  values: VocabularyValues,
  patch: boolean,
  now?: string
): VocabularyValues {
  const fields = vocabularyFields[collection],
    result = normalizeVocabularyFields(collection, values, patch);
  for (const [field, value] of Object.entries(values)) {
    if (value === undefined || Object.hasOwn(fields, field) || ['createdAt', 'updatedAt'].includes(field)) continue;
    if (
      field === '_id' ||
      field.startsWith('$') ||
      field.includes('.') ||
      ['__proto__', 'prototype', 'constructor', 'entries', 'children'].includes(field)
    )
      invalidWrite(patch, 'Use explicit vocabulary relationship operations and plain values.');
    assertVocabularyData(value);
    result[field] = structuredClone(value);
  }
  Object.assign(result, persistenceStringTimestamps(values, patch, true, now));
  return result;
}
export async function encodeVocabulary(
  collection: string,
  values: VocabularyValues,
  patch: boolean,
  findEntry: (lookup: EntryLookup) => Promise<EntryRow | null>,
  findBrand: (name: string) => Promise<{ id: string } | null>
): Promise<VocabularyValues> {
  const prepared = prepareVocabulary(collection, values, patch);
  return encodePreparedVocabulary(collection, prepared, patch, findEntry, findBrand);
}
export async function encodePreparedVocabulary(
  collection: string,
  result: VocabularyValues,
  patch: boolean,
  findEntry: (lookup: EntryLookup) => Promise<EntryRow | null>,
  findBrand: (name: string) => Promise<{ id: string } | null>
): Promise<VocabularyValues> {
  const fields = vocabularyFields[collection];
  switch (collection) {
    case 'vocabulary':
      await normalizeVocabulary(result, !patch, findBrand);
      break;
    case 'vocabularyentry':
      await normalizeEntry(result, !patch, findEntry);
      break;
    case 'figsharevocabularysource':
      normalizeSource(result, !patch);
      break;
    case 'figsharevocabularycategory':
      normalizeCategory(result, !patch);
      break;
    case 'figsharevocabularycrosswalk':
      normalizeCrosswalk(result, !patch);
      break;
    case 'figsharevocabularycrosswalkmapping':
      normalizeMapping(result, !patch);
      break;
    case 'figsharevocabularysyncrun':
      normalizeSyncRun(result, !patch);
      break;
  }
  for (const [field, spec] of Object.entries(fields))
    if (spec.type === 'id' && result[field] != null) {
      const value = vocabularyId(result[field]);
      if (!(value instanceof ObjectId)) invalidWrite(patch, `${collection}.${field} is not a valid ObjectId`);
      result[field] = value;
    }
  if (result.id !== undefined) {
    const id = vocabularyId(result.id);
    if (!(id instanceof ObjectId)) invalidWrite(patch, 'Invalid vocabulary id');
    result._id = id;
    delete result.id;
  }
  return result;
}
export function decodeVocabulary<T>(collection: string, row: VocabularyValues | null, model = false): T | null {
  if (!row) return null;
  if (!(row._id instanceof ObjectId) && !(model && typeof row._id === 'string'))
    throw new PersistenceError(
      'model-mapping',
      'Unsupported vocabulary physical identity. Review the stored data and migrate institution extensions before startup; inventory stored data.'
    );
  const result: VocabularyValues = { id: typeof row._id === 'string' ? row._id : row._id.toHexString() };
  for (const [field, value] of Object.entries(row)) {
    if (field === '_id') continue;
    if (['__proto__', 'prototype', 'constructor'].includes(field))
      throw new PersistenceError('model-mapping', 'Unsupported vocabulary stored field.');
    if (vocabularyFields[collection][field]?.type === 'id') {
      if (value !== null && !(value instanceof ObjectId) && !(model && typeof value === 'string'))
        throw new PersistenceError(
          'model-mapping',
          'Unsupported vocabulary physical relationship. Review the stored data and migrate institution extensions before startup;; reads never rewrite data.'
        );
      result[field] = value === null ? null : typeof value === 'string' ? value : value.toHexString();
    } else result[field] = value;
  }
  assertVocabularyData(result);
  return result as T;
}
/** Private translation only for the closed V selections constructed by its operations. */
export function vocabularyCriteria(collection: string, criteria: object): VocabularyValues {
  const fields = vocabularyFields[collection];
  return Object.fromEntries(
    Object.entries(criteria)
      .filter(([, v]) => v !== undefined)
      .map(([field, value]) => {
        if (field === 'or') return ['$or', (value as object[]).map(v => vocabularyCriteria(collection, v))];
        const type =
          field === 'id' ? 'id' : ['createdAt', 'updatedAt'].includes(field) ? 'string' : fields[field]?.type;
        if (!type) throw new PersistenceError('scalar-validation', 'Unsupported vocabulary selection field.');
        const scalar = (v: unknown): unknown =>
          v === null ? null : type === 'id' ? vocabularyId(v) : coercePersistenceQueryScalar(v, type);
        if (Array.isArray(value)) value = { $in: value.map(scalar) };
        else if (value && typeof value === 'object') {
          const entries = Object.entries(value);
          value = Object.fromEntries(
            entries.map(([operator, v]) => {
              if (operator === 'contains') return ['$regex', String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
              if (operator === 'in' && Array.isArray(v)) return ['$in', v.map(scalar)];
              if (operator === '<') return ['$lt', scalar(v)];
              throw new PersistenceError('scalar-validation', 'Unsupported vocabulary selection.');
            })
          );
        } else value = scalar(value);
        return [field === 'id' ? '_id' : field, value];
      })
  );
}
export function vocabularySort(collection: string, sort: NonNullable<VocabularyPage['sort']>): Record<string, 1 | -1> {
  const terms =
    typeof sort === 'string'
      ? sort.split(',').map(term => {
          const [key, direction = 'ASC'] = term.trim().split(/\s+/);
          return { [key]: direction };
        })
      : sort;
  const result: Record<string, 1 | -1> = {};
  for (const term of terms)
    for (const [field, direction] of Object.entries(term)) {
      if (
        (field !== 'id' &&
          !['createdAt', 'updatedAt'].includes(field) &&
          !Object.hasOwn(vocabularyFields[collection], field)) ||
        !['ASC', 'DESC'].includes(direction)
      )
        throw new PersistenceError('scalar-validation', 'Unsupported vocabulary sort.');
      result[field === 'id' ? '_id' : field] = direction === 'DESC' ? -1 : 1;
    }
  return result;
}
export async function vocabularyOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
      throw Object.assign(
        new Error('Would violate uniqueness constraint-- a record already exists with conflicting value(s).'),
        { name: 'AdapterError', code: 'E_UNIQUE', attrNames: [] }
      );
    // Domain and callback errors retain their messages/codes, including partial-write failures.
    if (error instanceof Error && !error.name.startsWith('Mongo')) throw error;
    throw new PersistenceError(
      'vocabulary-operation',
      'Vocabulary persistence failed. Check datastore availability and permissions.'
    );
  }
}
