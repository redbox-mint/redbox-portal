let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
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
      destroy: sinon.stub(),
    };
    setupServiceTestGlobals(createMockSails({ services: {} }));
    (global as any).AttachmentMetadata = model;
    (global as any).AttachmentAccessAudit = {
      create: sinon.stub(),
    };

    const { Services } = require('../../src/services/AttachmentMetadataService');
    service = new Services.AttachmentMetadataService();
  });

  afterEach(function () {
    delete (global as any).AttachmentMetadata;
    delete (global as any).AttachmentAccessAudit;
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
      { oid: 'oid-1', fileId: 'waterline-legacy', mutationState: '', operation: '', isJournal: false },
    ];
    model.find.returns({ sort: sinon.stub().resolves(rows) });

    const result = await service.findByOid('oid-1');

    expect(result.map((row: any) => row.fileId)).to.deep.equal(['applied', 'legacy', 'waterline-legacy']);
  });

  it('increments attempts when pending and preserves the count when applied', async function () {
    model.findOne.onFirstCall().resolves({ id: 'journal-1', attemptCount: 2, mutationState: 'prepared' });
    model.findOne.onSecondCall().resolves({ id: 'journal-1', attemptCount: 3, mutationState: 'pending' });
    const set = sinon.stub().resolves({ id: 'journal-1' });
    model.updateOne.returns({ set });

    expect(await service.markMutation('oid-1', 'a', 'generation-1', 'pending')).to.equal(true);
    expect(set.firstCall.args[0]).to.include({ mutationState: 'pending', attemptCount: 3 });

    expect(await service.markMutation('oid-1', 'a', 'generation-1', 'applied')).to.equal(true);
    expect(set.secondCall.args[0]).to.include({
      mutationState: 'applied',
      attemptCount: 3,
      lastSafeErrorCode: undefined,
    });
  });

  it('does not let an older generation complete after its state CAS loses', async function () {
    model.findOne.onFirstCall().resolves({
      id: 'old-generation-row',
      attemptCount: 1,
      mutationState: 'pending',
    });
    model.findOne.onSecondCall().resolves({
      id: 'new-generation-row',
      attemptCount: 1,
      mutationState: 'pending',
    });
    const set = sinon.stub();
    set.onFirstCall().resolves(null);
    set.onSecondCall().resolves({ id: 'new-generation-row' });
    model.updateOne.returns({ set });

    expect(await service.markMutation('oid-1', 'a', 'old-generation', 'applied')).to.equal(false);
    expect(await service.markMutation('oid-1', 'a', 'new-generation', 'applied')).to.equal(true);
    expect(model.updateOne.firstCall.args[0]).to.deep.equal({
      id: 'old-generation-row',
      mutationState: 'pending',
    });
  });

  it('holds an applied physical mutation as unknown when reference persistence is ambiguous', async function () {
    model.findOne.resolves({
      id: 'journal-1',
      attemptCount: 1,
      mutationState: 'applied',
    });
    const set = sinon.stub().resolves({ id: 'journal-1' });
    model.updateOne.returns({ set });

    expect(await service.markMutation('oid-1', 'a', 'generation-1', 'unknown')).to.equal(true);
    expect(set.firstCall.args[0]).to.include({
      mutationState: 'unknown',
      attemptCount: 1,
    });
  });

  it('refuses preparation while cleanup owns the same staged blob', async function () {
    model.findOne.resolves({ id: 'cleanup-row', mutationState: 'cleanup-pending' });

    let failure: unknown;
    try {
      await service.prepareMutations([
        {
          oid: 'oid-1',
          fileId: 'file-1',
          storageKey: 'journal/oid-1/a/new-generation',
          attachmentId: 'a',
          operation: 'finalize',
          generation: 'new-generation',
        },
      ]);
    } catch (error) {
      failure = error;
    }

    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.equal('Attachment staging cleanup already owns this mutation.');
    expect(model.create.notCalled).to.equal(true);
  });

  it('holds durable staging ownership until the prepared generation is persisted', async function () {
    let coordinator: any;
    let competingCleanupBegan: boolean | undefined;
    const events: string[] = [];
    model.findOne.callsFake(async (criteria: any) => {
      if (criteria.storageKey?.startsWith('journal/staging-coordinator/')) return coordinator ?? null;
      return null;
    });
    model.create.callsFake((payload: any) => ({
      fetch: async () => {
        if (payload.mutationState === 'staging-available') {
          coordinator = { id: 'coordinator-1', ...payload };
          events.push('coordinator-created');
          return coordinator;
        }
        events.push('prepared-created');
        competingCleanupBegan = await service.beginStagingCleanup({
          oid: 'oid-1',
          attachmentId: 'old-attachment',
          fileId: 'file-1',
          generation: 'old-generation',
          token: 'cleanup-attempt-1',
        });
        return { id: 'prepared-1', ...payload };
      },
    }));
    model.updateOne.callsFake((criteria: any) => ({
      set: async (updates: any) => {
        if (criteria.id !== 'coordinator-1' || coordinator.mutationState !== criteria.mutationState) return null;
        coordinator = { ...coordinator, ...updates };
        events.push(updates.mutationState);
        return coordinator;
      },
    }));

    await service.prepareMutations([
      {
        oid: 'oid-1',
        fileId: 'file-1',
        storageKey: 'journal/oid-1/a/new-generation',
        attachmentId: 'a',
        operation: 'finalize',
        generation: 'new-generation',
      },
    ]);

    expect(competingCleanupBegan).to.equal(false);
    expect(events).to.deep.equal([
      'coordinator-created',
      'staging-preparing',
      'prepared-created',
      'staging-available',
    ]);
    expect(model.updateOne.lastCall.args[0]).to.include({
      id: 'coordinator-1',
      oid: '__global_attachment_staging__',
      mutationFileId: 'file-1',
      isJournal: true,
      mutationState: 'staging-preparing',
      attachmentId: 'a',
      generation: 'new-generation',
    });
    expect(model.updateOne.lastCall.args[0].coordinationToken).to.match(/^[0-9a-f-]{36}$/);
    expect(model.updateOne.lastCall.args[0].coordinationLeaseExpiresAt).to.be.a('string');
    expect(coordinator.coordinationToken).to.equal(undefined);
    expect(coordinator.coordinationLeaseExpiresAt).to.equal(undefined);
    expect(model.destroy.notCalled).to.equal(true);
  });

  it('does not treat a missing, available, or expired coordinator as safely released', async function () {
    const identity = service.stagingCoordinatorIdentity('file-1');
    const coordinator = (mutationState: string, overrides: Record<string, unknown> = {}) => ({
      id: 'coordinator-1',
      oid: '__global_attachment_staging__',
      fileId: identity.fileId,
      storageKey: identity.storageKey,
      mutationFileId: 'file-1',
      isJournal: true,
      mutationState,
      attachmentId: 'a',
      generation: 'generation-1',
      coordinationToken: 'owner-token',
      coordinationLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      ...overrides,
    });
    model.findOne.onFirstCall().resolves(null);
    model.findOne.onSecondCall().resolves(
      coordinator('staging-available', {
        coordinationToken: undefined,
        coordinationLeaseExpiresAt: undefined,
      })
    );
    model.findOne.onThirdCall().resolves(
      coordinator('staging-preparing', {
        coordinationLeaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      })
    );

    expect(
      await service.releaseStagingCoordinator('file-1', 'a', 'generation-1', 'owner-token', 'staging-preparing')
    ).to.equal(false);
    expect(
      await service.releaseStagingCoordinator('file-1', 'a', 'generation-1', 'owner-token', 'staging-preparing')
    ).to.equal(false);
    expect(
      await service.releaseStagingCoordinator('file-1', 'a', 'generation-1', 'owner-token', 'staging-preparing')
    ).to.equal(false);
    expect(model.updateOne.notCalled).to.equal(true);
  });

  it('fails preparation closed when another worker reclaims the coordinator before release', async function () {
    let coordinator: any;
    model.findOne.callsFake(async (criteria: any) =>
      criteria.storageKey?.startsWith('journal/staging-coordinator/') ? coordinator ?? null : null
    );
    model.create.callsFake((payload: any) => ({
      fetch: async () => {
        if (payload.mutationState === 'staging-available') {
          coordinator = { id: 'coordinator-1', ...payload };
          return coordinator;
        }
        coordinator = {
          ...coordinator,
          mutationState: 'staging-cleanup',
          attachmentId: 'replacement-attachment',
          generation: 'replacement-generation',
          coordinationToken: 'replacement-token',
          coordinationLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
        return { id: 'prepared-1', ...payload };
      },
    }));
    model.updateOne.callsFake((criteria: any) => ({
      set: async (updates: any) => {
        const matches = Object.entries(criteria).every(([key, value]) => coordinator?.[key] === value);
        if (!matches) return null;
        coordinator = { ...coordinator, ...updates };
        return coordinator;
      },
    }));

    let failure: unknown;
    try {
      await service.prepareMutations([
        {
          oid: 'oid-1',
          fileId: 'file-1',
          storageKey: 'journal/oid-1/a/generation-1',
          attachmentId: 'a',
          operation: 'finalize',
          generation: 'generation-1',
        },
      ]);
    } catch (error) {
      failure = error;
    }

    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.equal(
      'Attachment staging preparation ownership could not be released safely.'
    );
    expect(coordinator).to.include({
      mutationState: 'staging-cleanup',
      coordinationToken: 'replacement-token',
      attachmentId: 'replacement-attachment',
      generation: 'replacement-generation',
    });
  });

  it('holds cleanup ownership across checking, removal authorization, and durable completion', async function () {
    const claim = {
      oid: 'oid-1',
      attachmentId: 'a',
      fileId: 'file-1',
      generation: 'generation-1',
      token: 'cleanup-attempt-1',
    };
    let coordinator: any;
    let claimState = 'cleanup-pending';
    const events: string[] = [];
    model.findOne.callsFake(async (criteria: any) => {
      if (criteria.storageKey?.startsWith('journal/staging-coordinator/')) return coordinator ?? null;
      const requestedState = criteria.mutationState;
      const stateMatches =
        requestedState === claimState ||
        (Array.isArray(requestedState?.in) && requestedState.in.includes(claimState));
      return criteria.coordinationToken === claim.token && stateMatches
        ? { id: 'journal-1', ...claim, mutationFileId: claim.fileId, mutationState: claimState }
        : null;
    });
    model.create.callsFake((payload: any) => ({
      fetch: async () => {
        coordinator = { id: 'coordinator-1', ...payload };
        events.push('coordinator-created');
        return coordinator;
      },
    }));
    model.updateOne.callsFake((criteria: any) => ({
      set: async (updates: any) => {
        if (criteria.id === 'coordinator-1') {
          if (coordinator.mutationState !== criteria.mutationState) return null;
          coordinator = { ...coordinator, ...updates };
        } else {
          const requestedState = criteria.mutationState;
          const stateMatches =
            requestedState === claimState ||
            (Array.isArray(requestedState?.in) && requestedState.in.includes(claimState));
          if (criteria.coordinationToken !== claim.token || !stateMatches) return null;
          claimState = updates.mutationState;
        }
        events.push(updates.mutationState);
        return { id: criteria.id ?? 'journal-1', ...updates };
      },
    }));

    expect(await service.beginStagingCleanup(claim)).to.equal(true);
    expect(await service.authorizeStagingCleanup(claim)).to.equal(true);
    expect(await service.completeStagingCleanup(claim)).to.equal(true);

    expect(events).to.deep.equal([
      'coordinator-created',
      'staging-cleanup',
      'cleanup-checking',
      'cleanup-removing',
      'cleaned',
      'staging-available',
    ]);
    expect(coordinator.coordinationToken).to.equal(undefined);
    expect(coordinator.coordinationLeaseExpiresAt).to.equal(undefined);
  });

  it('does not report cleanup completion after another worker reclaims the coordinator lease', async function () {
    const claim = {
      oid: 'oid-1',
      attachmentId: 'a',
      fileId: 'file-1',
      generation: 'generation-1',
      token: 'cleanup-attempt-1',
    };
    const identity = service.stagingCoordinatorIdentity(claim.fileId);
    let coordinator: any = {
      id: 'coordinator-1',
      oid: '__global_attachment_staging__',
      fileId: identity.fileId,
      storageKey: identity.storageKey,
      mutationFileId: claim.fileId,
      isJournal: true,
      mutationState: 'staging-cleanup',
      attachmentId: claim.attachmentId,
      generation: claim.generation,
      coordinationToken: claim.token,
      coordinationLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    model.findOne.callsFake(async (criteria: any) =>
      criteria.storageKey === identity.storageKey ? coordinator : null
    );
    model.updateOne.callsFake((criteria: any) => ({
      set: async (updates: any) => {
        if (criteria.coordinationToken !== claim.token || updates.mutationState !== 'cleaned') return null;
        coordinator = {
          ...coordinator,
          mutationState: 'staging-cleanup',
          attachmentId: 'replacement-attachment',
          generation: 'replacement-generation',
          coordinationToken: 'replacement-token',
          coordinationLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        };
        return { id: 'journal-1', mutationState: 'cleaned' };
      },
    }));

    expect(await service.completeStagingCleanup(claim)).to.equal(false);
    expect(model.updateOne.calledOnce).to.equal(true);
    expect(coordinator).to.include({
      mutationState: 'staging-cleanup',
      coordinationToken: 'replacement-token',
      attachmentId: 'replacement-attachment',
      generation: 'replacement-generation',
    });
  });

  it('claims only bounded expired cancelled rows and exposes no storage path', async function () {
    const limit = sinon.stub().resolves([
      {
        id: 'journal-1',
        oid: 'oid-1',
        attachmentId: 'a',
        mutationFileId: 'file-1',
        generation: 'generation-1',
        mutationState: 'cancelled',
        storageKey: '/private/staging/path',
      },
      {
        id: 'journal-unsafe',
        oid: 'oid-1',
        attachmentId: 'b',
        mutationFileId: '../../outside-staging',
        generation: 'generation-2',
        mutationState: 'cancelled',
      },
    ]);
    const sort = sinon.stub().returns({ limit });
    model.find.returns({ sort });
    const set = sinon.stub().resolves({ id: 'journal-1' });
    model.updateOne.returns({ set });

    const claims = await service.claimExpiredStagingCleanup('2026-08-01T00:00:00.000Z', 5_000);

    expect(
      model.find.firstCall.calledWithExactly({
        isJournal: true,
        mutationState: 'cancelled',
        updatedAt: { '<': '2026-08-01T00:00:00.000Z' },
      })
    ).to.equal(true);
    expect(limit.firstCall.calledWithExactly(1000)).to.equal(true);
    expect(model.updateOne.firstCall.args[0]).to.deep.equal({
      id: 'journal-1',
      mutationState: 'cancelled',
      updatedAt: { '<': '2026-08-01T00:00:00.000Z' },
    });
    expect(set.firstCall.args[0].coordinationToken).to.match(/^[0-9a-f-]{36}$/);
    expect(claims).to.deep.equal([
      {
        oid: 'oid-1',
        attachmentId: 'a',
        fileId: 'file-1',
        generation: 'generation-1',
        token: set.firstCall.args[0].coordinationToken,
        phase: 'checking',
      },
    ]);
    expect(JSON.stringify(claims)).not.to.contain('private/staging');
    expect(JSON.stringify(claims)).not.to.contain('outside-staging');
  });

  it('creates a separate journal row instead of overwriting physical attachment metadata', async function () {
    let coordinator: any;
    model.findOne.callsFake(async (criteria: any) =>
      criteria.storageKey?.startsWith('journal/staging-coordinator/') ? coordinator ?? null : null
    );
    model.create.callsFake((payload: any) => ({
      fetch: async () => {
        const created = {
          id: payload.mutationState === 'staging-available' ? 'coordinator-1' : 'journal-1',
          ...payload,
        };
        if (payload.mutationState === 'staging-available') coordinator = created;
        return created;
      },
    }));
    model.updateOne.callsFake((criteria: any) => ({
      set: async (updates: any) => {
        if (criteria.id !== 'coordinator-1' || coordinator.mutationState !== criteria.mutationState) return null;
        coordinator = { ...coordinator, ...updates };
        return coordinator;
      },
    }));

    await service.prepareMutations([
      {
        oid: 'oid-1',
        fileId: 'file-1',
        storageKey: 'journal/oid-1/a/generation-1',
        attachmentId: 'a',
        operation: 'delete',
        generation: 'generation-1',
      },
    ]);

    expect(model.find.notCalled).to.equal(true);
    expect(model.updateOne.callCount).to.equal(2);
    expect(model.create.callCount).to.equal(2);
    expect(model.create.secondCall.args[0]).to.include({
      storageKey: 'journal/oid-1/a/generation-1',
      mutationFileId: 'file-1',
      isJournal: true,
      mutationState: 'prepared',
    });
    expect(model.create.firstCall.args[0].fileId).to.match(/^journal-a-generation-1-/);
  });

  it('keeps replacement mutations in separate journal rows', async function () {
    const fetch = sinon.stub().resolves();
    model.findOne.resolves(null);
    model.create.returns({ fetch });

    await service.prepareMutations([
      {
        oid: 'oid-1',
        fileId: 'new-file',
        storageKey: 'journal/oid-1/a/generation-1/new',
        attachmentId: 'a',
        operation: 'add',
        generation: 'generation-1',
      },
      {
        oid: 'oid-1',
        fileId: 'old-file',
        storageKey: 'journal/oid-1/a/generation-1/old',
        attachmentId: 'a',
        operation: 'delete',
        generation: 'generation-1',
      },
    ]);

    expect(model.create.callCount).to.equal(2);
    expect(model.create.firstCall.args[0]).to.include({
      mutationFileId: 'new-file',
      operation: 'add',
    });
    expect(model.create.secondCall.args[0]).to.include({
      mutationFileId: 'old-file',
      operation: 'delete',
    });
    expect(model.create.firstCall.args[0].fileId).to.not.equal(model.create.secondCall.args[0].fileId);
    expect(model.create.firstCall.args[0].storageKey).to.not.equal(model.create.secondCall.args[0].storageKey);
  });

  it('marks the matching mutation when an attachment has replacement work', async function () {
    model.findOne.resolves({ id: 'journal-new', attemptCount: 0 });
    const set = sinon.stub().resolves();
    model.updateOne.returns({ set });

    const result = await service.markMutation('oid-1', 'a', 'generation-1', 'unknown', 'upload-failed', 'new-file');

    expect(result).to.equal(true);
    expect(model.findOne.calledOnceWithExactly({
      oid: 'oid-1',
      attachmentId: 'a',
      generation: 'generation-1',
      isJournal: true,
      mutationFileId: 'new-file',
    })).to.equal(true);
    expect(set.firstCall.args[0]).to.include({ mutationState: 'unknown', lastSafeErrorCode: 'upload-failed' });
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

  it('updates an existing row when the storage key is already known', async function () {
    model.findOne.resolves({ id: 'metadata-1' });
    const set = sinon.stub().resolves();
    model.updateOne.returns({ set });

    await service.upsert({
      oid: ' oid-1 ',
      fileId: ' file-1 ',
      storageKey: ' key-1 ',
      contentType: ' text/plain ',
      accessCount: 3,
    });

    expect(model.updateOne.calledOnceWithExactly({ id: 'metadata-1' })).to.equal(true);
    expect(set.firstCall.args[0]).to.include({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'key-1',
      contentType: 'text/plain',
      accessCount: 3,
    });
    expect(model.create.notCalled).to.equal(true);
  });

  it('upgrades a matching legacy journal row without creating a duplicate', async function () {
    model.findOne.onFirstCall().resolves(null);
    model.findOne.onSecondCall().resolves({ id: 'legacy-journal' });
    const set = sinon.stub().resolves();
    model.updateOne.returns({ set });

    await service.upsert({
      oid: 'oid-1',
      fileId: 'journal-a-g-legacy',
      storageKey: 'journal/oid-1/a/g/new',
      attachmentId: 'a',
      generation: 'g',
      mutationFileId: 'file-1',
      operation: 'add',
      mutationState: 'prepared',
      isJournal: true,
    });

    expect(model.findOne.secondCall.args[0]).to.deep.equal({
      oid: 'oid-1',
      attachmentId: 'a',
      generation: 'g',
      mutationFileId: 'file-1',
      isJournal: true,
    });
    expect(set.calledOnce).to.equal(true);
    expect(model.create.notCalled).to.equal(true);
  });

  it('reuses a non-journal row for the same physical file', async function () {
    model.findOne.resolves(null);
    model.find.resolves([
      { id: 'journal-row', isJournal: true },
      { id: 'physical-row', isJournal: false },
    ]);
    const set = sinon.stub().resolves();
    model.updateOne.returns({ set });

    await service.upsert({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'new-prefix/file-1',
    });

    expect(model.find.calledOnceWithExactly({ oid: 'oid-1', fileId: 'file-1' })).to.equal(true);
    expect(model.updateOne.calledOnceWithExactly({ id: 'physical-row' })).to.equal(true);
    expect(model.create.notCalled).to.equal(true);
  });

  it('handles empty lookups and missing mutation rows safely', async function () {
    expect(await service.findByOid('   ')).to.deep.equal([]);
    expect(await service.findUnresolvedByOid('   ')).to.deep.equal([]);
    expect(await service.findOneByStorageKey('   ')).to.be.undefined;
    await service.deleteByStorageKey('   ');
    expect(model.find.notCalled).to.equal(true);
    expect(model.destroy.notCalled).to.equal(true);

    expect(await service.markMutation('', 'a', 'g', 'pending')).to.equal(false);
    model.findOne.resolves(null);
    expect(await service.markMutation('oid-1', 'a', 'g', 'pending')).to.equal(false);
    expect(model.updateOne.notCalled).to.equal(true);
  });

  it('rebinds journal rows only when both OIDs differ', async function () {
    await service.rebindOid('', 'oid-2');
    await service.rebindOid('oid-1', '');
    await service.rebindOid('oid-1', 'oid-1');
    expect(model.update.notCalled).to.equal(true);

    const set = sinon.stub().resolves();
    model.update.returns({ set });
    await service.rebindOid('oid-1', 'oid-2');
    expect(model.update.calledOnceWithExactly({ oid: 'oid-1' })).to.equal(true);
    expect(set.calledOnceWithExactly({ oid: 'oid-2' })).to.equal(true);
  });

  it('records access audits and increments download counts', async function () {
    const set = sinon.stub().resolves();
    model.findOne.resolves({ id: 'metadata-1', accessCount: 2 });
    model.updateOne.returns({ set });
    const fetch = sinon.stub().resolves();
    (global as any).AttachmentAccessAudit.create.returns({ fetch });

    await service.recordAccess({
      oid: ' oid-1 ',
      fileId: ' file-1 ',
      storageKey: ' key-1 ',
      action: 'download',
      accessedBy: ' user-1 ',
      itemCount: '4' as any,
    });

    expect(set.firstCall.args[0]).to.include({ accessCount: 3, lastAccessedBy: 'user-1' });
    expect((global as any).AttachmentAccessAudit.create.firstCall.args[0]).to.include({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'key-1',
      action: 'download',
      itemCount: 4,
    });
    expect(fetch.calledOnce).to.equal(true);
  });

  it('does not count list access and rethrows audit failures', async function () {
    const fetch = sinon.stub().rejects(new Error('audit unavailable'));
    (global as any).AttachmentAccessAudit.create.returns({ fetch });

    let error: unknown;
    try {
      await service.recordAccess({ oid: 'oid-1', action: 'list' });
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.an('error').with.property('message', 'audit unavailable');
    expect(model.findOne.notCalled).to.equal(true);
  });
});
