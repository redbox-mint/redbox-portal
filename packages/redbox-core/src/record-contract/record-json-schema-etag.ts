import type { RecordJsonSchemaEtag } from './record-json-schema-artifact';

const RECORD_JSON_SCHEMA_ETAG_PATTERN = /^"sha256:([0-9a-f]{64})"$/;

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

function trimHttpOptionalWhitespace(value: string): string {
  let startIndex = 0;
  let endIndex = value.length;

  while (startIndex < endIndex && (value[startIndex] === ' ' || value[startIndex] === '\t')) {
    startIndex += 1;
  }
  while (endIndex > startIndex && (value[endIndex - 1] === ' ' || value[endIndex - 1] === '\t')) {
    endIndex -= 1;
  }

  return value.slice(startIndex, endIndex);
}

/** Parse one optional If-Match or If-None-Match value in the supported schema ETag subset. */
export function parseRecordJsonSchemaEtag(value: string | undefined): ParseRecordJsonSchemaEtagResult {
  if (value === undefined) {
    return Object.freeze({ kind: 'absent' });
  }

  const valueWithoutOuterWhitespace = trimHttpOptionalWhitespace(value);
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
