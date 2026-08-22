let expect: Chai.ExpectStatic;
import {
  emptyRecordSaveCompletion,
  isRecordSaveOutcome,
  RECORD_SAVE_MESSAGE_MAX_LENGTH,
  RECORD_SAVE_VALIDATOR_CLASS_MAX_LENGTH,
  RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS,
  reduceAttachmentStatus,
  sanitizeRecordSaveIssue,
  sanitizeRecordSaveValidatorParameters,
} from '../../src';

describe('record-save contracts', function () {
  before(async function () {
    expect = (await import('chai')).expect;
  });

  it('creates the empty completion value', function () {
    expect(emptyRecordSaveCompletion()).to.deep.equal({
      attachments: { status: 'not-required', items: [] },
    });
  });

  it('reduces attachment statuses with uncertainty taking precedence', function () {
    expect(reduceAttachmentStatus([])).to.equal('not-required');
    expect(
      reduceAttachmentStatus([
        { field: 'attachments', attachmentId: 'a', operation: 'add', status: 'unknown' },
        { field: 'attachments', attachmentId: 'b', operation: 'add', status: 'incomplete' },
      ])
    ).to.equal('unknown');
    expect(
      reduceAttachmentStatus([{ field: 'attachments', attachmentId: 'a', operation: 'add', status: 'incomplete' }])
    ).to.equal('incomplete');
    expect(
      reduceAttachmentStatus([{ field: 'attachments', attachmentId: 'a', operation: 'add', status: 'completed' }])
    ).to.equal('completed');
  });

  it('recognises only the public save outcomes', function () {
    expect(isRecordSaveOutcome('saved')).to.equal(true);
    expect(isRecordSaveOutcome('saved-with-warnings')).to.equal(true);
    expect(isRecordSaveOutcome('not-saved')).to.equal(true);
    expect(isRecordSaveOutcome('unknown')).to.equal(true);
    expect(isRecordSaveOutcome('other')).to.equal(false);
    expect(isRecordSaveOutcome(undefined)).to.equal(false);
  });

  it('preserves safe validator, target-field, and lineage metadata', function () {
    expect(
      sanitizeRecordSaveIssue({
        code: 'record-validation-failed',
        message: '@validator-error-min-length',
        field: 'title',
        pointer: '/metadata/title',
        class: 'minLength',
        params: { actualLength: 2, requiredLength: 3, validatorClasses: ['minLength', 'required'] },
        targetField: { dataModel: ['title'] },
        lineagePaths: {
          formConfig: ['componentDefinitions', 0],
          dataModel: ['title'],
          angularComponents: ['title'],
          angularComponentsJsonPointer: '/title',
        },
      })
    ).to.deep.equal({
      code: 'record-validation-failed',
      message: '@validator-error-min-length',
      field: 'title',
      pointer: '/metadata/title',
      class: 'minLength',
      params: { actualLength: 2, requiredLength: 3, validatorClasses: ['minLength', 'required'] },
      targetField: { dataModel: ['title'] },
      lineagePaths: {
        formConfig: ['componentDefinitions', 0],
        dataModel: ['title'],
        angularComponents: ['title'],
        angularComponentsJsonPointer: '/title',
      },
    });
  });

  it('drops raw exception/request data and nested validator values', function () {
    const issue = sanitizeRecordSaveIssue({
      message: '@validator-error',
      class: 'required',
      params: {
        required: true,
        nested: { token: 'secret' },
        executable: () => 'secret',
      },
      exception: new Error('database password'),
      request: { headers: { authorization: 'secret' } },
      user: { id: 'private' },
    });

    expect(issue).to.deep.equal({
      message: '@validator-error',
      class: 'required',
      params: { required: true },
    });
    expect(JSON.stringify(issue)).not.to.contain('database password');
    expect(JSON.stringify(issue)).not.to.contain('authorization');
    expect(JSON.stringify(issue)).not.to.contain('private');
  });

  it('returns undefined when no safe validator parameters survive', function () {
    expect(sanitizeRecordSaveValidatorParameters({ nested: { secret: true }, invalid: () => true }))
      .to.equal(undefined);
    expect(sanitizeRecordSaveIssue({ message: 'safe', targetField: { unknown: ['secret'] }, lineagePaths: {} }))
      .to.deep.equal({ message: 'safe' });
  });

  it('filters invalid parameter entries before applying the entry bound', function () {
    const invalidEntries = Object.fromEntries(
      Array.from({ length: RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS.maxEntries }, (_unused, index) => [
        `invalid key ${index}`,
        index,
      ])
    );
    const params = sanitizeRecordSaveValidatorParameters({ ...invalidEntries, validAfterInvalid: true });

    expect(params).to.deep.equal({ validAfterInvalid: true });
  });

  it('bounds the public issue message', function () {
    const issue = sanitizeRecordSaveIssue({ message: 'x'.repeat(RECORD_SAVE_MESSAGE_MAX_LENGTH + 10) });
    expect(issue.message).to.have.length(RECORD_SAVE_MESSAGE_MAX_LENGTH);
  });

  it('bounds parameter entries, arrays, strings, and serialized size', function () {
    const values = Object.fromEntries(
      Array.from({ length: 30 }, (_unused, index) => [`item${index}`, 'x'.repeat(1_000)])
    );
    const params = sanitizeRecordSaveValidatorParameters({
      arrayValue: Array.from({ length: 30 }, () => 'value'),
      ...values,
    });

    expect(Object.keys(params ?? {})).to.have.length.at.most(RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS.maxEntries);
    expect(JSON.stringify(params).length).to.be.at.most(RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS.maxSerializedLength);
    for (const value of Object.values(params ?? {})) {
      if (typeof value === 'string') {
        expect(value.length).to.be.at.most(RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS.maxStringLength);
      }
      if (Array.isArray(value)) {
        expect(value.length).to.be.at.most(RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS.maxArrayLength);
      }
    }
  });

  it('drops an excessive validator class identifier', function () {
    const issue = sanitizeRecordSaveIssue({
      message: '@validator-error',
      class: 'x'.repeat(RECORD_SAVE_VALIDATOR_CLASS_MAX_LENGTH + 1),
    });

    expect(issue).to.deep.equal({ message: '@validator-error' });
  });
});
