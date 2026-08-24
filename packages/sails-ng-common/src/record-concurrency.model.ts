/**
 * Data-only optimistic-concurrency contracts shared by the server and browser.
 * Runtime policy enforcement remains a backend responsibility.
 */

import { isPlainRecord } from './internal/plain-record';
import {
  isRecordSaveRequestId,
  RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN,
  RECORD_SAVE_REQUEST_ID_MAX_LENGTH,
} from './record-save.model';

export const RECORD_CONCURRENT_MODIFICATION_MODES = ['last-write-wins', 'observe', 'strict'] as const;

export type RecordConcurrentModificationMode = (typeof RECORD_CONCURRENT_MODIFICATION_MODES)[number];

export interface RecordConcurrentModificationConfig {
  mode: RecordConcurrentModificationMode;
}

export const DEFAULT_RECORD_CONCURRENT_MODIFICATION_MODE = 'last-write-wins' as const;
export const DEFAULT_RECORD_CONCURRENT_MODIFICATION_CONFIG: Readonly<RecordConcurrentModificationConfig> =
  Object.freeze({
    mode: DEFAULT_RECORD_CONCURRENT_MODIFICATION_MODE,
  });

export type RecordConcurrentModificationConfigValidation =
  | {
      readonly valid: true;
      readonly config: RecordConcurrentModificationConfig;
      readonly defaulted: boolean;
    }
  | {
      readonly valid: false;
      readonly reason: 'malformed-config' | 'malformed-mode';
    };

export const RECORD_CONCURRENCY_RESOLUTIONS = [
  'direct',
  'already-current',
  'client-auto-merged',
  'client-manually-resolved',
  'internal',
] as const;

/**
 * Diagnostic description of how a successful candidate was produced. It is
 * never authority and never relaxes authorization, validation, or persistence:
 * the server repeats every check regardless of the label a client sent.
 */
export type RecordConcurrencyResolution = (typeof RECORD_CONCURRENCY_RESOLUTIONS)[number];

export const RECORD_CONCURRENCY_PROBLEM_CODES = [
  'record-precondition-required',
  'record-revision-stale',
  'record-deleted',
  'record-concurrency-capability-unavailable',
  'form-definition-changed',
  'record-lifecycle-operation-conflict',
] as const;

export type RecordConcurrencyProblemCode = (typeof RECORD_CONCURRENCY_PROBLEM_CODES)[number];

/** Revisions are exact non-negative integers, not timestamps or floating-point counters. */
export const RECORD_REVISION_MAX = Number.MAX_SAFE_INTEGER;

/**
 * Entity tags are quoted, bounded, opaque values produced by one backend
 * helper. Clients retain and return the complete value; they never construct a
 * tag from the numeric revision.
 */
export const RECORD_ENTITY_TAG_VERSION = 'rb-record-v1' as const;
export const RECORD_ENTITY_TAG_MAX_LENGTH = 128;
export const RECORD_ENTITY_TAG_RECORD_ID_MAX_LENGTH = 1_024;

/** Base64url SHA-256 digest length, without padding. */
const RECORD_ENTITY_TAG_DIGEST_LENGTH = 43;

/**
 * `"<version>.<revision>.<digest>"`. Built from the version constant so a
 * future format bump cannot leave the guard matching the previous shape.
 */
export const RECORD_ENTITY_TAG_PATTERN = new RegExp(
  `^"${RECORD_ENTITY_TAG_VERSION}\\.(0|[1-9][0-9]{0,15})\\.[A-Za-z0-9_-]{${RECORD_ENTITY_TAG_DIGEST_LENGTH}}"$`
);

declare const recordEntityTagBrand: unique symbol;
export type RecordEntityTag = string & { readonly [recordEntityTagBrand]: true };

/**
 * Form fingerprints are deliberately independent of record revisions and
 * entity tags: an administrator editing a form must not invalidate API
 * operations that never rendered it.
 */
export const RECORD_FORM_FINGERPRINT_MAX_LENGTH = 128;
export const RECORD_FORM_FINGERPRINT_PATTERN = RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN;

declare const recordFormFingerprintBrand: unique symbol;
export type RecordFormFingerprint = string & { readonly [recordFormFingerprintBrand]: true };

export interface RecordConcurrencyMetadata {
  mode?: RecordConcurrentModificationMode;
  revision?: number;
  expectedRevision?: number;
  currentRevision?: number;
  entityTag?: string;
  formFingerprint?: string;
  /** Diagnostic only; the server repeats all authoritative checks. */
  resolution?: RecordConcurrencyResolution;
  /** Bounded diagnostic linkage to the prior request; not an idempotency key. */
  resolutionOfRequestId?: string;
}

export function isRecordConcurrentModificationMode(value: unknown): value is RecordConcurrentModificationMode {
  return typeof value === 'string' && (RECORD_CONCURRENT_MODIFICATION_MODES as readonly string[]).includes(value);
}

/**
 * Validate absent, valid, and malformed record-type policy. Absent policy is
 * the compatibility default; an explicit but malformed policy is reported so
 * enforcement boundaries can fail closed rather than silently defaulting.
 * No raw input is retained in the result.
 */
export function validateRecordConcurrentModificationConfig(
  value: unknown
): RecordConcurrentModificationConfigValidation {
  if (value === undefined || value === null) {
    return {
      valid: true,
      config: { ...DEFAULT_RECORD_CONCURRENT_MODIFICATION_CONFIG },
      defaulted: true,
    };
  }
  if (!isPlainRecord(value)) {
    return { valid: false, reason: 'malformed-config' };
  }
  if (!isRecordConcurrentModificationMode(value.mode)) {
    return { valid: false, reason: 'malformed-mode' };
  }
  return { valid: true, config: { mode: value.mode }, defaulted: false };
}

