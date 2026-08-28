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

  it('accepts only the bounded action execution summary allowlist', function () {
    const response = {
      success: false,
      oid: 'record-1',
      message: '@record-save-failed',
      metadata: null,
      totalItems: 0,
      items: [],
      problems: [
        {
          kind: 'processing',
          phase: 'pre-save',
          issues: [{ code: 'pre-save-processing-failed', message: '@record-save-pre-save-processing-failed' }],
          executionSummary: {
            schemaVersion: 1,
            executionId: 'execution-1',
            requestId: '00000000-0000-4000-8000-000000000041',
            trigger: 'record-hook',
            operation: 'create',
            partial: false,
            completedThrough: 'pre',
            durationMs: 4,
            totalActions: 1,
            counts: { failed: 1 },
            actions: [
              {
                actionId: 'redbox.test.action',
                mode: 'onCreate',
                phase: 'pre',
                status: 'failed',
                attempts: 1,
                durationMs: 3,
                failureKind: 'validation',
                failureCode: 'action-validation',
              },
            ],
            truncated: false,
          },
        },
      ],
    };

    expect(storageServiceResponseSchema.safeParse(response).success).to.equal(true);
    expect(
      storageServiceResponseSchema.safeParse({
        ...response,
        problems: [
          {
            ...response.problems[0],
            executionSummary: {
              ...response.problems[0].executionSummary,
              record: { metadata: { token: 'secret' } },
            },
          },
        ],
      }).success
    ).to.equal(false);
    expect(
      storageServiceResponseSchema.safeParse({
        ...response,
        problems: [
          {
            ...response.problems[0],
            executionSummary: {
              ...response.problems[0].executionSummary,
              actions: [{ ...response.problems[0].executionSummary.actions[0], handler: 'function-string' }],
            },
          },
        ],
      }).success
    ).to.equal(false);
  });
});
