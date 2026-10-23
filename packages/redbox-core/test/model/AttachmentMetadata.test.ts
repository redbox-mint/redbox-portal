let expect: Chai.ExpectStatic;

import { normalizeAttachmentMetadata } from '../../src/persistence/storage/attachmentNormalization';
const AttachmentMetadataContract = {};
function runHook(_def: unknown, hook: string, record: Record<string, unknown>) {
  try { normalizeAttachmentMetadata(record, hook === 'beforeCreate'); return { record, error: undefined }; }
  catch(error) { return { record, error: error as Error }; }
}

describe('AttachmentMetadata normalization', function () {
  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  function valid() {
    return {
      oid: ' oid-1 ',
      fileId: ' file-1 ',
      storageKey: ' oid-1/file-1 ',
    };
  }

  it('normalizes journal metadata and access counters on create', function () {
    const result = runHook(AttachmentMetadataContract, 'beforeCreate', {
      ...valid(),
      accessCount: 'not-a-number',
      isJournal: 1,
      attachmentId: ' attachment-1 ',
      operation: ' add ',
      mutationState: ' pending ',
      generation: ` ${'g'.repeat(140)} `,
      mutationFileId: ' file-new ',
    });

    expect(result.error).to.be.undefined;
    expect(result.record).to.include({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'oid-1/file-1',
      isJournal: false,
      attachmentId: 'attachment-1',
      operation: 'add',
      mutationState: 'pending',
      mutationFileId: 'file-new',
    });
    expect(String(result.record.generation)).to.have.length(128);
  });

  it('normalizes valid partial updates and clears invalid optional values', function () {
    const result = runHook(AttachmentMetadataContract, 'beforeUpdate', {
      accessCount: Infinity,
      isJournal: true,
      attachmentId: '   ',
      operation: '',
      mutationState: '',
      generation: '   ',
      mutationFileId: '   ',
    });

    expect(result.error).to.be.undefined;
    expect(result.record).to.include({
      accessCount: 0,
      isJournal: true,
      attachmentId: undefined,
      operation: undefined,
      mutationState: undefined,
      generation: undefined,
      mutationFileId: undefined,
    });
  });

  it('rejects invalid journal identifiers and states', function () {
    expect(
      runHook(AttachmentMetadataContract, 'beforeCreate', {
        ...valid(),
        attachmentId: 'bad id',
      }).error?.message
    ).to.match(/attachmentId must be a bounded identifier/);
    expect(
      runHook(AttachmentMetadataContract, 'beforeUpdate', {
        operation: 'replace',
      }).error?.message
    ).to.match(/operation is invalid/);
    expect(
      runHook(AttachmentMetadataContract, 'beforeCreate', {
        ...valid(),
        mutationState: 'running',
      }).error?.message
    ).to.match(/mutationState is invalid/);
  });

  it('enforces required physical identity on create and update', function () {
    expect(
      runHook(AttachmentMetadataContract, 'beforeCreate', {
        fileId: 'file-1',
        storageKey: 'key-1',
      }).error?.message
    ).to.match(/oid is required/);
    expect(
      runHook(AttachmentMetadataContract, 'beforeUpdate', {
        storageKey: '   ',
      }).error?.message
    ).to.match(/storageKey is required/);
  });
});
