import { createHash } from 'node:crypto';
import {
  isRecordEntityTag,
  isRecordRevision,
  RECORD_ENTITY_TAG_MAX_LENGTH,
  RECORD_ENTITY_TAG_PATTERN,
  RECORD_ENTITY_TAG_RECORD_ID_MAX_LENGTH,
  RECORD_ENTITY_TAG_VERSION,
  type RecordEntityTag,
} from '@researchdatabox/sails-ng-common';

export type { RecordEntityTag } from '@researchdatabox/sails-ng-common';

export type RecordEntityTagParseFailureReason =
  | 'missing'
  | 'malformed'
  | 'too-long'
  | 'multiple'
  | 'weak'
  | 'wildcard'
  | 'record-mismatch';

export interface ParsedRecordEntityTag {
  readonly entityTag: RecordEntityTag;
  readonly expectedRevision: number;
}

export type RecordEntityTagParseResult =
  | { readonly valid: true; readonly value: ParsedRecordEntityTag }
  | { readonly valid: false; readonly reason: RecordEntityTagParseFailureReason };

/**
 * The record OID is server-supplied route context, not client input, so an
 * unusable value is a programming error rather than a request-contract error.
 */
function assertRecordOid(recordOid: string): void {
  if (
    typeof recordOid !== 'string' ||
    recordOid.length === 0 ||
    recordOid.length > RECORD_ENTITY_TAG_RECORD_ID_MAX_LENGTH
  ) {
    throw new TypeError('Record OID must be a non-empty bounded string.');
  }
}

/**
 * Bind identity and revision into a fixed-width payload. The digest is an
 * unkeyed hash: it makes a tag from another record fail to match and keeps the
 * tag bounded regardless of OID length. It is not a signature and carries no
 * authorization.
 */
function identityDigest(recordOid: string, revision: number): string {
  return createHash('sha256')
    .update(`${RECORD_ENTITY_TAG_VERSION}\0${recordOid.length}\0`, 'utf8')
    .update(recordOid, 'utf8')
    .update(`\0${revision}`, 'utf8')
    .digest('base64url');
}

/**
 * Format the sole record entity-tag representation. Callers must treat the
 * returned quoted value as opaque and must never derive it from the numeric
 * revision on the client.
 */
export function formatRecordEntityTag(recordOid: string, revision: number): RecordEntityTag {
  assertRecordOid(recordOid);
  if (!isRecordRevision(revision)) {
    throw new TypeError('Record revision must be a non-negative safe integer.');
  }
  const entityTag = `"${RECORD_ENTITY_TAG_VERSION}.${revision}.${identityDigest(recordOid, revision)}"`;
  if (!isRecordEntityTag(entityTag)) {
    throw new Error('Generated record entity tag did not satisfy the shared contract.');
  }
  return entityTag;
}

/**
 * Parse one exact `If-Match` tag for a known record. Arrays, comma-joined
 * lists, weak validators, wildcards, malformed values, and tags bound to
 * another OID are all rejected, and no raw header text is returned or logged.
 *
 * An old but well-formed tag for the same record parses successfully: deciding
 * that it is stale belongs to the policy and compare-and-set boundary, not to
 * request parsing.
 */
export function parseRecordEntityTag(value: unknown, recordOid: string): RecordEntityTagParseResult {
  assertRecordOid(recordOid);
  if (value === undefined || value === null) {
    return { valid: false, reason: 'missing' };
  }
  if (Array.isArray(value)) {
    return { valid: false, reason: 'multiple' };
  }
  if (typeof value !== 'string') {
    return { valid: false, reason: 'malformed' };
  }
  // Bound the untrusted header before any further work.
  if (value.length > RECORD_ENTITY_TAG_MAX_LENGTH) {
    return { valid: false, reason: 'too-long' };
  }

  const normalized = value.trim();
  // Once a header field is present, an empty value is malformed. Only the
  // absence of the field is a missing precondition.
  if (normalized.length === 0) {
    return { valid: false, reason: 'malformed' };
  }
  if (normalized === '*') {
    return { valid: false, reason: 'wildcard' };
  }
  if (/^W\//i.test(normalized)) {
    return { valid: false, reason: 'weak' };
  }
  if (normalized.includes(',')) {
    return { valid: false, reason: 'multiple' };
  }

  const match = RECORD_ENTITY_TAG_PATTERN.exec(normalized);
  if (!match) {
    return { valid: false, reason: 'malformed' };
  }
  const expectedRevision = Number(match[1]);
  if (!isRecordRevision(expectedRevision)) {
    return { valid: false, reason: 'malformed' };
  }

  // Recomputing the whole tag proves the digest binds this OID and revision.
  const expectedTag = formatRecordEntityTag(recordOid, expectedRevision);
  if (normalized !== expectedTag) {
    return { valid: false, reason: 'record-mismatch' };
  }
  return { valid: true, value: { entityTag: expectedTag, expectedRevision } };
}
