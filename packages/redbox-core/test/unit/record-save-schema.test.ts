import {
  RECORD_SAVE_MESSAGE_MAX_LENGTH,
  RECORD_SAVE_VALIDATOR_CLASS_MAX_LENGTH,
} from '@researchdatabox/sails-ng-common';
import {
  recordConcurrencyMetadataSchema,
  recordSaveIssueSchema,
  storageServiceResponseSchema,
} from '../../src/api-routes/schemas/responses';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';

describe('record-save issue response schema', function () {
  let expect: Chai.ExpectStatic;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  it('accepts additive safe validator and lineage metadata', function () {
    const result = recordSaveIssueSchema.safeParse({
      code: 'record-validation-failed',
      message: '@validator-error-min-length',
      field: 'title',
      pointer: '/metadata/title',
      expected: { type: 'string' },
      class: 'minLength',
      params: { actualLength: 2, requiredLength: 3 },
      targetField: { dataModel: ['title'] },
      lineagePaths: {
        formConfig: ['componentDefinitions', 0],
        dataModel: ['title'],
        angularComponentsJsonPointer: '/title',
      },
    });

    expect(result.success).to.equal(true);
  });

  it('accepts root and nested RFC 6901 pointers', function () {
    for (const pointer of ['', '/metadata/title', '/a~0b/~1']) {
      expect(
        recordSaveIssueSchema.safeParse({
          code: 'record-schema.type',
          message: '@record-schema.type',
          pointer,
        }).success
      ).to.equal(true);
    }
  });

  it('rejects malformed RFC 6901 pointer escapes', function () {
    for (const pointer of ['/a~2b', '/a~']) {
      expect(recordSaveIssueSchema.safeParse({ message: '@record-schema.type', pointer }).success).to.equal(false);
    }
  });

  it('accepts only the allowlisted expected type shape', function () {
    expect(recordSaveIssueSchema.safeParse({
      message: '@record-schema.type',
      expected: { type: 'integer' },
    }).success).to.equal(true);
    expect(recordSaveIssueSchema.safeParse({
      message: '@record-schema.type',
      expected: { type: 'custom' },
    }).success).to.equal(false);
    expect(recordSaveIssueSchema.safeParse({
      message: '@record-schema.type',
      expected: { type: 'string', submitted: 'secret' },
    }).success).to.equal(false);
  });

  it('accepts schema source, phase, and code metadata in a typed save problem', function () {
    const result = storageServiceResponseSchema.safeParse({
      success: false,
      oid: '',
      message: '',
      metadata: null,
      totalItems: 0,
      items: [],
      outcome: 'not-saved',
      problems: [
        {
          kind: 'validation',
          source: 'schema',
          phase: 'schema',
          issues: [
            {
              code: 'record-schema.type',
              message: '@record-schema.type',
              pointer: '',
            },
          ],
        },
      ],
    });

    expect(result.success).to.equal(true);
  });

  it('rejects nested, unknown, or excessive validator parameters', function () {
    expect(
      recordSaveIssueSchema.safeParse({
        message: '@validator-error',
        params: { nested: { token: 'secret' } },
      }).success
    ).to.equal(false);

    expect(
      recordSaveIssueSchema.safeParse({
        message: '@validator-error',
        params: { submittedValue: 'secret' },
      }).success
    ).to.equal(false);
  });

  it('rejects an excessive validator class identifier', function () {
    expect(
      recordSaveIssueSchema.safeParse({
        message: '@validator-error',
        class: 'x'.repeat(RECORD_SAVE_VALIDATOR_CLASS_MAX_LENGTH + 1),
      }).success
    ).to.equal(false);
  });

  it('rejects an excessive issue message', function () {
    expect(
      recordSaveIssueSchema.safeParse({
        message: 'x'.repeat(RECORD_SAVE_MESSAGE_MAX_LENGTH + 1),
      }).success
    ).to.equal(false);
  });

  it('accepts only bounded typed concurrency metadata', function () {
    expect(
      recordConcurrencyMetadataSchema.safeParse({
        mode: 'strict',
        revision: 4,
        currentRevision: 4,
        expectedRevision: 3,
        entityTag: formatRecordEntityTag('record-1', 4),
        formFingerprint: 'form-fingerprint-1',
        resolution: 'client-manually-resolved',
        resolutionOfRequestId: '00000000-0000-4000-8000-000000000041',
      }).success
    ).to.equal(true);

    expect(
      recordConcurrencyMetadataSchema.safeParse({
        revision: 4,
        submittedCandidate: { secret: 'must-not-enter-the-envelope' },
      }).success
    ).to.equal(false);
    expect(recordConcurrencyMetadataSchema.safeParse({ revision: -1 }).success).to.equal(false);
    expect(recordConcurrencyMetadataSchema.safeParse({ resolution: 'server-trust-me' }).success).to.equal(false);
  });
});
