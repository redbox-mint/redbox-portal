import {
  canonicallyEqualRecordValues,
  isRecordEntityTag,
  isRecordFormFingerprint,
  isRecordRevision,
  isRecordSaveRequestId,
  rebaseRecordValues,
  RECORD_ENTITY_TAG_PATTERN,
} from '@researchdatabox/sails-ng-common';
import type { ThreeWayRecordRebase } from '@researchdatabox/sails-ng-common';

/** Parsed server-owned concurrency facts delivered with a generated form. */
export interface FormLoadConcurrencyState {
  readonly entityTag?: string;
  readonly revision?: number;
  readonly formFingerprint?: string;
}

export interface FormRecordIdentity {
  readonly oid: string;
  readonly recordType: string;
  readonly formName: string;
}

export interface FormRecordBaselineState extends FormLoadConcurrencyState, FormRecordIdentity {
  readonly metadata: Readonly<Record<string, unknown>>;
  /** False when a persisted response could not return its authoritative projection. */
  readonly trusted: boolean;
}

export type FormConflictStatus = 'stale' | 'reviewing' | 'retrying' | 'form-changed' | 'deleted' | 'permission-lost';

/** The typed server fact that caused the memory-only conflict state. */
export type FormConflictCause =
  | 'record-stale'
  | 'precondition-required'
  | 'form-changed'
  | 'deleted'
  | 'permission-lost';

/** Memory-only state for one FormComponent instance. */
export interface FormConflictState {
  readonly requestId: string;
  readonly cause: FormConflictCause;
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
  /** An ambiguous retry may only recover through an authoritative reload. */
  readonly retryRecovery?: 'reload-required';
}

export type FormConflictRebaseIneligibility =
  | 'conflict-not-stale'
  | 'baseline-untrusted'
  | 'record-identity-mismatch'
  | 'baseline-mismatch'
  | 'latest-unavailable'
  | 'latest-version-untrusted'
  | 'form-fingerprint-mismatch'
  | 'request-linkage-untrusted'
  | 'overlapping-changes';

export type FormConflictRebasePlan =
  | {
      readonly eligible: true;
      readonly rebase: ThreeWayRecordRebase<Record<string, unknown>>;
    }
  | {
      readonly eligible: false;
      readonly reason: FormConflictRebaseIneligibility;
    };

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

export function isTrustedFormRecordVersion(entityTag: unknown, revision: unknown): boolean {
  return isRecordEntityTag(entityTag) && isRecordRevision(revision) && recordEntityTagRevision(entityTag) === revision;
}

/** Clone and recursively freeze JSON-like projected metadata. */
export function immutableFormMetadata(value: unknown): Readonly<Record<string, unknown>> {
  const source = isPlainRecord(value) ? value : {};
  const cloned = structuredClone(source);
  return freezeJsonValue(cloned) as Readonly<Record<string, unknown>>;
}

/**
 * Decide whether a stale form has enough trusted coordinates for a same-form
 * three-way rebase. A positive plan grants no write authority: its candidate
 * still goes through the ordinary authorization, validation, and CAS request.
 */
export function planFormConflictRebase(
  baseline: FormRecordBaselineState | null,
  conflict: FormConflictState | null,
  local: Record<string, unknown>,
  currentFormFingerprint: unknown,
  currentIdentity: FormRecordIdentity
): FormConflictRebasePlan {
  if (!conflict || conflict.status !== 'stale') {
    return { eligible: false, reason: 'conflict-not-stale' };
  }
  if (conflict.cause !== 'record-stale') {
    return { eligible: false, reason: 'conflict-not-stale' };
  }
  if (!baseline?.trusted || !isTrustedFormRecordVersion(baseline.entityTag, baseline.revision)) {
    return { eligible: false, reason: 'baseline-untrusted' };
  }
  if (
    baseline.oid !== currentIdentity.oid ||
    baseline.recordType !== currentIdentity.recordType ||
    baseline.formName !== currentIdentity.formName
  ) {
    return { eligible: false, reason: 'record-identity-mismatch' };
  }
  if (
    conflict.baseRevision !== baseline.revision ||
    conflict.baseEntityTag !== baseline.entityTag ||
    !canonicallyEqualRecordValues(conflict.base, baseline.metadata)
  ) {
    return { eligible: false, reason: 'baseline-mismatch' };
  }
  if (!conflict.latest) {
    return { eligible: false, reason: 'latest-unavailable' };
  }
  if (!isTrustedFormRecordVersion(conflict.latestEntityTag, conflict.latestRevision)) {
    return { eligible: false, reason: 'latest-version-untrusted' };
  }
  if (
    !isRecordFormFingerprint(currentFormFingerprint) ||
    !isRecordFormFingerprint(baseline.formFingerprint) ||
    conflict.baseFormFingerprint !== baseline.formFingerprint ||
    conflict.latestFormFingerprint !== baseline.formFingerprint ||
    currentFormFingerprint !== baseline.formFingerprint
  ) {
    return { eligible: false, reason: 'form-fingerprint-mismatch' };
  }
  if (!isRecordSaveRequestId(conflict.requestId)) {
    return { eligible: false, reason: 'request-linkage-untrusted' };
  }

  const rebase = rebaseRecordValues(conflict.base, local, conflict.latest as Record<string, unknown>);
  if (rebase.unresolvedOverlaps.length > 0) {
    return { eligible: false, reason: 'overlapping-changes' };
  }
  return { eligible: true, rebase };
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
