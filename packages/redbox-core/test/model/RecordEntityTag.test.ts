let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import { formatRecordEntityTag, parseRecordEntityTag, type RecordEntityTag } from '../../src';
import {
  isRecordEntityTag,
  RECORD_ENTITY_TAG_MAX_LENGTH,
  RECORD_ENTITY_TAG_RECORD_ID_MAX_LENGTH,
} from '@researchdatabox/sails-ng-common';

describe('RecordEntityTag', function () {
  const oid = 'record-oid-1';

  it('formats and parses one bounded opaque tag binding OID and revision', function () {
    const tag: RecordEntityTag = formatRecordEntityTag(oid, 42);
    expect(tag.length).to.be.at.most(RECORD_ENTITY_TAG_MAX_LENGTH);
    expect(isRecordEntityTag(tag)).to.equal(true);
    expect(parseRecordEntityTag(tag, oid)).to.deep.equal({
      valid: true,
      value: { entityTag: tag, expectedRevision: 42 },
    });
    expect(parseRecordEntityTag(`  ${tag}  `, oid)).to.deep.equal({
      valid: true,
      value: { entityTag: tag, expectedRevision: 42 },
    });
  });

  it('binds tags to the record identity as well as the revision', function () {
    const tag = formatRecordEntityTag(oid, 42);
    expect(formatRecordEntityTag('record-oid-2', 42)).not.to.equal(tag);
    expect(parseRecordEntityTag(tag, 'record-oid-2')).to.deep.equal({
      valid: false,
      reason: 'record-mismatch',
    });
  });

  it('accepts an old exact tag for the same record so policy can classify staleness', function () {
    const oldTag = formatRecordEntityTag(oid, 3);
    expect(parseRecordEntityTag(oldTag, oid)).to.deep.equal({
      valid: true,
      value: { entityTag: oldTag, expectedRevision: 3 },
    });
  });

  it('rejects missing, arrays, lists, weak, wildcard, bare, malformed, and excessive tags', function () {
    const tag = formatRecordEntityTag(oid, 1);
    const cases: Array<[unknown, string]> = [
      [undefined, 'missing'],
      [null, 'missing'],
      ['', 'malformed'],
      ['   ', 'malformed'],
      [[tag], 'multiple'],
      [[], 'multiple'],
      [`${tag}, ${tag}`, 'multiple'],
      [`W/${tag}`, 'weak'],
      [`w/${tag}`, 'weak'],
      ['*', 'wildcard'],
      ['"*"', 'malformed'],
      ['1', 'malformed'],
      ['"1"', 'malformed'],
      ['"unterminated', 'malformed'],
      ['"different-format"', 'malformed'],
      [`rb-record-v1.1.${'a'.repeat(43)}`, 'malformed'],
      [{ tag }, 'malformed'],
      [1, 'malformed'],
      ['x'.repeat(RECORD_ENTITY_TAG_MAX_LENGTH + 1), 'too-long'],
    ];
    for (const [value, reason] of cases) {
      expect(parseRecordEntityTag(value, oid)).to.deep.equal({ valid: false, reason }, `input: ${String(value)}`);
    }
  });

  it('rejects a well-formed tag whose digest was tampered with', function () {
    const tag = formatRecordEntityTag(oid, 5);
    // Same shape, same revision, different digest: identity is not certified.
    const forged = `"rb-record-v1.5.${'a'.repeat(43)}"`;
    expect(forged).not.to.equal(tag);
    expect(parseRecordEntityTag(forged, oid)).to.deep.equal({ valid: false, reason: 'record-mismatch' });
  });

  it('never lets a tag for one revision satisfy another revision of the same record', function () {
    const tag = formatRecordEntityTag(oid, 3);
    const parsed = parseRecordEntityTag(tag, oid);
    expect(parsed.valid).to.equal(true);
    expect(parsed.valid && parsed.value.expectedRevision).to.equal(3);
    expect(formatRecordEntityTag(oid, 4)).not.to.equal(tag);
  });

  it('rejects an unusable record OID as a programming error, not a parse result', function () {
    expect(() => parseRecordEntityTag(formatRecordEntityTag(oid, 1), '')).to.throw(TypeError);
  });

  it('rejects invalid revision and OID inputs at the formatter boundary', function () {
    for (const revision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => formatRecordEntityTag(oid, revision)).to.throw(TypeError);
    }
    expect(() => formatRecordEntityTag('', 1)).to.throw(TypeError);
    expect(() => formatRecordEntityTag('x'.repeat(RECORD_ENTITY_TAG_RECORD_ID_MAX_LENGTH + 1), 1)).to.throw(TypeError);
  });
});
