let expect: Chai.ExpectStatic;
import { AttachmentMetadataWLDef } from '../../src/waterline-models/AttachmentMetadata';

type WaterlineDef = {
  beforeCreate?: (record: Record<string, unknown>, cb: (err?: Error) => void) => void;
  beforeUpdate?: (record: Record<string, unknown>, cb: (err?: Error) => void) => void;
};

function runHook(
  def: WaterlineDef,
  hook: 'beforeCreate' | 'beforeUpdate',
  record: Record<string, unknown>
): { record: Record<string, unknown>; error?: Error } {
  let error: Error | undefined;
  def[hook]!(record, caught => {
    error = caught;
  });
  return { record, error };
}

describe('AttachmentMetadata waterline model', function () {
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
    const result = runHook(AttachmentMetadataWLDef, 'beforeCreate', {
      ...valid(),
      accessCount: 'not-a-number',
      isJournal: 1,
      attachmentId: ' attachment-1 ',
      operation: ' add ',
      mutationState: ' pending ',
      generation: ` ${'g'.repeat(140)} `,
      mutationFileId: ' file-new ',
      attemptCount: '2.8',
      lastAttemptAt: '2026-08-22T00:00:00Z',
      lastSafeErrorCode: ` ${'x'.repeat(140)} `,
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
      attemptCount: 2,
    });
    expect(String(result.record.generation)).to.have.length(128);
    expect(String(result.record.lastSafeErrorCode)).to.have.length(128);
    expect(result.record.lastAttemptAt).to.equal('2026-08-22T00:00:00.000Z');
  });

  it('normalizes valid partial updates and clears invalid optional values', function () {
    const result = runHook(AttachmentMetadataWLDef, 'beforeUpdate', {
      accessCount: Infinity,
      isJournal: true,
      attachmentId: '   ',
      operation: '',
      mutationState: '',
      generation: '   ',
      mutationFileId: '   ',
      attemptCount: -2,
      lastAttemptAt: 'not-a-date',
      lastSafeErrorCode: '   ',
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
      attemptCount: 0,
      lastAttemptAt: undefined,
      lastSafeErrorCode: undefined,
    });
  });

  it('rejects invalid journal identifiers and states', function () {
    expect(
      runHook(AttachmentMetadataWLDef, 'beforeCreate', {
        ...valid(),
        attachmentId: 'bad id',
      }).error?.message
    ).to.match(/attachmentId must be a bounded identifier/);
    expect(
      runHook(AttachmentMetadataWLDef, 'beforeUpdate', {
        operation: 'replace',
      }).error?.message
    ).to.match(/operation is invalid/);
    expect(
      runHook(AttachmentMetadataWLDef, 'beforeCreate', {
        ...valid(),
        mutationState: 'running',
      }).error?.message
    ).to.match(/mutationState is invalid/);
  });

  it('enforces required physical identity on create and update', function () {
    expect(
      runHook(AttachmentMetadataWLDef, 'beforeCreate', {
        fileId: 'file-1',
        storageKey: 'key-1',
      }).error?.message
    ).to.match(/oid is required/);
    expect(
      runHook(AttachmentMetadataWLDef, 'beforeUpdate', {
        storageKey: '   ',
      }).error?.message
    ).to.match(/storageKey is required/);
  });
});
