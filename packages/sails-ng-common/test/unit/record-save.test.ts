let expect: Chai.ExpectStatic;
import { emptyRecordSaveCompletion, isRecordSaveOutcome, reduceAttachmentStatus } from '../../src';

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
});
