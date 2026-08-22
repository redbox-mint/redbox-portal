import {
  RECORD_SAVE_MESSAGE_MAX_LENGTH,
  RECORD_SAVE_VALIDATOR_CLASS_MAX_LENGTH,
} from '@researchdatabox/sails-ng-common';
import { recordSaveIssueSchema } from '../../src/api-routes/schemas/responses';

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

  it('rejects nested or excessive validator parameters', function () {
    expect(
      recordSaveIssueSchema.safeParse({
        message: '@validator-error',
        params: { nested: { token: 'secret' } },
      }).success
    ).to.equal(false);

    expect(
      recordSaveIssueSchema.safeParse({
        message: '@validator-error',
        params: Object.fromEntries(Array.from({ length: 17 }, (_unused, index) => [`item${index}`, index])),
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
});