/** True only for an explicit, well-formed policy object. */
export function isRecordConcurrentModificationConfig(value: unknown): value is RecordConcurrentModificationConfig {
  const validation = validateRecordConcurrentModificationConfig(value);
  return validation.valid && !validation.defaulted;
}

/**
 * Resolve the compatibility default while failing closed for explicit
 * malformed policy. Use this at enforcement boundaries, where guessing a mode
 * would risk permitting an unguarded write.
 */
export function resolveRecordConcurrentModificationConfig(value: unknown): RecordConcurrentModificationConfig {
  const validation = validateRecordConcurrentModificationConfig(value);
  if (!validation.valid) {
    throw new TypeError(`Record concurrent-modification configuration is ${validation.reason}.`);
  }
  return validation.config;
}

export function resolveRecordConcurrentModificationMode(value: unknown): RecordConcurrentModificationMode {
  return resolveRecordConcurrentModificationConfig(value).mode;
}

/**
 * Non-throwing counterpart for presentation boundaries such as record-type
 * discovery, where one corrupted stored policy must not break an unrelated
 * listing. Reporting the default is safe because it cannot loosen enforcement:
 * a malformed policy still fails closed when a mutation resolves it.
 */
export function coerceRecordConcurrentModificationConfig(value: unknown): RecordConcurrentModificationConfig {
  const validation = validateRecordConcurrentModificationConfig(value);
  return validation.valid ? validation.config : { ...DEFAULT_RECORD_CONCURRENT_MODIFICATION_CONFIG };
}

export function isRecordConcurrencyResolution(value: unknown): value is RecordConcurrencyResolution {
  return typeof value === 'string' && (RECORD_CONCURRENCY_RESOLUTIONS as readonly string[]).includes(value);
}

export function isRecordConcurrencyProblemCode(value: unknown): value is RecordConcurrencyProblemCode {
  return typeof value === 'string' && (RECORD_CONCURRENCY_PROBLEM_CODES as readonly string[]).includes(value);
}

export function isRecordRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= RECORD_REVISION_MAX;
}

/**
 * Structural entity-tag guard. Record identity is certified by the backend
 * parser, which recomputes the digest for a known OID; this guard only proves
 * the value has the bounded opaque shape worth carrying in client state.
 */
export function isRecordEntityTag(value: unknown): value is RecordEntityTag {
  if (typeof value !== 'string' || value.length > RECORD_ENTITY_TAG_MAX_LENGTH) {
    return false;
  }
  const match = RECORD_ENTITY_TAG_PATTERN.exec(value);
  return match !== null && isRecordRevision(Number(match[1]));
}

export function isRecordFormFingerprint(value: unknown): value is RecordFormFingerprint {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= RECORD_FORM_FINGERPRINT_MAX_LENGTH &&
    RECORD_FORM_FINGERPRINT_PATTERN.test(value)
  );
}

export const RECORD_CONCURRENCY_REQUEST_ID_MAX_LENGTH = RECORD_SAVE_REQUEST_ID_MAX_LENGTH;

/** Diagnostic request linkage uses the same canonical save request-id format. */
export const isRecordConcurrencyRequestId = isRecordSaveRequestId;

/** Runtime guard used at transport boundaries for bounded concurrency metadata. */
export function isRecordConcurrencyMetadata(value: unknown): value is RecordConcurrencyMetadata {
  if (!isPlainRecord(value)) {
    return false;
  }
  return (
    (value.mode === undefined || isRecordConcurrentModificationMode(value.mode)) &&
    (value.revision === undefined || isRecordRevision(value.revision)) &&
    (value.expectedRevision === undefined || isRecordRevision(value.expectedRevision)) &&
    (value.currentRevision === undefined || isRecordRevision(value.currentRevision)) &&
    (value.entityTag === undefined || isRecordEntityTag(value.entityTag)) &&
    (value.formFingerprint === undefined || isRecordFormFingerprint(value.formFingerprint)) &&
    (value.resolution === undefined || isRecordConcurrencyResolution(value.resolution)) &&
    (value.resolutionOfRequestId === undefined || isRecordConcurrencyRequestId(value.resolutionOfRequestId))
  );
}

/**
 * Copy only valid bounded fields from untrusted or cross-runtime metadata.
 * Unknown keys are dropped rather than carried, so a payload cannot widen the
 * diagnostic contract. Returns `undefined` when nothing survives.
 */
export function sanitizeRecordConcurrencyMetadata(value: unknown): RecordConcurrencyMetadata | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const result: RecordConcurrencyMetadata = {};
  if (isRecordConcurrentModificationMode(value.mode)) result.mode = value.mode;
  if (isRecordRevision(value.revision)) result.revision = value.revision;
  if (isRecordRevision(value.expectedRevision)) result.expectedRevision = value.expectedRevision;
  if (isRecordRevision(value.currentRevision)) result.currentRevision = value.currentRevision;
  if (isRecordEntityTag(value.entityTag)) result.entityTag = value.entityTag;
  if (isRecordFormFingerprint(value.formFingerprint)) result.formFingerprint = value.formFingerprint;
  if (isRecordConcurrencyResolution(value.resolution)) result.resolution = value.resolution;
  if (isRecordConcurrencyRequestId(value.resolutionOfRequestId)) {
    result.resolutionOfRequestId = value.resolutionOfRequestId;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
