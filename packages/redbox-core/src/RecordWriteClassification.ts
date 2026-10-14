import { isEqual } from 'lodash';

type AnyRecord = Record<string, unknown>;

export type RecordWriteClassification =
  | 'record-metadata'
  | 'form-relevant-object-metadata'
  | 'authorization-only'
  | 'non-form-system-metadata'
  | 'no-change';

const AUTHORIZATION_KEYS = [
  'authorization',
  'authorization_edit',
  'authorization_view',
  'authorization_editRoles',
  'authorization_viewRoles',
  'authorization_editPending',
  'authorization_viewPending',
] as const;

const FORM_RELEVANT_META_METADATA_KEYS = ['brandId', 'type', 'form'] as const;

function recordProperty(record: Readonly<AnyRecord>, key: string): Readonly<AnyRecord> {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function pick(source: Readonly<AnyRecord>, keys: readonly string[]): AnyRecord {
  const selected: AnyRecord = {};
  for (const key of keys) {
    if (Object.hasOwn(source, key)) selected[key] = source[key];
  }
  return selected;
}

function omit(source: Readonly<AnyRecord>, keys: readonly string[]): AnyRecord {
  const omitted = new Set(keys);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !omitted.has(key)));
}

function formContext(record: Readonly<AnyRecord>): AnyRecord {
  return {
    metaMetadata: pick(recordProperty(record, 'metaMetadata'), FORM_RELEVANT_META_METADATA_KEYS),
    workflow: record.workflow,
    previousWorkflow: record.previousWorkflow,
  };
}

function authorizationContext(record: Readonly<AnyRecord>): AnyRecord {
  return pick(record, AUTHORIZATION_KEYS);
}

function nonFormObjectMetadata(record: Readonly<AnyRecord>): AnyRecord {
  return {
    ...omit(record, ['metadata', 'metaMetadata', ...AUTHORIZATION_KEYS, 'workflow', 'previousWorkflow']),
    metaMetadata: omit(recordProperty(record, 'metaMetadata'), FORM_RELEVANT_META_METADATA_KEYS),
  };
}

/**
 * Classify a complete before/after record pair at the RecordsService boundary.
 * User form data takes precedence, followed by form-resolution inputs. Pure
 * authorization and unrelated system-object changes intentionally skip form
 * validation, but remain ordinary persistence operations.
 */
export function classifyRecordWrite(
  before: Readonly<AnyRecord>,
  after: Readonly<AnyRecord>
): RecordWriteClassification {
  if (!isEqual(before.metadata, after.metadata)) return 'record-metadata';
  if (!isEqual(formContext(before), formContext(after))) return 'form-relevant-object-metadata';

  const authorizationChanged = !isEqual(authorizationContext(before), authorizationContext(after));
  const systemMetadataChanged = !isEqual(nonFormObjectMetadata(before), nonFormObjectMetadata(after));
  if (systemMetadataChanged) return 'non-form-system-metadata';
  if (authorizationChanged) return 'authorization-only';
  return 'no-change';
}

export function recordWriteRequiresFormValidation(classification: RecordWriteClassification): boolean {
  return classification === 'record-metadata' || classification === 'form-relevant-object-metadata';
}
