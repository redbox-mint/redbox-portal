import {
  isRecordConcurrencyResolution,
  isRecordEntityTag,
  isRecordFormFingerprint,
  isRecordRevision,
  isRecordSaveRequestId,
  type RecordConcurrencyMetadata,
  type RecordConcurrencyResolution,
  type RecordSaveResult,
} from '@researchdatabox/sails-ng-common';
import { formatRecordEntityTag, parseRecordEntityTag, type RecordEntityTagParseResult } from './RecordEntityTag';
import type { RecordConcurrencyContext } from './RecordSaveResponse';
import { INITIAL_RECORD_REVISION } from './RecordStorageConcurrency';

export const RECORD_HTTP_HEADERS = Object.freeze({
  ifMatch: 'If-Match',
  entityTag: 'ETag',
  formFingerprint: 'X-ReDBox-Form-Fingerprint',
  resolution: 'X-ReDBox-Concurrency-Resolution',
  resolutionOfRequestId: 'X-ReDBox-Resolution-Of-Request-Id',
  saveRequestId: 'X-ReDBox-Save-Request-Id',
});

export type PublicRecordConcurrencyRequestErrorCode =
  | 'record-if-match-invalid'
  | 'record-form-fingerprint-invalid'
  | 'record-concurrency-resolution-invalid'
  | 'record-concurrency-request-linkage-invalid';

export type PublicRecordConcurrencyRequestResult =
  | { readonly valid: true; readonly context: RecordConcurrencyContext }
  | {
      readonly valid: false;
      readonly code: PublicRecordConcurrencyRequestErrorCode;
      readonly header: string;
    };

export interface PublicRecordConcurrencyRequestOptions {
  /** Only generated browser-form submissions bind to a form definition. */
  readonly formBacked?: boolean;
}

/**
 * `undefined` means absent; `MULTIPLE` means the header appeared more than
 * once, which every concurrency header treats as a request-contract error
 * rather than silently taking the first value.
 */
const MULTIPLE = Symbol('multiple-header-values');
type HeaderValue = unknown | typeof MULTIPLE;

const PUBLIC_MUTATION_RESOLUTIONS: ReadonlySet<RecordConcurrencyResolution> = new Set([
  'direct',
  'client-auto-merged',
  'client-manually-resolved',
]);

/** Read one header without invoking accessors or retaining unrelated headers. */
function readHeader(headers: Readonly<Record<string, unknown>> | undefined, name: string): HeaderValue {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return undefined;
  const wanted = name.toLowerCase();
  const matching = Object.entries(Object.getOwnPropertyDescriptors(headers)).filter(
    ([key, descriptor]) => key.toLowerCase() === wanted && 'value' in descriptor
  );
  if (matching.length === 0) return undefined;
  if (matching.length > 1) return MULTIPLE;
  return matching[0][1].value;
}

/** `null` marks a present but unusable value: duplicated or not a string. */
function singleStringHeader(value: HeaderValue): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? value : null;
}

/** `null` for a present but unusable value is deliberately preserved, not trimmed away. */
function trimmedHeader(value: HeaderValue): string | undefined | null {
  const header = singleStringHeader(value);
  return typeof header === 'string' ? header.trim() : header;
}

/** Clients may only claim resolutions a client can actually perform. */
function isPublicMutationResolution(value: unknown): value is RecordConcurrencyResolution {
  return isRecordConcurrencyResolution(value) && PUBLIC_MUTATION_RESOLUTIONS.has(value);
}

/** Create routes accept no precondition: absent is fine, anything else is not. */
function createRouteEntityTagResult(value: unknown): RecordEntityTagParseResult {
  const absent = value === undefined;
  return { valid: false, reason: absent ? 'missing' : 'malformed' };
}

/**
 * Normalize public optimistic-concurrency headers once at the HTTP boundary.
 * Staleness and policy remain RecordsService/storage decisions; malformed
 * request contracts are rejected before candidate work begins.
 */
