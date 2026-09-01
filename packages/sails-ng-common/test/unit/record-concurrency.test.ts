import {
  coerceRecordConcurrentModificationConfig,
  DEFAULT_RECORD_CONCURRENT_MODIFICATION_CONFIG,
  DEFAULT_RECORD_CONCURRENT_MODIFICATION_MODE,
  isRecordConcurrencyMetadata,
  isRecordConcurrencyRequestId,
  isRecordConcurrencyProblemCode,
  isRecordConcurrencyResolution,
  isRecordConcurrentModificationConfig,
  isRecordConcurrentModificationMode,
  isRecordEntityTag,
  isRecordFormFingerprint,
  isRecordRevision,
  recordEntityTagRevision,
  isRecordSaveProblemKind,
  RECORD_CONCURRENCY_PROBLEM_CODES,
  RECORD_CONCURRENCY_RESOLUTIONS,
  RECORD_ENTITY_TAG_MAX_LENGTH,
  RECORD_FORM_FINGERPRINT_MAX_LENGTH,
  RECORD_REVISION_MAX,
  RECORD_SAVE_PROBLEM_KINDS,
  resolveRecordConcurrentModificationConfig,
  sanitizeRecordConcurrencyMetadata,
  validateRecordConcurrentModificationConfig,
  type RecordConcurrencyMetadata,
  type RecordConcurrentModificationConfig,
  type RecordSaveProblemKind,
} from '../../src';

