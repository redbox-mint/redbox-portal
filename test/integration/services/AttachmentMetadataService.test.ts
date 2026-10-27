import { fixtureRemove, fixtureRows, fixtureCount, fixtureCreate, fixturePatchOne } from '../../helpers/persistenceFixtures';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { inspect } from 'node:util';
import { Services as AttachmentMetadataServices } from '../../../packages/redbox-core/src/services/AttachmentMetadataService.ts';
import { getStorageRepositories } from '@researchdatabox/redbox-core';
import type { AttachmentAccessAuditAttributes } from '../../../packages/redbox-core/src/persistence/rows';

describe('AttachmentMetadataService integration', function () {
  let service: AttachmentMetadataServices.AttachmentMetadataService;

  before(function () {
    service = new AttachmentMetadataServices.AttachmentMetadataService();
  });

  beforeEach(async function () {
    await fixtureRemove("AttachmentAccessAudit", {});
    await fixtureRemove("AttachmentMetadata", {});
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

    const audits = await fixtureRows("AttachmentAccessAudit", { oid: 'oid-1' }, {sort: [{ createdAt: 'ASC' }]}) as AttachmentAccessAuditAttributes[];
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

  it('does not append an audit when the baseline metadata update fails', async function () {
    const baselineService = new AttachmentMetadataServices.AttachmentMetadataService(
      getStorageRepositories().attachments
    );
    await service.upsert({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      accessCount: 0,
    });
    const originalRow = await service.findOneByStorageKey('attachments/oid-1/file-1');

    const model = Reflect.get(getStorageRepositories().attachments, 'client').orm.attachmentmetadata;
    const where = model.where.bind(model);
    const updateOneStub = sinon.stub(model, 'where').callsFake((criteria: any) => {
      const query = where(criteria);
      sinon.stub(query, 'update').rejects(new Error('metadata update failed'));
      return query;
    });

    try {
      await baselineService.recordAccess({
        oid: 'oid-1',
        fileId: 'file-1',
        storageKey: 'attachments/oid-1/file-1',
        action: 'download',
        accessedBy: 'alice',
      });
      expect.fail('Expected recordAccess to reject');
    } catch (err) {
      expect(err).to.have.property('code', 'storage-unknown');
      expect((err as Error).message).to.include('unknown outcome');
      expect(inspect(err, { depth: 10 })).not.to.include('metadata update failed');
    } finally {
      updateOneStub.restore();
    }

    const audits = await fixtureRows("AttachmentAccessAudit", { oid: 'oid-1' }) as AttachmentAccessAuditAttributes[];
    const row = await service.findOneByStorageKey('attachments/oid-1/file-1');

    expect(audits).to.have.length(0);
    expect(row?.accessCount).to.equal(originalRow?.accessCount);
    expect(row?.lastAccessedAt).to.equal(originalRow?.lastAccessedAt);
    expect(row?.lastAccessedBy).to.equal(originalRow?.lastAccessedBy);
  });

  it('propagates failures during baseline recordAccess audit creation', async function () {
    const baselineService = new AttachmentMetadataServices.AttachmentMetadataService(
      getStorageRepositories().attachments
    );
    const failure = Object.assign(new Error('private audit payload'), {
      code: 121,
      errInfo: { document: 'private audit document' },
      cause: new Error('private audit credentials'),
    });
    const createStub = sinon.stub(Reflect.get(getStorageRepositories().attachments, 'client').orm.attachmentaccessaudit, 'create').throws(failure);

    try {
      await baselineService.recordAccess({ oid: 'oid-1', action: 'list' });
      expect.fail('Expected recordAccess to reject');
    } catch (err) {
      expect(err).to.have.property('code', 'storage-unknown');
      expect((err as Error).message).to.include('unknown outcome');
      expect(inspect(new Error('Caller failed', { cause: err }), { depth: 10 })).not.to.include('private audit');
    } finally {
      createStub.restore();
    }
    expect(await fixtureCount("AttachmentAccessAudit", { oid: 'oid-1' })).to.equal(0);
  });

  it('rejects blank attachment identifiers through the service', async () => {
    try { await service.upsert({ oid: '   ', fileId: 'file-1', storageKey: 'attachments/invalid' }); expect.fail('Expected rejection'); }
    catch (error) { expect(error).to.have.property('code', 'storage-unknown'); }
  });
});