export function parsePublicRecordConcurrencyRequest(
  headers: Readonly<Record<string, unknown>> | undefined,
  recordOid: string | undefined,
  options: PublicRecordConcurrencyRequestOptions = {}
): PublicRecordConcurrencyRequestResult {
  // A duplicated If-Match is handed to the parser as a list so it produces the
  // same rejection as a comma-joined one.
  const ifMatch = readHeader(headers, RECORD_HTTP_HEADERS.ifMatch);
  const ifMatchValue = ifMatch === MULTIPLE ? [] : ifMatch;
  // Create has no prior representation, so any supplied precondition is a
  // request-contract error rather than something to compare.
  let parsedTag: RecordEntityTagParseResult;
  try {
    parsedTag =
      recordOid === undefined
        ? createRouteEntityTagResult(ifMatchValue)
        : parseRecordEntityTag(ifMatchValue, recordOid);
  } catch {
    return { valid: false, code: 'record-if-match-invalid', header: RECORD_HTTP_HEADERS.ifMatch };
  }
  if (!parsedTag.valid && parsedTag.reason !== 'missing') {
    return { valid: false, code: 'record-if-match-invalid', header: RECORD_HTTP_HEADERS.ifMatch };
  }

  // Only a generated browser form binds to a form definition; other routes
  // ignore the header rather than validating a value they never compare.
  const suppliedFingerprint = options.formBacked
    ? singleStringHeader(readHeader(headers, RECORD_HTTP_HEADERS.formFingerprint))
    : undefined;
  const formFingerprint = isRecordFormFingerprint(suppliedFingerprint) ? suppliedFingerprint : undefined;
  if (suppliedFingerprint !== undefined && formFingerprint === undefined) {
    return { valid: false, code: 'record-form-fingerprint-invalid', header: RECORD_HTTP_HEADERS.formFingerprint };
  }

  const suppliedResolution = trimmedHeader(readHeader(headers, RECORD_HTTP_HEADERS.resolution));
  const resolution = isPublicMutationResolution(suppliedResolution) ? suppliedResolution : undefined;
  if (suppliedResolution !== undefined && resolution === undefined) {
    return { valid: false, code: 'record-concurrency-resolution-invalid', header: RECORD_HTTP_HEADERS.resolution };
  }

  // Linkage is required by, and only by, a client-resolved retry, and it names
  // the earlier attempt rather than this one.
  const suppliedLinkage = singleStringHeader(readHeader(headers, RECORD_HTTP_HEADERS.resolutionOfRequestId));
  const saveRequestId = singleStringHeader(readHeader(headers, RECORD_HTTP_HEADERS.saveRequestId));
  const linkageRequired = resolution === 'client-auto-merged' || resolution === 'client-manually-resolved';
  const linkageAcceptable =
    suppliedLinkage === undefined
      ? !linkageRequired
      : linkageRequired &&
        isRecordSaveRequestId(saveRequestId) &&
        isRecordSaveRequestId(suppliedLinkage) &&
        suppliedLinkage !== saveRequestId;
  if (!linkageAcceptable) {
    return {
      valid: false,
      code: 'record-concurrency-request-linkage-invalid',
      header:
        linkageRequired && !isRecordSaveRequestId(saveRequestId)
          ? RECORD_HTTP_HEADERS.saveRequestId
          : RECORD_HTTP_HEADERS.resolutionOfRequestId,
    };
  }

  return {
    valid: true,
    context: {
      entityTagSupplied: parsedTag.valid,
      ...(parsedTag.valid ? { expectedRevision: parsedTag.value.expectedRevision } : {}),
      ...(formFingerprint ? { formFingerprint } : {}),
      ...(resolution ? { resolution } : {}),
      ...(suppliedLinkage ? { resolutionOfRequestId: suppliedLinkage } : {}),
    },
  };
}

export interface RecordRepresentationConcurrency {
  readonly headers: Readonly<Record<string, string>>;
  readonly metadata: RecordConcurrencyMetadata;
}

/**
 * Revision of one stored active or tombstone representation. A record written
 * before the revision migration reads as the initial revision; anything else
 * non-conforming is a storage fault rather than a value to guess at.
 */
export function recordRepresentationRevision(record: unknown): number {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('A record representation is required.');
  }
  const revision = (record as Record<string, unknown>).revision;
  if (revision === undefined) return INITIAL_RECORD_REVISION;
  if (!isRecordRevision(revision)) {
    throw new TypeError('The record representation has no valid revision.');
  }
  return revision;
}

/**
 * Build read-side revision metadata and the `ETag` header from server-owned
 * record fields only. Collection rows carry the numeric revision alone: a row
 * is not an individual representation, so it gets no entity tag.
 */
export function recordRepresentationConcurrency(record: unknown): RecordRepresentationConcurrency {
  const revision = recordRepresentationRevision(record);
  const oid = String((record as Record<string, unknown>).redboxOid ?? '').trim();
  if (!oid) {
    throw new TypeError('The record representation has no valid concurrency identity.');
  }
  const entityTag = formatRecordEntityTag(oid, revision);
  return {
    headers: { [RECORD_HTTP_HEADERS.entityTag]: entityTag },
    metadata: { revision, entityTag },
  };
}

/** Emit only the authoritative entity tag carried by a typed save result. */
export function recordSaveResultHeaders(
  result: Pick<RecordSaveResult, 'concurrency'> | null | undefined
): Readonly<Record<string, string>> {
  const entityTag = result?.concurrency?.entityTag;
  return isRecordEntityTag(entityTag) ? { [RECORD_HTTP_HEADERS.entityTag]: entityTag } : {};
}

/**
 * Spreadable response fragment. The `headers` key is omitted entirely when a
 * result carries no authoritative tag, so responses that never had one keep
 * their existing shape.
 */
export function recordSaveResultHeaderOption(result: Pick<RecordSaveResult, 'concurrency'> | null | undefined): {
  headers?: Readonly<Record<string, string>>;
} {
  const headers = recordSaveResultHeaders(result);
  return Object.keys(headers).length > 0 ? { headers } : {};
}
