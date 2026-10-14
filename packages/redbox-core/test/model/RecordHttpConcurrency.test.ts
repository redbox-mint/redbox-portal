let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));

import {
  formatRecordEntityTag,
  parsePublicRecordConcurrencyRequest,
  recordConcurrencyRequestFailureResponse,
  recordRepresentationConcurrency,
  recordSaveResultHeaders,
} from '../../src';

describe('RecordHttpConcurrency', function () {
  const oid = 'record-1';
  const requestId = '00000000-0000-4000-8000-000000000001';
  const priorRequestId = '00000000-0000-4000-8000-000000000002';

  it('normalizes one matching strong If-Match tag without deciding staleness', function () {
    const entityTag = formatRecordEntityTag(oid, 7);
    expect(parsePublicRecordConcurrencyRequest({ 'if-match': entityTag }, oid)).to.deep.equal({
      valid: true,
      context: { entityTagSupplied: true, expectedRevision: 7 },
    });
    expect(parsePublicRecordConcurrencyRequest({}, oid)).to.deep.equal({
      valid: true,
      context: { entityTagSupplied: false },
    });
  });

  it('rejects weak, wildcard, list, bare, malformed, wrong-record, and duplicate tags', function () {
    const entityTag = formatRecordEntityTag(oid, 7);
    const cases: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      { 'if-match': `W/${entityTag}` },
      { 'if-match': '*' },
      { 'if-match': `${entityTag}, ${entityTag}` },
      { 'if-match': entityTag.slice(1, -1) },
      { 'if-match': 'not-a-tag' },
      { 'if-match': '' },
      { 'if-match': '   ' },
      { 'if-match': formatRecordEntityTag('record-2', 7) },
      { 'if-match': [entityTag, entityTag] },
    ];
    for (const headers of cases) {
      expect(parsePublicRecordConcurrencyRequest(headers, oid), JSON.stringify(headers)).to.deep.equal({
        valid: false,
        code: 'record-if-match-invalid',
        header: 'If-Match',
      });
    }
  });

  it('keeps create precondition-free while accepting browser form binding', function () {
    expect(parsePublicRecordConcurrencyRequest({}, undefined, { formBacked: true })).to.deep.equal({
      valid: true,
      context: { entityTagSupplied: false },
    });
    expect(
      parsePublicRecordConcurrencyRequest({ 'x-redbox-form-fingerprint': 'fingerprint-1' }, undefined, {
        formBacked: true,
      })
    ).to.deep.equal({
      valid: true,
      context: { entityTagSupplied: false, formFingerprint: 'fingerprint-1' },
    });
    expect(parsePublicRecordConcurrencyRequest({ 'if-match': formatRecordEntityTag(oid, 0) }, undefined)).to.deep.equal(
      {
        valid: false,
        code: 'record-if-match-invalid',
        header: 'If-Match',
      }
    );
    expect(parsePublicRecordConcurrencyRequest({ 'if-match': '   ' }, undefined)).to.deep.equal({
      valid: false,
      code: 'record-if-match-invalid',
      header: 'If-Match',
    });
  });

  it('validates form fingerprints only for generated browser-form mutations', function () {
    expect(
      parsePublicRecordConcurrencyRequest({ 'x-redbox-form-fingerprint': 'contains whitespace' }, oid, {
        formBacked: true,
      })
    ).to.deep.equal({
      valid: false,
      code: 'record-form-fingerprint-invalid',
      header: 'X-ReDBox-Form-Fingerprint',
    });
    expect(
      parsePublicRecordConcurrencyRequest({ 'x-redbox-form-fingerprint': 'contains whitespace' }, oid)
    ).to.deep.equal({ valid: true, context: { entityTagSupplied: false } });
    expect(
      parsePublicRecordConcurrencyRequest({ 'if-match': formatRecordEntityTag(oid, 7) }, oid, { formBacked: true })
    ).to.deep.equal({
      valid: false,
      code: 'record-form-fingerprint-invalid',
      header: 'X-ReDBox-Form-Fingerprint',
    });
    // Preserve the old-tab path: with neither concurrency header, strict mode
    // reaches RecordsService and returns typed 428 review-only semantics.
    expect(parsePublicRecordConcurrencyRequest({}, oid, { formBacked: true })).to.deep.equal({
      valid: true,
      context: { entityTagSupplied: false },
    });
  });

  it('enforces public resolution labels and canonical request linkage', function () {
    expect(
      parsePublicRecordConcurrencyRequest(
        {
          'x-redbox-save-request-id': requestId,
          'x-redbox-concurrency-resolution': 'client-auto-merged',
          'x-redbox-resolution-of-request-id': priorRequestId,
        },
        oid
      )
    ).to.deep.equal({
      valid: true,
      context: {
        entityTagSupplied: false,
        resolution: 'client-auto-merged',
        resolutionOfRequestId: priorRequestId,
      },
    });

    const invalidCases: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      { 'x-redbox-concurrency-resolution': 'internal' },
      { 'x-redbox-concurrency-resolution': 'already-current' },
      { 'x-redbox-concurrency-resolution': 'client-auto-merged' },
      {
        'x-redbox-save-request-id': 'not-a-request-id',
        'x-redbox-concurrency-resolution': 'client-auto-merged',
        'x-redbox-resolution-of-request-id': priorRequestId,
      },
      { 'x-redbox-resolution-of-request-id': priorRequestId },
      {
        'x-redbox-save-request-id': requestId,
        'x-redbox-concurrency-resolution': 'direct',
        'x-redbox-resolution-of-request-id': priorRequestId,
      },
      {
        'x-redbox-save-request-id': requestId,
        'x-redbox-concurrency-resolution': 'client-manually-resolved',
        'x-redbox-resolution-of-request-id': requestId,
      },
    ];
    for (const headers of invalidCases) {
      const result = parsePublicRecordConcurrencyRequest(headers, oid);
      expect(result.valid, JSON.stringify(headers)).to.equal(false);
    }
  });

  it('does not invoke header accessors or copy attacker-controlled fields', function () {
    const headers: Record<string, unknown> = { injected: { secret: 'candidate' } };
    Object.defineProperty(headers, 'If-Match', {
      enumerable: true,
      get() {
        throw new Error('must not execute');
      },
    });
    expect(parsePublicRecordConcurrencyRequest(headers, oid)).to.deep.equal({
      valid: true,
      context: { entityTagSupplied: false },
    });
  });

  it('builds the shared concurrency request failure body for both API versions', function () {
    const failure = { code: 'record-if-match-invalid', header: 'If-Match' };
    expect(recordConcurrencyRequestFailureResponse('1.0', failure)).to.deep.equal({
      status: 400,
      v1: { message: 'Invalid record concurrency request.' },
    });
    expect(recordConcurrencyRequestFailureResponse('2.0', failure)).to.deep.equal({
      status: 400,
      displayErrors: [{ code: failure.code, source: { header: failure.header } }],
    });
  });

  it('builds read and save headers only from authoritative typed concurrency facts', function () {
    const representation = recordRepresentationConcurrency({ redboxOid: oid, revision: 9, metadata: {} });
    expect(representation.metadata.revision).to.equal(9);
    expect(representation.headers.ETag).to.equal(formatRecordEntityTag(oid, 9));
    expect(recordRepresentationConcurrency({ redboxOid: oid, metadata: {} }).metadata.revision).to.equal(0);

    expect(recordSaveResultHeaders({ concurrency: representation.metadata })).to.deep.equal(representation.headers);
    expect(recordSaveResultHeaders({ concurrency: { revision: 9 } })).to.deep.equal({});
    expect(recordSaveResultHeaders(undefined)).to.deep.equal({});
  });
});
