import { expect } from 'chai';

import { parseRecordJsonSchemaEtag } from '../../../src/record-contract/record-json-schema-etag';

const DIGEST = 'a'.repeat(64);
const ETAG = `"sha256:${DIGEST}"`;

describe('record JSON Schema ETag parsing', function () {
  it('returns a typed absent result when the conditional is omitted', function () {
    expect(parseRecordJsonSchemaEtag(undefined)).to.deep.equal({ kind: 'absent' });
  });

  it('parses one exact quoted strong sha256 tag with lowercase hexadecimal digest', function () {
    expect(parseRecordJsonSchemaEtag(ETAG)).to.deep.equal({
      kind: 'parsed',
      digest: DIGEST,
      etag: ETAG,
    });
    expect(parseRecordJsonSchemaEtag(` \t${ETAG}\t `)).to.deep.equal({
      kind: 'parsed',
      digest: DIGEST,
      etag: ETAG,
    });
  });

  it('rejects malformed and arbitrary tags without normalizing their identity', function () {
    for (const value of [
      '',
      `sha256:${DIGEST}`,
      `"${DIGEST}"`,
      `"sha512:${DIGEST}"`,
      '"arbitrary-tag"',
      `"sha256:${'a'.repeat(63)}"`,
      `"sha256:${'A'.repeat(64)}"`,
      `"sha256:${'g'.repeat(64)}"`,
      `"sha256:${DIGEST.slice(0, 32)} ${DIGEST.slice(32)}"`,
      `\r${ETAG}\n`,
      `"sha256:${DIGEST}" trailing`,
    ]) {
      expect(parseRecordJsonSchemaEtag(value), value).to.deep.equal({ kind: 'invalid', reason: 'malformed' });
    }
  });

  it('rejects long interior runs of optional whitespace without repeatedly rescanning them', function () {
    expect(parseRecordJsonSchemaEtag(`invalid${'\t'.repeat(20_000)}tag`)).to.deep.equal({
      kind: 'invalid',
      reason: 'malformed',
    });
  });

  it('rejects weak tags explicitly', function () {
    expect(parseRecordJsonSchemaEtag(`W/${ETAG}`)).to.deep.equal({ kind: 'invalid', reason: 'weak' });
  });

  it('rejects comma-separated tag lists even when every member is otherwise supported', function () {
    expect(parseRecordJsonSchemaEtag(`${ETAG}, "sha256:${'b'.repeat(64)}"`)).to.deep.equal({
      kind: 'invalid',
      reason: 'list',
    });
  });

  it('rejects the wildcard explicitly', function () {
    expect(parseRecordJsonSchemaEtag(' * ')).to.deep.equal({ kind: 'invalid', reason: 'wildcard' });
  });
});
