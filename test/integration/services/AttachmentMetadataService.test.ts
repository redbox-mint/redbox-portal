import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services as AttachmentMetadataServices } from '../../../packages/redbox-core/src/services/AttachmentMetadataService';
import type { AttachmentAccessAuditAttributes } from '../../../packages/redbox-core/src/waterline-models';

describe('AttachmentMetadataService integration', function () {
  let service: AttachmentMetadataServices.AttachmentMetadataService;

  before(function () {
    service = new AttachmentMetadataServices.AttachmentMetadataService();
  });

  beforeEach(async function () {
    await AttachmentAccessAudit.destroy({});
    await AttachmentMetadata.destroy({});
  });

  it('upserts insert and update paths and can query by oid', async function () {
    await service.upsert({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      filename: 'Initial.txt',
      contentLength: 1,
    });

    await service.upsert({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      filename: 'Updated.txt',
      contentLength: 2,
    });

    const rows = await service.findByOid('oid-1');
    expect(rows).to.have.length(1);
    expect(rows[0].filename).to.equal('Updated.txt');
    expect(rows[0].contentLength).to.equal(2);
  });

  it('deletes by storage key idempotently', async function () {
    await service.upsert({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
    });

    await service.deleteByStorageKey('attachments/oid-1/file-1');
    await service.deleteByStorageKey('attachments/oid-1/file-1');

    const row = await service.findOneByStorageKey('attachments/oid-1/file-1');
    expect(row).to.equal(undefined);
  });

  it('records list and file access events and updates summary fields', async function () {
    await service.upsert({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      accessCount: 0,
    });

    await service.recordAccess({ oid: 'oid-1', action: 'list', itemCount: 1, accessedBy: 'alice' });
    await service.recordAccess({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      action: 'download',
      accessedBy: 'alice',
    });

    const audits = await AttachmentAccessAudit.find({ oid: 'oid-1' }).sort([{ createdAt: 'ASC' }]) as AttachmentAccessAuditAttributes[];
    const row = await service.findOneByStorageKey('attachments/oid-1/file-1');

    expect(audits).to.have.length(2);
    expect(audits[0].action).to.equal('list');
    expect(audits[0].itemCount).to.equal(1);
    expect(audits[1].action).to.equal('download');
    expect(row?.accessCount).to.equal(1);
    expect(row?.lastAccessedBy).to.equal('alice');
    expect(row?.lastAccessedAt).to.exist;
  });

  it('does not increment accessCount for upload events', async function () {
    await service.upsert({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      accessCount: 1,
    });

    await service.recordAccess({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      action: 'upload',
      accessedBy: 'alice',
    });

    const row = await service.findOneByStorageKey('attachments/oid-1/file-1');

    expect(row?.accessCount).to.equal(1);
    expect(row?.lastAccessedBy).to.equal('alice');
    expect(row?.lastAccessedAt).to.exist;
  });

  it('rejects and rolls back the audit row when metadata update fails', async function () {
    await service.upsert({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      accessCount: 0,
    });
    const originalRow = await service.findOneByStorageKey('attachments/oid-1/file-1');

    const updateOneStub = sinon.stub(AttachmentMetadata, 'updateOne').callsFake(() => ({
      set: async () => {
        throw new Error('metadata update failed');
      },
    }) as never);

    try {
      await service.recordAccess({
        oid: 'oid-1',
        fileId: 'file-1',
        storageKey: 'attachments/oid-1/file-1',
        action: 'download',
        accessedBy: 'alice',
      });
      expect.fail('Expected recordAccess to reject');
    } catch (err) {
      expect((err as Error).message).to.equal('metadata update failed');
    } finally {
      updateOneStub.restore();
    }

    const audits = await AttachmentAccessAudit.find({ oid: 'oid-1' }) as AttachmentAccessAuditAttributes[];
    const row = await service.findOneByStorageKey('attachments/oid-1/file-1');

    expect(audits).to.have.length(0);
    expect(row?.accessCount).to.equal(originalRow?.accessCount);
    expect(row?.lastAccessedAt).to.equal(originalRow?.lastAccessedAt);
    expect(row?.lastAccessedBy).to.equal(originalRow?.lastAccessedBy);
  });

  it('propagates failures during recordAccess audit creation', async function () {
    const createStub = sinon.stub(AttachmentAccessAudit, 'create').throws(new Error('boom'));

    try {
      await service.recordAccess({ oid: 'oid-1', action: 'list' });
      expect.fail('Expected recordAccess to reject');
    } catch (err) {
      expect((err as Error).message).to.equal('boom');
    } finally {
      createStub.restore();
    }
  });

  it('rejects blank identifier fields on update', async function () {
    const created = await AttachmentMetadata.create({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
    }).fetch();

    try {
      await AttachmentMetadata.updateOne({ id: created.id }).set({ oid: '   ' });
      expect.fail('Expected update to reject');
    } catch (err) {
      expect((err as Error).message).to.include('AttachmentMetadata.oid is required');
    }
  });
});