describe('record concurrency contracts', function () {
  let expect: Chai.ExpectStatic;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  describe('record-type policy', function () {
    it('uses last-write-wins only when policy is absent', function () {
      expect(DEFAULT_RECORD_CONCURRENT_MODIFICATION_MODE).to.equal('last-write-wins');
      expect(DEFAULT_RECORD_CONCURRENT_MODIFICATION_CONFIG).to.deep.equal({ mode: 'last-write-wins' });
      // `null` is how an unset JSON column reads back from storage, so it is
      // absent policy rather than corrupt policy.
      for (const absent of [undefined, null]) {
        expect(validateRecordConcurrentModificationConfig(absent)).to.deep.equal({
          valid: true,
          config: { mode: 'last-write-wins' },
          defaulted: true,
        });
        expect(resolveRecordConcurrentModificationConfig(absent)).to.deep.equal({ mode: 'last-write-wins' });
        expect(isRecordConcurrentModificationConfig(absent)).to.equal(false);
      }
    });

    it('returns an isolated default that callers cannot mutate into shared state', function () {
      const first = resolveRecordConcurrentModificationConfig(undefined);
      first.mode = 'strict';
      expect(resolveRecordConcurrentModificationConfig(undefined)).to.deep.equal({ mode: 'last-write-wins' });
      expect(DEFAULT_RECORD_CONCURRENT_MODIFICATION_CONFIG.mode).to.equal('last-write-wins');
    });

    it('accepts every configured mode through the public types and guards', function () {
      for (const mode of ['last-write-wins', 'observe', 'strict'] as const) {
        const config: RecordConcurrentModificationConfig = { mode };
        expect(isRecordConcurrentModificationMode(mode)).to.equal(true);
        expect(isRecordConcurrentModificationConfig(config)).to.equal(true);
        expect(resolveRecordConcurrentModificationConfig(config)).to.deep.equal(config);
      }
    });

    it('reports malformed explicit configuration instead of silently defaulting it', function () {
      for (const malformed of ['strict', 42, true, ['strict'], new Date()]) {
        expect(validateRecordConcurrentModificationConfig(malformed)).to.deep.equal({
          valid: false,
          reason: 'malformed-config',
        });
      }
      for (const malformed of [{}, { mode: 'permissive' }, { mode: null }, { mode: ['strict'] }]) {
        expect(validateRecordConcurrentModificationConfig(malformed)).to.deep.equal({
          valid: false,
          reason: 'malformed-mode',
        });
      }
      expect(() => resolveRecordConcurrentModificationConfig({ mode: 'permissive' })).to.throw(TypeError);
      expect(isRecordConcurrentModificationConfig({ mode: 'permissive' })).to.equal(false);
    });

    it('coerces malformed policy only on presentation boundaries', function () {
      expect(coerceRecordConcurrentModificationConfig({ mode: 'strict' })).to.deep.equal({ mode: 'strict' });
      expect(coerceRecordConcurrentModificationConfig({ mode: 'permissive' })).to.deep.equal({
        mode: 'last-write-wins',
      });
      expect(coerceRecordConcurrentModificationConfig('nonsense')).to.deep.equal({ mode: 'last-write-wins' });
      // The enforcement boundary must still refuse the same input.
      expect(() => resolveRecordConcurrentModificationConfig({ mode: 'permissive' })).to.throw(TypeError);
    });
  });

  describe('result metadata and safe codes', function () {
    const entityTag = `"rb-record-v1.7.${'a'.repeat(43)}"`;
    const requestId = '11111111-1111-4111-8111-111111111111';

    it('exports every diagnostic resolution and stable problem code', function () {
      expect(RECORD_CONCURRENCY_RESOLUTIONS).to.deep.equal([
        'direct',
        'already-current',
        'client-auto-merged',
        'client-manually-resolved',
        'internal',
      ]);
      expect(RECORD_CONCURRENCY_RESOLUTIONS.every(isRecordConcurrencyResolution)).to.equal(true);
      expect(RECORD_CONCURRENCY_PROBLEM_CODES).to.deep.equal([
        'record-precondition-required',
        'record-revision-stale',
        'record-deleted',
        'record-concurrency-capability-unavailable',
        'form-definition-changed',
        'record-lifecycle-operation-conflict',
      ]);
      expect(RECORD_CONCURRENCY_PROBLEM_CODES.every(isRecordConcurrencyProblemCode)).to.equal(true);

      const problemKind: RecordSaveProblemKind = 'conflict';
      expect(problemKind).to.equal('conflict');
      // `conflict` joins the existing kinds; none of them are replaced.
      expect(RECORD_SAVE_PROBLEM_KINDS).to.deep.equal([
        'validation',
        'processing',
        'authorization',
        'conflict',
        'system',
        'network',
      ]);
      expect(RECORD_SAVE_PROBLEM_KINDS.every(isRecordSaveProblemKind)).to.equal(true);
      for (const invalid of ['conflicts', '', 'CONFLICT', undefined, null, 1]) {
        expect(isRecordSaveProblemKind(invalid)).to.equal(false);
      }
    });

    it('accepts bounded concurrency metadata through the shared result contract', function () {
      const metadata: RecordConcurrencyMetadata = {
        mode: 'strict',
        revision: 8,
        expectedRevision: 7,
        currentRevision: 8,
        entityTag,
        formFingerprint: 'sha256:abc_DEF-123',
        resolution: 'client-auto-merged',
        resolutionOfRequestId: requestId,
      };
      expect(isRecordConcurrencyMetadata(metadata)).to.equal(true);
      expect(sanitizeRecordConcurrencyMetadata(metadata)).to.deep.equal(metadata);
    });

    it('bounds revisions and drops malformed diagnostic fields', function () {
      expect(isRecordRevision(0)).to.equal(true);
      expect(isRecordRevision(RECORD_REVISION_MAX)).to.equal(true);
      for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, RECORD_REVISION_MAX + 1]) {
        expect(isRecordRevision(invalid)).to.equal(false);
      }

      const sanitized = sanitizeRecordConcurrencyMetadata({
        mode: 'observe',
        revision: -1,
        expectedRevision: RECORD_REVISION_MAX + 1,
        currentRevision: 2.5,
        entityTag: '7',
        formFingerprint: 'contains whitespace',
        resolution: 'force',
        resolutionOfRequestId: 'x'.repeat(500),
        rawRequest: { authorization: 'secret' },
      });
      expect(sanitized).to.deep.equal({ mode: 'observe' });
      expect(isRecordConcurrencyMetadata({ mode: 'observe', revision: -1 })).to.equal(false);
      expect(JSON.stringify(sanitized)).not.to.contain('secret');
    });

    it('guards structural entity tags and independent form fingerprints', function () {
      expect(isRecordEntityTag(entityTag)).to.equal(true);
      expect(recordEntityTagRevision(entityTag)).to.equal(7);
      expect(recordEntityTagRevision('not-an-entity-tag')).to.equal(undefined);
      expect(isRecordEntityTag('7')).to.equal(false);
      expect(isRecordEntityTag(`"rb-record-v1.7.${'a'.repeat(42)}"`)).to.equal(false);
      expect(isRecordEntityTag('x'.repeat(RECORD_ENTITY_TAG_MAX_LENGTH + 1))).to.equal(false);

      expect(isRecordFormFingerprint('sha256:abc_DEF-123')).to.equal(true);
      expect(isRecordFormFingerprint('')).to.equal(false);
      expect(isRecordFormFingerprint('a,b')).to.equal(false);
      expect(isRecordFormFingerprint(['sha256:abc'])).to.equal(false);
      expect(isRecordFormFingerprint('x'.repeat(RECORD_FORM_FINGERPRINT_MAX_LENGTH + 1))).to.equal(false);

      // A fingerprint is deliberately not a revision or an entity tag.
      expect(isRecordFormFingerprint(entityTag)).to.equal(false);
      expect(isRecordEntityTag('sha256:abc_DEF-123')).to.equal(false);
    });

    it('accepts only canonical request linkage identifiers', function () {
      expect(isRecordConcurrencyRequestId(requestId)).to.equal(true);
      expect(isRecordConcurrencyRequestId(requestId.toUpperCase())).to.equal(true);
      for (const invalid of [
        '',
        'not-a-uuid',
        `${requestId} `,
        `${requestId},${requestId}`,
        '11111111-1111-0111-8111-111111111111',
        '11111111-1111-4111-c111-111111111111',
        undefined,
        42,
      ]) {
        expect(isRecordConcurrencyRequestId(invalid)).to.equal(false);
      }
    });

    it('drops unknown keys instead of widening the diagnostic contract', function () {
      expect(sanitizeRecordConcurrencyMetadata(undefined)).to.equal(undefined);
      expect(sanitizeRecordConcurrencyMetadata({})).to.equal(undefined);
      expect(sanitizeRecordConcurrencyMetadata([{ mode: 'strict' }])).to.equal(undefined);
      expect(sanitizeRecordConcurrencyMetadata({ mode: 'strict', actor: 'admin', oid: 'oid-1' })).to.deep.equal({
        mode: 'strict',
      });
      expect(isRecordConcurrencyMetadata({ mode: 'strict', actor: 'admin' })).to.equal(true);
    });
  });
});
