import type { RecordJsonSchemaEtag } from './record-json-schema-artifact';

const RECORD_JSON_SCHEMA_ETAG_PATTERN = /^"sha256:([0-9a-f]{64})"$/;
const OPTIONAL_WHITESPACE_PATTERN = /^[\t ]+|[\t ]+$/g;

export type RecordJsonSchemaEtagParseFailureReason = 'malformed' | 'weak' | 'list' | 'wildcard';

export type ParseRecordJsonSchemaEtagResult =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'parsed';
      readonly digest: string;
      readonly etag: RecordJsonSchemaEtag;
    }
  | {
      readonly kind: 'invalid';
      readonly reason: RecordJsonSchemaEtagParseFailureReason;
    };

/** Parse one optional If-Match or If-None-Match value in the supported schema ETag subset. */
export function parseRecordJsonSchemaEtag(value: string | undefined): ParseRecordJsonSchemaEtagResult {
  if (value === undefined) {
    return Object.freeze({ kind: 'absent' });
  }

  const valueWithoutOuterWhitespace = value.replace(OPTIONAL_WHITESPACE_PATTERN, '');
  if (valueWithoutOuterWhitespace === '*') {
    return Object.freeze({ kind: 'invalid', reason: 'wildcard' });
  }
  if (valueWithoutOuterWhitespace.includes(',')) {
    return Object.freeze({ kind: 'invalid', reason: 'list' });
  }
  if (valueWithoutOuterWhitespace.startsWith('W/')) {
    return Object.freeze({ kind: 'invalid', reason: 'weak' });
  }

  const match = RECORD_JSON_SCHEMA_ETAG_PATTERN.exec(valueWithoutOuterWhitespace);
  if (!match) {
    return Object.freeze({ kind: 'invalid', reason: 'malformed' });
  }
  return Object.freeze({
    kind: 'parsed',
    digest: match[1],
    etag: valueWithoutOuterWhitespace as RecordJsonSchemaEtag,
  });
}
