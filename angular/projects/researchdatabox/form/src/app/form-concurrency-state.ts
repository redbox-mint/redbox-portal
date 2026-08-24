import {
  isRecordEntityTag,
  isRecordFormFingerprint,
  isRecordRevision,
  RECORD_ENTITY_TAG_PATTERN,
} from '@researchdatabox/sails-ng-common';

/** Parsed server-owned concurrency facts delivered with a generated form. */
export interface FormLoadConcurrencyState {
  readonly entityTag?: string;
  readonly revision?: number;
  readonly formFingerprint?: string;
}

export interface FormRecordBaselineState extends FormLoadConcurrencyState {
  readonly oid: string;
  readonly recordType: string;
  readonly formName: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  /** False when a persisted response could not return its authoritative projection. */
  readonly trusted: boolean;
}

export type FormConflictStatus = 'stale' | 'reviewing' | 'retrying' | 'form-changed' | 'deleted';

/** Memory-only state for one FormComponent instance. */
export interface FormConflictState {
  readonly requestId: string;
  readonly base: Readonly<Record<string, unknown>>;
  readonly local: Readonly<Record<string, unknown>>;
  readonly latest: Readonly<Record<string, unknown>> | null;
  readonly baseRevision?: number;
  readonly latestRevision?: number;
  readonly baseEntityTag?: string;
  readonly latestEntityTag?: string;
  readonly baseFormFingerprint?: string;
  readonly latestFormFingerprint?: string;
  readonly status: FormConflictStatus;
  readonly autoRetryAttempted: boolean;
}

/**
 * Parse only bounded server-owned fields. A valid response ETag takes
 * precedence over its duplicated typed-metadata value.
 */
export function parseFormLoadConcurrency(
  meta: Readonly<Record<string, unknown>> | undefined,
  responseEntityTag?: unknown
): FormLoadConcurrencyState {
  const metadataTag = meta?.['entityTag'];
  const responseTagSupplied = responseEntityTag !== undefined && responseEntityTag !== null;
  const responseTag = isRecordEntityTag(responseEntityTag) ? responseEntityTag : undefined;
  const typedTag = isRecordEntityTag(metadataTag) ? metadataTag : undefined;
  let entityTag = responseTag ?? typedTag;
  let revision = isRecordRevision(meta?.['revision']) ? meta['revision'] : undefined;
  const duplicatedTagMismatch = Boolean(responseTag && typedTag && responseTag !== typedTag);
  const tagRevision = recordEntityTagRevision(entityTag);
  const coordinateMismatch = revision !== undefined && tagRevision !== undefined && revision !== tagRevision;
  if ((responseTagSupplied && !responseTag) || duplicatedTagMismatch || coordinateMismatch) {
    entityTag = undefined;
    revision = undefined;
  }
  const formFingerprint = isRecordFormFingerprint(meta?.['formFingerprint']) ? meta['formFingerprint'] : undefined;
  return {
    ...(entityTag ? { entityTag } : {}),
    ...(revision !== undefined ? { revision } : {}),
    ...(formFingerprint ? { formFingerprint } : {}),
  };
}

function recordEntityTagRevision(value: unknown): number | undefined {
  if (!isRecordEntityTag(value)) return undefined;
  const match = RECORD_ENTITY_TAG_PATTERN.exec(value);
  const revision = match ? Number(match[1]) : undefined;
  return isRecordRevision(revision) ? revision : undefined;
}

/** Clone and recursively freeze JSON-like projected metadata. */
export function immutableFormMetadata(value: unknown): Readonly<Record<string, unknown>> {
  const source = isPlainRecord(value) ? value : {};
  const cloned = structuredClone(source);
  return freezeJsonValue(cloned) as Readonly<Record<string, unknown>>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freezeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    value.forEach(freezeJsonValue);
    return Object.freeze(value);
  }
  if (isPlainRecord(value)) {
    Object.values(value).forEach(freezeJsonValue);
    return Object.freeze(value);
  }
  return value;
}
