let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('AttachmentMetadataService mutation journal', function () {
  let model: any;
  let service: any;

  beforeEach(function () {
    model = {
      findOne: sinon.stub(),
      find: sinon.stub(),
      updateOne: sinon.stub(),
      update: sinon.stub(),
      create: sinon.stub(),
    };
    setupServiceTestGlobals(createMockSails({ services: {} }));
    (global as any).AttachmentMetadata = model;

    const { Services } = require('../../src/services/AttachmentMetadataService');
    service = new Services.AttachmentMetadataService();
  });

  afterEach(function () {
    delete (global as any).AttachmentMetadata;
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  it('returns only unresolved journal states for the requested record', async function () {
    const rows = [
      { oid: 'oid-1', attachmentId: 'a', mutationState: 'prepared', isJournal: true },
      { oid: 'oid-1', attachmentId: 'b', mutationState: 'pending', isJournal: true },
      { oid: 'oid-1', attachmentId: 'c', mutationState: 'incomplete', isJournal: true },
      { oid: 'oid-1', attachmentId: 'd', mutationState: 'unknown', isJournal: true },
      { oid: 'oid-1', attachmentId: 'e', mutationState: 'applied', isJournal: true },
    ];
    model.find.returns({ sort: sinon.stub().resolves(rows) });

    const result = await service.findUnresolvedByOid('oid-1');

    expect(result.map((row: any) => row.attachmentId)).to.deep.equal(['a', 'b', 'c', 'd']);
    expect(model.find.calledOnceWithExactly({ oid: 'oid-1' })).to.equal(true);
  });

  it('does not expose unresolved journal rows as physical attachments', async function () {
    const rows = [
      { oid: 'oid-1', fileId: 'applied', mutationState: 'applied', operation: 'add' },
      { oid: 'oid-1', fileId: 'pending', mutationState: 'pending', operation: 'add' },
      { oid: 'oid-1', fileId: 'deleted', mutationState: 'applied', operation: 'delete' },
      { oid: 'oid-1', fileId: 'legacy' },
    ];
    model.find.returns({ sort: sinon.stub().resolves(rows) });

    const result = await service.findByOid('oid-1');

    expect(result.map((row: any) => row.fileId)).to.deep.equal(['applied', 'legacy']);
  });

  it('increments attempts when pending and preserves the count when applied', async function () {
    model.findOne.resolves({ id: 'journal-1', attemptCount: 2 });
    const set = sinon.stub().resolves();
    model.updateOne.returns({ set });

    await service.markMutation('oid-1', 'a', 'generation-1', 'pending');
    expect(set.firstCall.args[0]).to.include({ mutationState: 'pending', attemptCount: 3 });

    await service.markMutation('oid-1', 'a', 'generation-1', 'applied');
    expect(set.secondCall.args[0]).to.include({ mutationState: 'applied', attemptCount: 2, lastSafeErrorCode: undefined });
  });

  it('creates a separate journal row instead of overwriting physical attachment metadata', async function () {
    model.findOne.resolves(null);
    model.find.resolves([{ id: 'physical-1', oid: 'oid-1', fileId: 'file-1', storageKey: 'oid-1/file-1' }]);
    const fetch = sinon.stub().resolves();
    model.create.returns({ fetch });

    await service.prepareMutations([{
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'journal/oid-1/a/generation-1',
      attachmentId: 'a',
      operation: 'delete',
      generation: 'generation-1',
    }]);

    expect(model.find.notCalled).to.equal(true);
    expect(model.updateOne.notCalled).to.equal(true);
    expect(model.create.calledOnce).to.equal(true);
    expect(model.create.firstCall.args[0]).to.include({
      storageKey: 'journal/oid-1/a/generation-1',
      fileId: 'journal-a-generation-1',
      mutationFileId: 'file-1',
      isJournal: true,
      mutationState: 'prepared',
    });
  });

  it('writes an applied delete tombstone through the normal upsert path', async function () {
    const fetch = sinon.stub().resolves();
    model.findOne.resolves(null);
    model.create.returns({ fetch });

    await service.markDeleted({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'oid-1/file-1',
      attachmentId: 'a',
      operation: 'delete',
      mutationState: 'applied',
      generation: 'generation-1',
    });

    expect(model.create.calledOnce).to.equal(true);
    expect(model.create.firstCall.args[0]).to.include({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'oid-1/file-1',
      attachmentId: 'a',
      operation: 'delete',
      mutationState: 'applied',
      generation: 'generation-1',
    });
  });
});
