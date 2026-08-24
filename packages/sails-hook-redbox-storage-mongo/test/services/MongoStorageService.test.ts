const { expect } = require('chai');
const sinon = require('sinon');
const { of, firstValueFrom } = require('rxjs');
const { PassThrough, Readable } = require('node:stream');
const mongodb = require('mongodb');

async function expectRejects(fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
    throw new Error(`Expected rejection containing: ${message}`);
  } catch (error) {
    expect(String(error.message || error)).to.include(message);
  }
}

describe('MongoStorageService', function () {
  let sandbox: any;
  let mockSails: any;
  let service: any;
  let mockDb: any;
  let mockBucket: any;
  let Record: any;
  let DeletedRecord: any;
  let RecordAudit: any;
  let IntegrationAudit: any;
  let recordCollection: any;
  let deletedRecordCollection: any;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockSails = {
      config: {
        storage: {
          mongodb: {
            indices: [{ key: { redboxOid: 1 } }],
            deletedRecordIndices: [{ key: { lifecycleState: 1, 'lifecycleOperation.requestId': 1 } }],
          },
        },
        record: {
          export: {
            maxRecords: 2,
          },
        },
        log: {
          createNamespaceLogger: () => ({
            verbose: sandbox.stub(),
            debug: sandbox.stub(),
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub(),
            trace: sandbox.stub(),
          }),
          customLogger: {
            verbose: sandbox.stub(),
            debug: sandbox.stub(),
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub(),
            trace: sandbox.stub(),
          },
        },
      },
      log: {
        verbose: sandbox.stub(),
        debug: sandbox.stub(),
        info: sandbox.stub(),
        warn: sandbox.stub(),
        error: sandbox.stub(),
        trace: sandbox.stub(),
      },
      services: {},
      on: sandbox.stub(),
      emit: sandbox.stub(),
    };

    mockDb = {
      collection: sandbox.stub(),
    };

    recordCollection = {
      findOneAndUpdate: sandbox.stub().resolves({ redboxOid: 'oid-1', revision: 1 }),
      findOneAndDelete: sandbox.stub().resolves({ redboxOid: 'oid-1', revision: 0 }),
      findOne: sandbox.stub().resolves(null),
      insertOne: sandbox.stub().resolves({ acknowledged: true }),
    };
    deletedRecordCollection = {
      findOneAndUpdate: sandbox.stub().resolves({ redboxOid: 'oid-1', revision: 1, lifecycleState: 'deleted' }),
      findOneAndDelete: sandbox.stub().resolves({ redboxOid: 'oid-1', revision: 0, lifecycleState: 'deleted' }),
      findOne: sandbox.stub().resolves(null),
      insertOne: sandbox.stub().resolves({ acknowledged: true }),
    };
    mockDb.collection.callsFake((name: string) => (name === 'record' ? recordCollection : deletedRecordCollection));

    Record = {
      tableName: 'record',
      getDatastore: sandbox.stub().returns({ manager: mockDb }),
      create: sandbox.stub().resolves({}),
      destroyOne: sandbox.stub().resolves({}),
      updateOne: sandbox.stub(),
      findOne: sandbox.stub().resolves(null),
      find: sandbox.stub(),
      count: sandbox.stub().resolves(0),
    };
    DeletedRecord = {
      tableName: 'deletedrecord',
      getDatastore: sandbox.stub().returns({ manager: mockDb }),
      create: sandbox.stub().resolves({}),
      findOne: sandbox.stub().resolves(null),
      destroyOne: sandbox.stub().resolves({}),
    };
    RecordAudit = {
      create: sandbox.stub().resolves({}),
      find: sandbox.stub().resolves([]),
    };
    IntegrationAudit = {
      create: sandbox.stub().resolves({}),
      count: sandbox.stub().resolves(0),
      find: sandbox.stub().returns({
        sort: sandbox.stub().returnsThis(),
        skip: sandbox.stub().returnsThis(),
        limit: sandbox.stub().returnsThis(),
        then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(onFulfilled([])),
      }),
    };

    mockBucket = {
      find: sandbox.stub(),
      delete: sandbox.stub(),
      openUploadStream: sandbox.stub(),
      openDownloadStreamByName: sandbox.stub().returns('download-stream'),
    };

    (global as any).sails = mockSails;
    (global as any).Record = Record;
    (global as any).DeletedRecord = DeletedRecord;
    (global as any).RecordAudit = RecordAudit;
    (global as any).IntegrationAudit = IntegrationAudit;
    (global as any).TranslationService = { t: sandbox.stub().returns('missing attachment') };
    (global as any).RecordTypesService = { get: sandbox.stub().returns(of({ relatedTo: [] })) };
    (global as any).FormsService = { getFormByName: sandbox.stub().returns(of({ attachmentFields: [] })) };
    (global as any).StorageManagerService = {
      stagingDisk: sandbox.stub(),
      disk: sandbox.stub(),
    };

    sandbox.stub(mongodb, 'GridFSBucket').callsFake(function () {
      return mockBucket as any;
    });

    delete require.cache[require.resolve('../../src/services/MongoStorageService')];
    const { Services } = require('../../src/services/MongoStorageService');
    service = new Services.MongoStorageService();
    service.gridFsBucket = mockBucket;
  });

  afterEach(function () {
    sandbox.restore();
    delete (global as any).sails;
    delete (global as any).Record;
    delete (global as any).DeletedRecord;
    delete (global as any).RecordAudit;
    delete (global as any).IntegrationAudit;
    delete (global as any).TranslationService;
    delete (global as any).RecordTypesService;
    delete (global as any).FormsService;
    delete (global as any).StorageManagerService;
  });

  it('registers a ready hook in the constructor', function () {
    expect(mockSails.on.calledOnceWith('ready')).to.be.true;
  });

  it('initializes collections and indices when they already exist', async function () {
    const recordCollection = {
      indexes: sandbox.stub().resolves([{ name: '_id_' }]),
      createIndexes: sandbox.stub().resolves([]),
    };
    const deletedCollection = {
      createIndexes: sandbox.stub().resolves([]),
    };
    mockDb.collection.callsFake((name: string, options?: any) => {
      if (options?.strict) {
        return { ok: 1 };
      }
      if (name === 'record') {
        return recordCollection;
      }
      return deletedCollection;
    });

    await service.performInit();

    expect(service.gridFsBucket).to.be.ok;
    expect(service.recordCol).to.equal(recordCollection);
    expect(service.deletedRecordCol).to.equal(deletedCollection);
    expect(recordCollection.createIndexes.calledOnceWith(mockSails.config.storage.mongodb.indices)).to.be.true;
    expect(deletedCollection.createIndexes.calledOnceWith(mockSails.config.storage.mongodb.deletedRecordIndices)).to.be
      .true;
  });

  it('creates the collection through a seed record when strict lookup fails', async function () {
    const recordCollection = {
      indexes: sandbox.stub().resolves([]),
      createIndexes: sandbox.stub().resolves([]),
    };
    mockDb.collection.callsFake((name: string, options?: any) => {
      if (options?.strict) {
        throw new Error('missing');
      }
      if (name === 'record') {
        return recordCollection;
      }
      return {};
    });

    await service.performInit();

    expect(Record.create.calledOnce).to.be.true;
    expect(Record.destroyOne.calledOnce).to.be.true;
  });

  it('logs index creation failures without throwing', async function () {
    const recordCollection = {
      indexes: sandbox.stub().resolves([]),
      createIndexes: sandbox.stub().rejects(new Error('boom')),
    };
    mockDb.collection.returns(recordCollection);

    await (service as any).createIndices(mockDb);

    expect(mockSails.log.error.called).to.be.true;
  });

  it('creates a record and assigns a generated oid', async function () {
    sandbox.stub(service as any, 'getUuid').returns('12345678901234567890123456789012');

    const response = await service.create(null, { metadata: {} }, null);

    expect(response.success).to.equal(true);
    expect(response.oid).to.equal('12345678901234567890123456789012');
    expect(response.committedRevision).to.equal(0);
    expect(Record.create.firstCall.args[0]).to.include({
      redboxOid: '12345678901234567890123456789012',
      revision: 0,
    });
  });

  it('overwrites a client-supplied create revision', async function () {
    const candidate = { redboxOid: 'oid-client', revision: 72, metadata: {} };

    const response = await service.create(null, candidate, null);

    expect(response.committedRevision).to.equal(0);
    expect(Record.create.firstCall.args[0].revision).to.equal(0);
    expect(candidate.revision).to.equal(72);
  });

  it('preserves a preassigned record oid instead of generating a replacement', async function () {
    const getUuid = sandbox.stub(service as any, 'getUuid').throws(new Error('unexpected generated oid'));
    const redboxOid = 'preassigned-record-oid';

    const response = await service.create(null, { redboxOid, metadata: {} }, null);

    expect(response.success).to.equal(true);
    expect(response.oid).to.equal(redboxOid);
    expect(getUuid.notCalled).to.equal(true);
    expect(Record.create.firstCall.args[0]).to.include({ redboxOid });
  });

  it('returns a failed response when create throws', async function () {
    sandbox.stub(service as any, 'getUuid').returns('12345678901234567890123456789012');
    Record.create.rejects(new Error('create failed'));

    const response = await service.create(null, { metadata: {} }, null);

    expect(response.success).to.equal(false);
    expect(response.message).to.equal('create failed');
  });

  it('strips immutable fields before updateMeta persists', async function () {
    const record = {
      id: 'a',
      _id: 'b',
      redboxOid: 'client-oid',
      revision: 99,
      dateCreated: 'c',
      lastSaveDate: 'd',
      keep: true,
    };

    const response = await service.updateMeta(null, 'oid-1', record);

    expect(response.success).to.equal(true);
    const update = recordCollection.findOneAndUpdate.firstCall.args[1];
    expect(update.$set.keep).to.equal(true);
    expect(update.$set).to.not.have.keys('id', '_id', 'redboxOid', 'revision', 'dateCreated');
    expect(update.$set.lastSaveDate).to.be.a('string');
    expect(update.$inc).to.deep.equal({ revision: 1 });
    expect(record).to.include({ redboxOid: 'client-oid', revision: 99, lastSaveDate: 'd' });
  });

  it('classifies an atomic update no-match result as not-applied', async function () {
    recordCollection.findOneAndUpdate.resolves(null);

    const response = await service.updateMeta(null, 'missing-oid', { keep: true });

    expect(response.success).to.equal(false);
    expect(response.applicationState).to.equal('not-applied');
    expect(response.nonApplicationReason).to.equal('not-found');
  });

  it('scopes branded updates to the stored record brand', async function () {
    const response = await service.updateMeta({ id: 'brand-1' }, 'oid-1', {
      metadata: { title: 'Updated' },
      metaMetadata: { brandId: 'brand-1' },
    });

    expect(response.success).to.equal(true);
    expect(recordCollection.findOneAndUpdate.firstCall.args[0]).to.deep.include({
      $and: [
        { redboxOid: 'oid-1', 'metaMetadata.brandId': 'brand-1' },
        {
          $or: [{ revision: { $lt: Number.MAX_SAFE_INTEGER } }, { revision: { $exists: false } }],
        },
      ],
    });
  });

  it('refuses a candidate that names a different active brand without issuing an update', async function () {
    const response = await service.updateMeta({ id: 'brand-1' }, 'oid-1', {
      metadata: {},
      metaMetadata: { brandId: 'brand-2' },
    });

    expect(response.success).to.equal(false);
    expect(response.applicationState).to.equal('not-applied');
    expect(response.nonApplicationReason).to.equal('brand-mismatch');
    expect(recordCollection.findOneAndUpdate.notCalled).to.equal(true);
  });

  it('refuses branded replacement metadata without a candidate brandId', async function () {
    const response = await service.updateMeta({ id: 'brand-1' }, 'oid-1', {
      metadata: {},
      metaMetadata: { form: 'dataset-2.4-draft' },
    });

    expect(response.success).to.equal(false);
    expect(response.applicationState).to.equal('not-applied');
    expect(response.nonApplicationReason).to.equal('brand-mismatch');
    expect(recordCollection.findOneAndUpdate.notCalled).to.equal(true);
  });

  it('returns an unsuccessful response when updateMeta fails', async function () {
    recordCollection.findOneAndUpdate.rejects(new Error('update failed'));

    const response = await service.updateMeta('brand', 'oid-1', { keep: true }, 'user');

    expect(response.success).to.equal(false);
    expect(response.applicationState).to.equal('unknown');
    expect(String(response.message.message || response.message)).to.include('update failed');
    expect(mockSails.log.error.calledWithMatch('updateMeta() failed for oid oid-1: update failed')).to.equal(true);
  });

  it('declares full concurrency capability only for native atomic collections', function () {
    expect(service.getCapabilities().recordConcurrency).to.deep.include({
      version: 1,
      conditionalActiveUpdate: true,
      conditionalActiveRemove: true,
      conditionalTombstoneUpdate: true,
      conditionalTombstoneRemove: true,
      revisionLineage: true,
    });

    service.recordCol = { findOneAndUpdate: sandbox.stub() };
    expect(service.getCapabilities()).to.deep.equal({});
  });

  it('applies a matching CAS once and returns committed state plus request linkage', async function () {
    recordCollection.findOneAndUpdate.resolves({
      redboxOid: 'oid-1',
      revision: 5,
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Updated' },
    });
    const options = {
      precondition: { expectedRevision: 4, requireRevision: true },
      requestId: '123e4567-e89b-42d3-a456-426614174000',
      resolution: 'internal',
    };

    const response = await service.updateMeta(
      { id: 'brand-1' },
      'oid-1',
      { metaMetadata: { brandId: 'brand-1' }, metadata: { title: 'Updated' }, revision: 100 },
      null,
      options
    );

    expect(response).to.include({
      success: true,
      applicationState: 'applied',
      committedRevision: 5,
      requestId: options.requestId,
      resolution: 'internal',
    });
    expect(response.committedRecord.metadata).to.deep.equal({ title: 'Updated' });
    expect(recordCollection.findOneAndUpdate.firstCall.args[0]).to.deep.equal({
      $and: [{ redboxOid: 'oid-1', 'metaMetadata.brandId': 'brand-1' }, { revision: 4 }],
    });
    expect(recordCollection.findOneAndUpdate.firstCall.args[1].$inc).to.deep.equal({ revision: 1 });
    expect(recordCollection.findOneAndUpdate.firstCall.args[1].$set).to.not.have.property('revision');
  });

  it('certifies stale and deleted CAS no-match outcomes without a fallback write', async function () {
    recordCollection.findOneAndUpdate.resolves(null);
    recordCollection.findOne.onFirstCall().resolves({
      redboxOid: 'oid-1',
      revision: 8,
      metaMetadata: { brandId: 'brand-1' },
    });

    const stale = await service.updateMeta({ id: 'brand-1' }, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: 7, requireRevision: true },
    });
    expect(stale).to.include({ applicationState: 'not-applied', nonApplicationReason: 'stale-revision' });
    expect(recordCollection.findOneAndUpdate.callCount).to.equal(1);

    recordCollection.findOne.resetBehavior();
    recordCollection.findOne.resolves(null);
    deletedRecordCollection.findOne.resolves({
      redboxOid: 'oid-1',
      revision: 9,
      brandId: 'brand-1',
      lifecycleState: 'deleted',
    });
    const deleted = await service.updateMeta({ id: 'brand-1' }, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: 7, requireRevision: true },
    });
    expect(deleted).to.include({ applicationState: 'not-applied', nonApplicationReason: 'deleted' });
    expect(recordCollection.findOneAndUpdate.callCount).to.equal(2);
  });

  it('classifies a no-match in another brand without exposing its record state', async function () {
    recordCollection.findOneAndUpdate.resolves(null);
    recordCollection.findOne.resolves({
      redboxOid: 'oid-1',
      revision: 22,
      metaMetadata: { brandId: 'brand-2' },
      metadata: { secret: 'must not be returned' },
    });
    const result = await service.updateMeta({ id: 'brand-1' }, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: 3, requireRevision: true },
    });

    expect(result.nonApplicationReason).to.equal('brand-mismatch');
    expect(result.committedRecord).to.equal(undefined);
    expect(result.metadata).to.equal(null);
  });

  it('keeps tokenless compatibility while advancing a server revision atomically', async function () {
    recordCollection.findOneAndUpdate.resolves({ redboxOid: 'oid-1', revision: 12, metadata: {} });

    const result = await service.updateMeta(null, 'oid-1', { revision: 1, metadata: {} });

    expect(result).to.include({ applicationState: 'applied', committedRevision: 12 });
    expect(recordCollection.findOneAndUpdate.firstCall.args[0].$and[1]).to.deep.equal({
      $or: [{ revision: { $lt: Number.MAX_SAFE_INTEGER } }, { revision: { $exists: false } }],
    });
    expect(recordCollection.findOneAndUpdate.firstCall.args[1].$inc).to.deep.equal({ revision: 1 });
    expect(recordCollection.findOneAndUpdate.firstCall.args[1].$set).to.not.have.property('revision');
  });

  it('does not certify an unrecognized or thrown post-dispatch driver fact', async function () {
    recordCollection.findOneAndUpdate.resolves({ ok: 1 });
    const unrecognized = await service.updateMeta(null, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: 0, requireRevision: true },
    });
    expect(unrecognized.applicationState).to.equal('unknown');
    expect(unrecognized.nonApplicationReason).to.equal(undefined);

    recordCollection.findOneAndUpdate.resolves(undefined);
    const missingDriverFact = await service.updateMeta(null, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: 0, requireRevision: true },
    });
    expect(missingDriverFact.applicationState).to.equal('unknown');
    expect(missingDriverFact.nonApplicationReason).to.equal(undefined);

    recordCollection.findOneAndUpdate.rejects(new Error('connection closed after dispatch'));
    const thrown = await service.updateMeta(null, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: 0, requireRevision: true },
    });
    expect(thrown.applicationState).to.equal('unknown');
    expect(thrown.nonApplicationReason).to.equal(undefined);
  });

  it('does not certify a driver document with an inconsistent advanced revision', async function () {
    recordCollection.findOneAndUpdate.resolves({ redboxOid: 'oid-1', revision: 9 });

    const result = await service.updateMeta(null, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: 4, requireRevision: true },
    });

    expect(result.applicationState).to.equal('unknown');
    expect(result.nonApplicationReason).to.equal(undefined);
  });

  it('fails closed on an unsupported dialect without using Waterline update fallback', async function () {
    service.recordCol = {};
    const response = await service.updateMeta(null, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: 0, requireRevision: true },
    });

    expect(response).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'capability-unavailable',
    });
    expect(Record.updateOne.notCalled).to.equal(true);
  });

  it('fails closed before dispatch when an exact revision cannot be advanced', async function () {
    const response = await service.updateMeta(null, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: Number.MAX_SAFE_INTEGER, requireRevision: true },
    });

    expect(response).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'capability-unavailable',
    });
    expect(recordCollection.findOneAndUpdate.notCalled).to.equal(true);
  });

  it('rejects malformed runtime preconditions without dispatch', async function () {
    const missingRequireFlag = await service.updateMeta(null, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: 0 } as any,
    });
    const invalidRevision = await service.updateMeta(null, 'oid-1', { metadata: {} }, null, {
      precondition: { expectedRevision: '0', requireRevision: true } as any,
    });

    expect(missingRequireFlag.nonApplicationReason).to.equal('capability-unavailable');
    expect(invalidRevision.nonApplicationReason).to.equal('capability-unavailable');
    expect(recordCollection.findOneAndUpdate.notCalled).to.equal(true);
  });

  it('allows exactly one of two clients to initialize a missing legacy revision', async function () {
    let stored: any = {
      redboxOid: 'oid-legacy',
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Original' },
    };
    const atomicCollection = {
      findOneAndUpdate: sandbox.stub().callsFake(async (_filter: any, update: any) => {
        if (!stored || stored.revision !== undefined) return null;
        stored = { ...stored, ...update.$set, revision: 1 };
        return { ...stored };
      }),
      findOneAndDelete: sandbox.stub(),
      findOne: sandbox.stub().callsFake(async () => (stored ? { ...stored } : null)),
    };
    const tombstoneCollection = {
      findOneAndUpdate: sandbox.stub(),
      findOneAndDelete: sandbox.stub(),
      findOne: sandbox.stub().resolves(null),
    };
    const ServiceClass = service.constructor;
    const firstService = new ServiceClass();
    const secondService = new ServiceClass();
    firstService.recordCol = atomicCollection;
    firstService.deletedRecordCol = tombstoneCollection;
    secondService.recordCol = atomicCollection;
    secondService.deletedRecordCol = tombstoneCollection;
    const options = { precondition: { expectedRevision: 0, requireRevision: true } };

    const results = await Promise.all([
      firstService.updateMeta({ id: 'brand-1' }, 'oid-legacy', { metadata: { title: 'First' } }, null, options),
      secondService.updateMeta({ id: 'brand-1' }, 'oid-legacy', { metadata: { title: 'Second' } }, null, options),
    ]);

    expect(results.filter((result: any) => result.applicationState === 'applied')).to.have.length(1);
    expect(results.filter((result: any) => result.nonApplicationReason === 'stale-revision')).to.have.length(1);
    expect(stored.revision).to.equal(1);
    expect(atomicCollection.findOneAndUpdate.firstCall.args[0].$and[1]).to.deep.equal({
      $or: [{ revision: 0 }, { revision: { $exists: false } }],
    });
  });

  it('makes update/remove races one-winner at the shared native collection', async function () {
    let stored: any = {
      redboxOid: 'oid-race',
      revision: 3,
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Original' },
    };
    const expectedFromFilter = (filter: any) => filter.$and[1].revision;
    const atomicCollection = {
      findOneAndUpdate: sandbox.stub().callsFake(async (filter: any, update: any) => {
        if (!stored || stored.revision !== expectedFromFilter(filter)) return null;
        stored = { ...stored, ...update.$set, revision: stored.revision + 1 };
        return { ...stored };
      }),
      findOneAndDelete: sandbox.stub().callsFake(async (filter: any) => {
        if (!stored || stored.revision !== expectedFromFilter(filter)) return null;
        const removed = stored;
        stored = null;
        return removed;
      }),
      findOne: sandbox.stub().callsFake(async () => (stored ? { ...stored } : null)),
    };
    service.recordCol = atomicCollection;
    const options = { precondition: { expectedRevision: 3, requireRevision: true } };

    const [update, remove] = await Promise.all([
      service.updateMeta(
        { id: 'brand-1' },
        'oid-race',
        { metaMetadata: { brandId: 'brand-1' }, metadata: { title: 'Winner' } },
        null,
        options
      ),
      service.removeActiveRecord({ id: 'brand-1' }, 'oid-race', options),
    ]);

    expect(update.applicationState).to.equal('applied');
    expect(update.committedRevision).to.equal(4);
    expect(remove.applicationState).to.equal('not-applied');
    expect(remove.nonApplicationReason).to.equal('stale-revision');
    expect(stored.revision).to.equal(4);
  });

  it('makes removal the sole winner when it reaches the shared revision first', async function () {
    let stored: any = {
      redboxOid: 'oid-remove-wins',
      revision: 3,
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Original' },
    };
    const atomicCollection = {
      findOneAndDelete: sandbox.stub().callsFake(async (filter: any) => {
        if (!stored || stored.revision !== filter.$and[1].revision) return null;
        const removed = stored;
        stored = null;
        return removed;
      }),
      findOneAndUpdate: sandbox.stub().callsFake(async () => null),
      findOne: sandbox.stub().callsFake(async () => (stored ? { ...stored } : null)),
    };
    service.recordCol = atomicCollection;
    const options = { precondition: { expectedRevision: 3, requireRevision: true } };

    const removed = await service.removeActiveRecord({ id: 'brand-1' }, 'oid-remove-wins', options);
    const update = await service.updateMeta(
      { id: 'brand-1' },
      'oid-remove-wins',
      { metaMetadata: { brandId: 'brand-1' }, metadata: { title: 'Too late' } },
      null,
      options
    );

    expect(removed).to.include({ applicationState: 'applied', committedRevision: 3 });
    expect(update).to.include({ applicationState: 'not-applied', nonApplicationReason: 'not-found' });
    expect(stored).to.equal(null);
  });

  it('conditionally updates/removes tombstones and persists bounded request linkage', async function () {
    const requestId = '123e4567-e89b-42d3-a456-426614174000';
    deletedRecordCollection.findOneAndUpdate.callsFake(async (_filter: any, update: any) => ({
      redboxOid: 'oid-1',
      revision: 6,
      brandId: 'brand-1',
      ...update.$set,
    }));
    const operation = {
      requestId: '00000000-0000-4000-8000-000000000000',
      sourceRevision: 5,
      targetRevision: 6,
      startedAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:01.000Z',
      attempts: 1,
    };
    const options = {
      precondition: { expectedRevision: 5, requireRevision: true },
      requestId,
    };

    const updated = await service.updateTombstone(
      { id: 'brand-1' },
      'oid-1',
      {
        revision: 999,
        lifecycleState: 'restore-pending',
        lifecycleOperation: operation,
        deletedRecordMetadata: {
          redboxOid: 'oid-1',
          revision: 5,
          metaMetadata: { brandId: 'brand-1' },
          metadata: {},
        },
      },
      options
    );
    expect(updated).to.include({ applicationState: 'applied', committedRevision: 6, requestId });
    const persisted = deletedRecordCollection.findOneAndUpdate.firstCall.args[1].$set;
    expect(persisted).to.not.have.property('revision');
    expect(persisted.deletedRecordMetadata).to.not.have.property('revision');
    expect(persisted.lifecycleOperation.requestId).to.equal(requestId);

    deletedRecordCollection.findOneAndDelete.resolves({
      redboxOid: 'oid-1',
      revision: 6,
      brandId: 'brand-1',
      lifecycleState: 'restore-pending',
    });
    const removed = await service.removeTombstone({ id: 'brand-1' }, 'oid-1', {
      precondition: { expectedRevision: 6, requireRevision: true },
      requestId,
    });
    expect(removed).to.include({ applicationState: 'applied', committedRevision: 6, requestId });
    expect(removed.removedRecord.lifecycleState).to.equal('restore-pending');
  });

  it('rejects malformed or inconsistent lifecycle candidates before dispatch', async function () {
    const options = { precondition: { expectedRevision: 5, requireRevision: true } };
    const malformed = await service.updateTombstone(
      { id: 'brand-1' },
      'oid-1',
      { lifecycleOperation: 'client-value' },
      options
    );
    const inconsistent = await service.updateTombstone(
      { id: 'brand-1' },
      'oid-1',
      {
        lifecycleOperation: {
          requestId: '123e4567-e89b-42d3-a456-426614174000',
          sourceRevision: 4,
          targetRevision: 6,
          startedAt: '2026-08-23T00:00:00.000Z',
          updatedAt: '2026-08-23T00:00:01.000Z',
          attempts: 1,
        },
      },
      options
    );

    expect(malformed.nonApplicationReason).to.equal('lifecycle-conflict');
    expect(inconsistent.nonApplicationReason).to.equal('lifecycle-conflict');
    expect(deletedRecordCollection.findOneAndUpdate.notCalled).to.equal(true);
  });

  it('rejects getMeta for an empty oid', async function () {
    await expectRejects(() => service.getMeta(''), 'refusing to search using an empty OID');
  });

  it('checks existence via Record.count', async function () {
    Record.count.resolves(2);
    expect(await service.exists('oid-1')).to.equal(true);
    expect(Record.count.calledOnceWith({ redboxOid: 'oid-1' })).to.be.true;
  });

  it('fails closed instead of performing a direct permission rewrite outside RecordsService', async function () {
    const updateMetaStub = sandbox.stub(service, 'updateMeta');

    const result = await service.provideUserAccessAndRemovePendingAccess(
      'oid-1',
      'user@example.com',
      'user@example.com'
    );

    expect(result.applicationState).to.equal('not-applied');
    expect(result.nonApplicationReason).to.equal('capability-unavailable');
    expect(updateMetaStub.notCalled).to.be.true;
  });

  it('returns a typed non-application fact for legacy direct permission callers', async function () {
    const result = await service.provideUserAccessAndRemovePendingAccess('oid-1', 'user', 'pending');
    expect(result.success).to.equal(false);
    expect(result.isSuccessful()).to.equal(false);
  });

  it('prepares batch items before dispatching create calls', async function () {
    const createStub = sandbox.stub(service, 'create').resolves({ success: true });
    const data = [
      { externalId: 'ext-1', metaMetadata: {} },
      { externalId: 'ext-2', metaMetadata: {} },
    ];

    const response = await service.createBatch('rdmp', data, 'externalId');

    expect(response.success).to.equal(true);
    expect(createStub.callCount).to.equal(2);
    expect(data[0]).to.include({ harvestId: 'ext-1' });
    expect(data[0].metaMetadata).to.include({ type: 'rdmp' });
  });

  it('records createBatch failures in the response message when create rejects asynchronously', async function () {
    sandbox.stub(service, 'create').rejects(new Error('bad row'));
    const data = [{ externalId: 'ext-1', metaMetadata: {} }];

    const response = await service.createBatch('rdmp', data, 'externalId');
    await Promise.resolve();
    await Promise.resolve();

    expect(response.success).to.equal(true);
    expect(response.message).to.include('bad row');
  });

  it('walks related records recursively when record types define relationships', async function () {
    const getMetaStub = sandbox.stub(service, 'getMeta');
    getMetaStub.onFirstCall().resolves({ redboxOid: 'oid-1', metaMetadata: { type: 'parent' } });
    getMetaStub.onSecondCall().resolves({ redboxOid: 'child-1', metaMetadata: { type: 'child' } });
    (global as any).RecordTypesService.get.callsFake((brand: any, recordTypeName: string) =>
      of(
        recordTypeName === 'parent'
          ? { relatedTo: [{ recordType: 'child', foreignField: 'parentId' }] }
          : { relatedTo: [] }
      )
    );
    const metaQuery = { meta: sandbox.stub().resolves([{ redboxOid: 'child-1', parentId: 'oid-1' }]) };
    Record.find.returns(metaQuery);

    const result = await service.getRelatedRecords('oid-1', { id: 'brand-1' });

    expect(result.rootOid).to.equal('oid-1');
    expect(result.edges).to.deep.equal([
      {
        relationId: 'parent__child__parentId',
        label: undefined,
        sourceOid: 'oid-1',
        targetOid: 'child-1',
        targetRecordType: 'child',
      },
    ]);
    expect(result.relatedObjects.parent).to.have.length(1);
    expect(result.relatedObjects.child).to.have.length(1);
    expect(Record.find.calledOnce).to.be.true;
    expect(metaQuery.meta.calledOnce).to.be.true;
  });

  it('emits inbound relationship edges in reverse while keeping the same lookup query', async function () {
    const getMetaStub = sandbox.stub(service, 'getMeta');
    getMetaStub.onFirstCall().resolves({ redboxOid: 'oid-1', metaMetadata: { type: 'parent' } });
    getMetaStub.onSecondCall().resolves({ redboxOid: 'child-1', metaMetadata: { type: 'child' } });
    (global as any).RecordTypesService.get.callsFake((brand: any, recordTypeName: string) =>
      of(
        recordTypeName === 'parent'
          ? {
              relatedTo: [{ recordType: 'child', foreignField: 'parentId', direction: 'inbound', cardinality: 'many' }],
            }
          : { relatedTo: [] }
      )
    );
    const metaQuery = { meta: sandbox.stub().resolves([{ redboxOid: 'child-1', parentId: 'oid-1' }]) };
    Record.find.returns(metaQuery);

    const result = await service.getRelatedRecords('oid-1', { id: 'brand-1' });

    expect(Record.find.calledOnceWith({ 'metaMetadata.type': 'child', parentId: 'oid-1' })).to.be.true;
    expect(result.edges).to.deep.equal([
      {
        relationId: 'parent__child__parentId',
        label: undefined,
        sourceOid: 'child-1',
        targetOid: 'oid-1',
        targetRecordType: 'parent',
      },
    ]);
    expect(result.relatedObjects.parent).to.have.length(1);
    expect(result.relatedObjects.child).to.have.length(1);
    expect(metaQuery.meta.calledOnce).to.be.true;
  });

  it('keeps only the first deterministic match for one-cardinality relationships', async function () {
    const getMetaStub = sandbox.stub(service, 'getMeta');
    getMetaStub.onFirstCall().resolves({ redboxOid: 'oid-1', metaMetadata: { type: 'parent' } });
    getMetaStub.onSecondCall().resolves({ redboxOid: 'child-1', metaMetadata: { type: 'child' } });
    (global as any).RecordTypesService.get.callsFake((brand: any, recordTypeName: string) =>
      of(
        recordTypeName === 'parent'
          ? { relatedTo: [{ recordType: 'child', foreignField: 'parentId', cardinality: 'one' }] }
          : { relatedTo: [] }
      )
    );
    const metaQuery = {
      meta: sandbox.stub().resolves([
        { redboxOid: 'child-2', parentId: 'oid-1' },
        { redboxOid: 'child-1', parentId: 'oid-1' },
      ]),
    };
    Record.find.returns(metaQuery);

    const result = await service.getRelatedRecords('oid-1', { id: 'brand-1' });

    expect(Record.find.calledOnceWith({ 'metaMetadata.type': 'child', parentId: 'oid-1' })).to.be.true;
    expect(result.edges).to.deep.equal([
      {
        relationId: 'parent__child__parentId',
        label: undefined,
        sourceOid: 'oid-1',
        targetOid: 'child-1',
        targetRecordType: 'child',
      },
    ]);
    expect(result.relatedObjects.child).to.deep.equal([{ redboxOid: 'child-1', parentId: 'oid-1' }]);
    expect(metaQuery.meta.calledOnce).to.be.true;
  });

  it('soft-deletes records by copying them into DeletedRecord first', async function () {
    sandbox.stub(service, 'getMeta').resolves({ redboxOid: 'oid-1', revision: 4, metadata: {} });

    const response = await service.delete('oid-1', false);

    expect(response.success).to.equal(true);
    expect(deletedRecordCollection.insertOne.calledOnce).to.be.true;
    expect(deletedRecordCollection.insertOne.firstCall.args[0]).to.include({
      redboxOid: 'oid-1',
      revision: 5,
      lifecycleState: 'deleted',
    });
    expect(deletedRecordCollection.insertOne.firstCall.args[0].deletedRecordMetadata).to.deep.equal({
      redboxOid: 'oid-1',
      metadata: {},
    });
    expect(Record.destroyOne.calledOnceWith({ redboxOid: 'oid-1' })).to.be.true;
  });

  it('does not let legacy delete/restore paths ignore a supplied exact revision', async function () {
    const options = { precondition: { expectedRevision: 3, requireRevision: true } };

    const deletion = await service.delete('oid-1', false, options);
    const restoration = await service.restoreRecord('oid-1', options);

    expect(deletion).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'capability-unavailable',
    });
    expect(restoration).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'capability-unavailable',
    });
    expect(DeletedRecord.create.notCalled).to.equal(true);
    expect(deletedRecordCollection.insertOne.notCalled).to.equal(true);
    expect(Record.destroyOne.notCalled).to.equal(true);
    expect(Record.create.notCalled).to.equal(true);
  });

  it('continues one monotonic revision lineage through tokenless delete and restore', async function () {
    sandbox.stub(service, 'getMeta').resolves({
      redboxOid: 'oid-lineage',
      revision: 7,
      metaMetadata: { brandId: 'brand-1' },
      metadata: {},
    });

    const deleted = await service.delete('oid-lineage', false);
    const tombstone = deletedRecordCollection.insertOne.firstCall.args[0];
    DeletedRecord.findOne.resolves(tombstone);
    const restored = await service.restoreRecord('oid-lineage');

    expect(deleted.success).to.equal(true);
    expect(tombstone.revision).to.equal(8);
    expect(tombstone.deletedRecordMetadata).to.not.have.property('revision');
    expect(restored.success).to.equal(true);
    expect(recordCollection.insertOne.firstCall.args[0].revision).to.equal(9);
    expect(new Set([7, tombstone.revision, recordCollection.insertOne.firstCall.args[0].revision]).size).to.equal(3);
  });

  it('permanently deletes record datastreams from GridFS', async function () {
    sandbox.stub(service, 'listDatastreams').resolves([{ _id: 'file-1' }]);
    mockBucket.delete.callsFake((id, cb) => cb(null, {}));

    const response = await service.delete('oid-1', true);

    expect(response.success).to.equal(true);
    expect(mockBucket.delete.calledOnceWith('file-1')).to.be.true;
  });

  it('returns an unsuccessful response when delete throws', async function () {
    sandbox.stub(service, 'getMeta').resolves({ redboxOid: 'oid-1', metadata: {} });
    Record.destroyOne.rejects(new Error('delete failed'));

    const response = await service.delete('oid-1', false);

    expect(response.success).to.equal(false);
    expect(response.message).to.equal('delete failed');
  });

  it('logs GridFS deletion callback errors during permanent delete', async function () {
    sandbox.stub(service, 'listDatastreams').resolves([{ _id: 'file-1' }]);
    mockBucket.delete.callsFake((id, cb) => cb(new Error('gridfs failed')));

    await service.delete('oid-1', true);

    expect(mockSails.log.error.called).to.be.true;
  });

  it('refuses direct notification persistence outside the authoritative service pipeline', async function () {
    const updateMetaStub = sandbox.stub(service, 'updateMeta');
    const record = { secret: 'must-not-be-logged-or-mutated' };
    mockSails.log.verbose.resetHistory();

    const result = await service.updateNotificationLog('oid-1', record, {
      name: 'notify',
      logName: 'notifications',
      flagName: 'status.sent',
      flagVal: true,
      forceRun: true,
      saveRecord: true,
    });

    expect(result.applicationState).to.equal('not-applied');
    expect(result.nonApplicationReason).to.equal('capability-unavailable');
    expect(updateMetaStub.notCalled).to.be.true;
    expect(record).to.deep.equal({ secret: 'must-not-be-logged-or-mutated' });
    expect(JSON.stringify(mockSails.log.verbose.args)).not.to.include('must-not-be-logged-or-mutated');
  });

  it('returns the record unchanged when a notification condition is not met', async function () {
    sandbox.stub(service, 'metTriggerCondition').returns('false');
    const record = { keep: true };

    const result = await service.updateNotificationLog('oid-1', record, {
      name: 'notify',
      triggerCondition: 'never',
    });

    expect(result).to.equal(record);
  });

  it('returns a typed non-application fact rather than dispatching an unsafe notification write', async function () {
    const updateMetaStub = sandbox.stub(service, 'updateMeta');

    const result = await service.updateNotificationLog(
      'oid-1',
      {},
      {
        name: 'notify',
        forceRun: true,
        saveRecord: true,
      }
    );
    expect(result.applicationState).to.equal('not-applied');
    expect(updateMetaStub.notCalled).to.be.true;
  });

  it('restores deleted records and removes the tombstone', async function () {
    DeletedRecord.findOne.resolves({
      redboxOid: 'oid-1',
      revision: 8,
      deletedRecordMetadata: { _id: 'mongo-id', redboxOid: 'oid-1', title: 'Restored' },
    });

    const response = await service.restoreRecord('oid-1');

    expect(response.success).to.equal(true);
    expect(recordCollection.insertOne.calledOnce).to.be.true;
    expect(recordCollection.insertOne.firstCall.args[0]).to.include({
      redboxOid: 'oid-1',
      title: 'Restored',
      revision: 9,
    });
    expect(recordCollection.insertOne.firstCall.args[0]).to.not.have.property('_id');
    expect(response.metadata).to.include({ redboxOid: 'oid-1', title: 'Restored', revision: 9 });
    expect(DeletedRecord.destroyOne.calledOnceWith({ redboxOid: 'oid-1' })).to.be.true;
  });

  it('returns the metadata of a deleted record', async function () {
    DeletedRecord.findOne.resolves({
      redboxOid: 'oid-1',
      deletedRecordMetadata: { redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1' } },
    });

    const metadata = await service.getDeletedRecordMeta('oid-1');

    expect(DeletedRecord.findOne.calledWith({ redboxOid: 'oid-1' })).to.be.true;
    expect(metadata).to.deep.equal({ redboxOid: 'oid-1', revision: 0, metaMetadata: { brandId: 'brand-1' } });
  });

  it('returns null when no deleted record exists for the oid', async function () {
    DeletedRecord.findOne.resolves(null);

    expect(await service.getDeletedRecordMeta('oid-1')).to.equal(null);
  });

  it('rejects getDeletedRecordMeta for an empty oid', async function () {
    await expectRejects(() => service.getDeletedRecordMeta(''), 'refusing to search using an empty OID');
  });

  it('queries deleted records through the collection helper', async function () {
    const runStub = sandbox.stub(service, 'runDeletedRecordQuery').resolves({ items: ['x'], totalItems: 1 });

    const response = await service.getDeletedRecords('draft', ['rdmp'], 0, 10, 'user', [], { id: 'brand-1' });

    expect(response.items).to.deep.equal(['x']);
    expect(response.totalItems).to.equal(1);
    expect(runStub.calledOnce).to.be.true;
  });

  it('builds deleted-record queries for equal filters and sort fallbacks', async function () {
    const runStub = sandbox.stub(service, 'runDeletedRecordQuery').resolves({ items: [], totalItems: 0 });

    await service.getDeletedRecords(
      'draft',
      ['rdmp'],
      5,
      10,
      'user',
      [{ name: 'Admin', branding: 'brand-1' }],
      { id: 'brand-1' },
      undefined,
      ['package-a'],
      'lastSaveDate:1',
      ['metadata.title'],
      'Exact title',
      'equal',
      'redboxOid:-1'
    );

    const query = runStub.firstCall.args[1];
    const options = runStub.firstCall.args[2];
    expect(query['deletedRecordMetadata.workflow.stage']).to.equal('draft');
    expect(query.$and.some((entry: any) => entry['metadata.title'] === 'Exact title')).to.equal(true);
    expect(options.sort.lastSaveDate).to.equal(1);
    expect(options.sort.redboxOid).to.equal(-1);
  });

  it('queries records with escaped regex filters', async function () {
    const runStub = sandbox.stub(service, 'runRecordQuery').resolves({ items: ['x'], totalItems: 1 });

    const response = await service.getRecords(
      'draft',
      'rdmp',
      0,
      10,
      'user',
      [{ name: 'Admin', branding: 'brand-1' }],
      { id: 'brand-1' },
      undefined,
      undefined,
      undefined,
      ['metadata.title'],
      'a+b',
      'regex'
    );

    expect(response.items).to.deep.equal(['x']);
    const query = runStub.firstCall.args[1];
    expect(`${query['metadata.title']}`).to.include('a\\+b');
  });

  it('builds record queries for array filters, package types, workflow, and equal matching', async function () {
    const runStub = sandbox.stub(service, 'runRecordQuery').resolves({ items: [], totalItems: 0 });

    await service.getRecords(
      'review',
      ['rdmp', 'publication'],
      2,
      20,
      'user',
      [{ name: 'Admin', branding: 'brand-1' }],
      { id: 'brand-1' },
      undefined,
      ['package-a', 'package-b'],
      'lastSaveDate:1',
      ['metadata.title'],
      'Exact title',
      'equal',
      'redboxOid:-1'
    );

    const query = runStub.firstCall.args[1];
    const options = runStub.firstCall.args[2];
    expect(query.$or).to.have.length(2);
    expect(query['metaMetadata.packageType'].$or).to.have.length(2);
    expect(query['workflow.stage']).to.equal('review');
    expect(query['metadata.title']).to.equal('Exact title');
    expect(options.sort.lastSaveDate).to.equal(1);
    expect(options.sort.redboxOid).to.equal(-1);
  });

  it('applies single-item record and package type filters', async function () {
    const runStub = sandbox.stub(service, 'runRecordQuery').resolves({ items: [], totalItems: 0 });

    await service.getRecords('', ['rdmp'], 0, 5, 'user', [], { id: 'brand-1' }, undefined, ['package-a']);

    const query = runStub.firstCall.args[1];
    expect(query['metaMetadata.type']).to.equal('rdmp');
    expect(query['metaMetadata.packageType']).to.equal('package-a');
  });

  it('runs record and deleted-record collection helpers directly', async function () {
    service.recordCol = {
      find: sandbox.stub().returns({ toArray: sandbox.stub().resolves(['record']) }),
      count: sandbox.stub().resolves(1),
    };
    service.deletedRecordCol = {
      find: sandbox.stub().returns({ toArray: sandbox.stub().resolves(['deleted']) }),
      count: sandbox.stub().resolves(2),
    };

    const records = await service.runRecordQuery('record', { redboxOid: '1' }, { limit: 1 });
    const deleted = await service.runDeletedRecordQuery('deletedrecord', { redboxOid: '2' }, { limit: 1 });

    expect(records).to.deep.equal({ items: ['record'], totalItems: 1 });
    expect(deleted).to.deep.equal({ items: ['deleted'], totalItems: 2 });
  });

  // Paged find stub that serves the same batch to every export pass: returns the batch on the
  // first page (skip 0) and an empty terminating batch afterwards. fetchAllRecords resets skip to
  // 0 on each pass, so both the field-collection pass and the CSV pass receive identical data.
  const pagedFind = (batch: any[]) =>
    sandbox.stub().callsFake((_query: any, opts: any) => ({
      toArray: async () => ((opts.skip ?? 0) === 0 ? batch : []),
    }));

  const pagedFindPages = (pagesBySkip: Record<number, any[]>) =>
    sandbox.stub().callsFake((_query: any, opts: any) => ({
      toArray: async () => pagesBySkip[opts.skip ?? 0] ?? [],
    }));

  it('exports plans as UTF-8 BOM csv using streamed records', async function () {
    service.recordCol = { find: pagedFind([{ redboxOid: '1', metadata: { title: 'Waldenström' } }]) };

    const exportStream = service.exportAllPlans('user', [], { id: 'brand-1' }, 'csv', null, null, 'rdmp');
    const chunks: Buffer[] = [];
    for await (const chunk of exportStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const outputBuffer = Buffer.concat(chunks);
    expect([...outputBuffer.subarray(0, 3)]).to.deep.equal([0xef, 0xbb, 0xbf]);
    const output = outputBuffer.toString('utf8');
    expect(output).to.include('redboxOid');
    expect(output).to.include('Waldenström');
    // Two streamed passes over Mongo (column collection + CSV), each paging once for data and once
    // for the empty terminating batch.
    expect(service.recordCol.find.callCount).to.equal(4);
  });

  it('sanitizes formula-prefixed values after nested records are flattened', async function () {
    service.recordCol = {
      find: pagedFind([
        {
          redboxOid: '1',
          metadata: {
            title: '=HYPERLINK("https://example.invalid")',
            contributors: [{ name: '+malicious' }],
          },
        },
      ]),
    };

    const exportStream = service.exportAllPlans('user', [], { id: 'brand-1' }, 'csv', null, null, 'rdmp');
    const chunks: Buffer[] = [];
    for await (const chunk of exportStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const output = Buffer.concat(chunks).toString('utf8');

    expect(output).to.include(`'=HYPERLINK`);
    expect(output).to.include(`'+malicious`);
    expect(output).to.not.include(`,"=HYPERLINK`);
  });

  it('includes csv columns from later result pages that the first record lacks', async function () {
    service.recordCol = {
      find: pagedFindPages({
        0: [
          { redboxOid: '1', metadata: { title: 'One' } },
          { redboxOid: '2', metadata: { title: 'Two' } },
        ],
        2: [{ redboxOid: '3', metadata: { title: 'Three', extraField: 'present' } }],
      }),
    };

    const exportStream = service.exportAllPlans('user', [], { id: 'brand-1' }, 'csv', null, null, 'rdmp');
    const chunks: Buffer[] = [];
    for await (const chunk of exportStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const outputBuffer = Buffer.concat(chunks);
    expect([...outputBuffer.subarray(0, 3)]).to.deep.equal([0xef, 0xbb, 0xbf]);
    const output = outputBuffer.toString('utf8');

    // Header is the union of every paged record's flattened keys, so the second-page column survives.
    expect(output).to.include('metadata.extraField');
    expect(output).to.include('present');
    expect(output).to.include('"1"');
    expect(output).to.include('"3"');
    // Two export passes, each reading skip 0, skip 2, then the empty terminating page at skip 4.
    expect(service.recordCol.find.callCount).to.equal(6);
  });

  it('produces an empty csv and skips the second pass when there are no records', async function () {
    service.recordCol = { find: pagedFind([]) };

    const exportStream = service.exportAllPlans('user', [], { id: 'brand-1' }, 'csv', null, null, 'rdmp');
    const chunks: Buffer[] = [];
    for await (const chunk of exportStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    // No matching records means no columns to derive a header from, so the stream ends cleanly as a
    // zero-byte file. A BOM on its own is displayed as visible mojibake by some versions of Excel.
    const outputBuffer = Buffer.concat(chunks);
    expect(outputBuffer).to.have.length(0);
    // Only the field-collection pass runs (single page, immediately empty); the CSV pass is skipped.
    expect(service.recordCol.find.callCount).to.equal(1);
  });

  it('stops collecting csv fields once the export has been cancelled', async function () {
    // Each page holds one record; cancellation is signalled after the first record is seen.
    const findStub = sandbox.stub();
    findStub
      .onFirstCall()
      .returns({ toArray: sandbox.stub().resolves([{ redboxOid: '1', metadata: { title: 'One' } }]) });
    findStub
      .onSecondCall()
      .returns({ toArray: sandbox.stub().resolves([{ redboxOid: '2', metadata: { extraField: 'present' } }]) });
    // A third page is never requested; if it were, this unstubbed call would throw and fail the test.
    service.recordCol = { find: findStub };

    let scanned = 0;
    const isCancelled = () => scanned++ >= 1;
    const fields = await service.collectCsvFields({}, { limit: 1 }, isCancelled);

    // The loop bails out before the second record's columns are collected, so the scan stops short
    // instead of reading every matching record.
    expect(fields).to.include('redboxOid');
    expect(fields).to.not.include('metadata.extraField');
    expect(findStub.callCount).to.equal(2);
  });

  it('errors the export stream when the csv query fails', async function () {
    service.recordCol = {
      find: sandbox.stub().returns({ toArray: sandbox.stub().rejects(new Error('mongo query failed')) }),
    };

    const exportStream = service.exportAllPlans('user', [], { id: 'brand-1' }, 'csv', null, null, 'rdmp');
    await expectRejects(async () => {
      for await (const _chunk of exportStream) {
        // drain
      }
    }, 'mongo query failed');
  });

  it('exports plans as json and iterates over multiple record pages', async function () {
    const findStub = sandbox.stub();
    findStub.onFirstCall().returns({ toArray: sandbox.stub().resolves([{ redboxOid: '1' }]) });
    findStub.onSecondCall().returns({ toArray: sandbox.stub().resolves([{ redboxOid: '2' }]) });
    findStub.onThirdCall().returns({ toArray: sandbox.stub().resolves([]) });
    service.recordCol = { find: findStub };

    const exportStream = service.exportAllPlans(
      'user',
      [{ name: 'Admin', branding: 'brand-1' }],
      { id: 'brand-1' },
      'json',
      '2025-01-10',
      '2025-01-01',
      'rdmp'
    );
    const chunks: Buffer[] = [];
    for await (const chunk of exportStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const outputBuffer = Buffer.concat(chunks);
    expect([...outputBuffer.subarray(0, 3)]).to.not.deep.equal([0xef, 0xbb, 0xbf]);
    const output = outputBuffer.toString('utf8');
    expect(output).to.include('"redboxOid":"1"');
    expect(output).to.include('"redboxOid":"2"');
    expect(findStub.callCount).to.equal(3);
  });

  it('filters role names by brand', function () {
    const roleNames = service.getRoleNames(
      [
        { name: 'Admin', branding: 'brand-1' },
        { name: 'Guest', branding: 'brand-2' },
      ],
      { id: 'brand-1' }
    );

    expect(roleNames).to.deep.equal(['Admin']);
  });

  it('aggregates success and failure messages when adding multiple datastreams', async function () {
    sandbox.stub(service, 'addDatastream').onFirstCall().resolves(undefined).onSecondCall().rejects(new Error('nope'));

    const response = await service.addDatastreams('oid-1', [{ fileId: '1' }, { fileId: '2' }]);

    expect(response.success).to.equal(false);
    expect(response.message).to.include('Successfully uploaded');
    expect(response.message).to.include('Failed to upload');
  });

  it('adds a datastream using the default staging disk when one is not supplied', async function () {
    const readable = Readable.from(['hello']);
    const stagingDisk = { getStream: sandbox.stub().resolves(readable) };
    (global as any).StorageManagerService.stagingDisk.returns(stagingDisk);
    const bucketStream = new PassThrough() as any;
    bucketStream.gridFSFile = { _id: 'grid-file' };
    mockBucket.openUploadStream.returns(bucketStream);

    const promise = service.addDatastream('oid-1', { fileId: 'file-1', metadata: { name: 'doc' } });
    bucketStream.emit('finish');
    await promise;

    expect(stagingDisk.getStream.calledOnceWith('file-1')).to.be.true;
    expect(
      mockBucket.openUploadStream.calledOnceWith('oid-1/file-1', { metadata: { name: 'doc', redboxOid: 'oid-1' } })
    ).to.be.true;
  });

  it('uses a named disk and computes attachment add/remove requests in updateDatastream', async function () {
    const disk = { getStream: sandbox.stub() };
    (global as any).StorageManagerService.disk.returns(disk);
    const addAndRemoveStub = sandbox.stub(service, 'addAndRemoveDatastreams').resolves({ ok: true });
    (global as any).FormsService.getFormByName.returns(of({ configuration: { attachmentFields: ['files'] } }));

    const result = await firstValueFrom(
      service.updateDatastream(
        'oid-1',
        {
          metaMetadata: { form: 'rdmp', brandId: 'brand-1' },
          metadata: { files: [{ fileId: 'old', type: 'attachment' }] },
        },
        {
          files: [{ fileId: 'new', type: 'attachment' }],
        },
        'staging',
        []
      )
    );

    expect((global as any).StorageManagerService.disk.calledOnceWith('staging')).to.be.true;
    expect((global as any).FormsService.getFormByName.calledOnceWith('rdmp', true, 'brand-1')).to.be.true;
    await Promise.all(result);
    expect(addAndRemoveStub.calledOnce).to.be.true;
    expect(addAndRemoveStub.firstCall.args[1][0].fileId).to.equal('new');
    expect(addAndRemoveStub.firstCall.args[2][0].fileId).to.equal('old');
  });

  it('returns a dummy request when updateDatastream finds no attachment fields', async function () {
    (global as any).FormsService.getFormByName.returns(of({ attachmentFields: [] }));
    const disk = { getStream: sandbox.stub() };

    const result = await firstValueFrom(
      service.updateDatastream('oid-1', { metaMetadata: { form: 'rdmp' }, metadata: {} }, {}, disk, [])
    );

    expect(result).to.have.length(1);
    expect(await result[0]).to.deep.equal({ request: 'dummy' });
  });

  it('requires a staging disk for addAndRemoveDatastreams', async function () {
    await expectRejects(() => service.addAndRemoveDatastreams('oid-1', [], [], undefined), 'requires a staging disk');
  });

  it('adds and removes datastreams when a staging disk is provided', async function () {
    const addStub = sandbox.stub(service, 'addDatastream').resolves(undefined);
    const removeStub = sandbox.stub(service, 'removeDatastream').resolves(undefined);

    await service.addAndRemoveDatastreams('oid-1', [{ fileId: 'new' }], [{ fileId: 'old' }], {
      getStream: sandbox.stub(),
    });

    expect(addStub.calledOnce).to.be.true;
    expect(removeStub.calledOnce).to.be.true;
  });

  it('removes a datastream when GridFS finds the file', async function () {
    sandbox.stub(service as any, 'getFileWithName').returns({
      toArray: sandbox.stub().resolves([{ _id: 'grid-file' }]),
    });
    mockBucket.delete.callsFake((id, cb) => cb(null, {}));

    await service.removeDatastream('oid-1', { fileId: 'file-1' });

    expect(mockBucket.delete.calledOnceWith('grid-file')).to.be.true;
  });

  it('logs and continues when removeDatastream cannot find the file', async function () {
    sandbox.stub(service as any, 'getFileWithName').returns({
      toArray: sandbox.stub().resolves([]),
    });

    await service.removeDatastream('oid-1', { fileId: 'missing' });

    expect(mockSails.log.verbose.called).to.be.true;
  });

  it('logs delete callback errors when removing a datastream', async function () {
    sandbox.stub(service as any, 'getFileWithName').returns({
      toArray: sandbox.stub().resolves([{ _id: 'grid-file' }]),
    });
    mockBucket.delete.callsFake((id, cb) => cb(new Error('delete failed')));

    await service.removeDatastream('oid-1', { fileId: 'file-1' });

    expect(mockSails.log.error.called).to.be.true;
  });

  it('rejects path-shaped staging cleanup identities before accessing storage', async function () {
    await expectRejects(
      () => service.removeStagedDatastream('../../outside-staging'),
      'Invalid staged attachment identity.'
    );

    expect((global as any).StorageManagerService.stagingDisk.notCalled).to.be.true;
  });

  it('throws a translated error when a datastream is missing', async function () {
    sandbox.stub(service as any, 'getFileWithName').returns({
      toArray: sandbox.stub().resolves([]),
    });

    await expectRejects(() => service.getDatastream('oid-1', 'file-1'), 'missing attachment');
  });

  it('returns an attachment stream when a datastream exists', async function () {
    sandbox.stub(service as any, 'getFileWithName').returns({
      toArray: sandbox.stub().resolves([{ _id: 'grid-file' }]),
    });

    const result = await service.getDatastream('oid-1', 'file-1');

    expect(result.readstream).to.equal('download-stream');
  });

  it('lists datastreams by oid and optional file id', async function () {
    mockBucket.find.returns({ toArray: sandbox.stub().resolves([{ filename: 'oid-1/file-1' }]) });

    const byOid = await service.listDatastreams('oid-1', null);
    const byFile = await service.listDatastreams('oid-1', 'file-1');

    expect(byOid).to.have.length(1);
    expect(mockBucket.find.firstCall.args[0]).to.deep.equal({ 'metadata.redboxOid': 'oid-1' });
    expect(mockBucket.find.secondCall.args[0]).to.deep.equal({ filename: 'oid-1/file-1' });
    expect(byFile).to.have.length(1);
  });

  it('validates fileRoot in updateDatastream', function () {
    expect(() => service.updateDatastream('oid-1', { metaMetadata: {}, metadata: {} }, {}, null, [])).to.throw(
      'requires fileRoot'
    );
  });

  it('rejects when streamFileToBucket emits an error', async function () {
    const readable = new PassThrough();
    const uploadStream = new PassThrough() as any;
    uploadStream.gridFSFile = { _id: 'grid-file' };
    mockBucket.openUploadStream.returns(uploadStream);

    const promise = service.streamFileToBucket(readable, 'oid-1/file-1', { redboxOid: 'oid-1' });
    uploadStream.emit('error', new Error('upload failed'));

    await expectRejects(() => promise, 'upload failed');
  });

  it('sanitizes record audits before saving', async function () {
    const response = await service.createRecordAudit({
      redboxOid: 'oid-1',
      action: 'save',
      user: new Date() as any,
      record: { safe: true },
    });

    expect(response.success).to.equal(true);
    expect(RecordAudit.create.calledOnceWith({ redboxOid: 'oid-1', action: 'save', record: { safe: true } })).to.be
      .true;
  });

  it('drops unserializable audit values and handles record-audit persistence failures', async function () {
    const circular: any = {};
    circular.self = circular;
    RecordAudit.create.rejects(new Error('audit failed'));

    const response = await service.createRecordAudit({
      redboxOid: 'oid-1',
      action: 'save',
      user: circular,
      record: undefined,
    });

    expect(response.success).to.equal(false);
    expect(response.message).to.equal('audit failed');
    expect(RecordAudit.create.calledOnceWith({ redboxOid: 'oid-1', action: 'save' })).to.be.true;
  });

  it('persists only the bounded execution-summary audit whitelist', async function () {
    const actions = Array.from({ length: 101 }, (_, index) => ({
      actionId: `hook-${index}`,
      mode: 'onCreate',
      phase: 'post',
      status: 'dispatched',
      attempts: 0,
      durationMs: 0,
      secret: 'must-not-persist',
    }));
    await service.createRecordAudit({
      redboxOid: 'oid-1',
      action: 'save',
      user: undefined,
      record: { safe: true },
      executionSummary: {
        schemaVersion: 1,
        executionId: 'execution-1',
        trigger: 'record-hook',
        operation: 'create',
        partial: false,
        durationMs: 4,
        totalActions: 101,
        counts: { dispatched: 101 },
        actions,
        truncated: true,
        detachedFinalization: 'grace-expired',
        detachedPending: 1,
        unsafe: 'must-not-persist',
      } as any,
    });

    const saved = RecordAudit.create.firstCall.args[0].executionSummary;
    expect(saved.actions).to.have.length(100);
    expect(saved.totalActions).to.equal(101);
    expect(saved.truncated).to.equal(true);
    expect(saved.detachedFinalization).to.equal('grace-expired');
    expect(saved.detachedPending).to.equal(1);
    expect(saved.unsafe).to.equal(undefined);
    expect(saved.actions[0].secret).to.equal(undefined);
  });

  it('builds record-audit queries from oid and dates', async function () {
    const dateFrom = new Date('2025-01-01T00:00:00Z');
    const dateTo = new Date('2025-01-02T00:00:00Z');

    await service.getRecordAudit({ oid: 'oid-1', dateFrom, dateTo });

    expect(RecordAudit.find.calledOnce).to.be.true;
    expect(RecordAudit.find.firstCall.args[0]).to.deep.equal({
      redboxOid: 'oid-1',
      createdAt: {
        '>=': dateFrom,
        '<=': dateTo,
      },
    });
  });

  it('supports record-audit queries with only an end date and rejects empty oids', async function () {
    await expectRejects(() => service.getRecordAudit({ oid: '' }), 'refusing to search using an empty OID');

    await service.getRecordAudit({ oid: 'oid-1', dateTo: new Date('2025-01-02T00:00:00Z') });

    expect(RecordAudit.find.lastCall.args[0].createdAt['<=']).to.be.instanceOf(Date);
  });

  it('sanitizes integration audits before saving', async function () {
    const response = await service.createIntegrationAudit({
      redboxOid: 'oid-1',
      integrationName: 'figshare',
      integrationAction: 'syncRecordWithFigshare',
      status: 'started',
      traceId: 'trace-1',
      spanId: 'span-1',
      startedAt: '2025-01-01T00:00:00.000Z',
      requestSummary: new Date() as any,
      responseSummary: { safe: true },
    });

    expect(response.success).to.equal(true);
    expect(IntegrationAudit.create.calledOnce).to.be.true;
    expect(IntegrationAudit.create.firstCall.args[0].constructor).to.equal(Object);
    expect(IntegrationAudit.create.firstCall.args[0]).to.include({
      redboxOid: 'oid-1',
      integrationName: 'figshare',
      integrationAction: 'syncRecordWithFigshare',
      status: 'started',
    });
    expect(IntegrationAudit.create.firstCall.args[0].requestSummary).to.be.undefined;
  });

  it('builds integration-audit queries from oid, status, dates, and pagination', async function () {
    const query = {
      sort: sandbox.stub().returnsThis(),
      skip: sandbox.stub().returnsThis(),
      limit: sandbox.stub().returnsThis(),
      then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(onFulfilled([])),
    };
    IntegrationAudit.find.returns(query);

    await service.getIntegrationAudit({
      oid: 'oid-1',
      status: 'failed',
      dateFrom: new Date('2025-01-01T00:00:00Z'),
      dateTo: new Date('2025-01-02T00:00:00Z'),
      page: 2,
      pageSize: 5,
    });

    expect(IntegrationAudit.find.calledOnce).to.be.true;
    expect(IntegrationAudit.find.firstCall.args[0]).to.deep.equal({
      redboxOid: 'oid-1',
      status: 'failed',
      startedAt: {
        '>=': '2025-01-01T00:00:00.000Z',
        '<=': '2025-01-02T00:00:00.000Z',
      },
    });
    expect(query.sort.calledOnce).to.be.true;
    expect(query.skip.calledOnceWith(5)).to.be.true;
    expect(query.limit.calledOnceWith(5)).to.be.true;
  });

  it('counts integration-audit queries using ISO string criteria for startedAt', async function () {
    await service.countIntegrationAudit({
      oid: 'oid-1',
      status: 'failed',
      dateFrom: new Date('2025-01-01T00:00:00Z'),
      dateTo: new Date('2025-01-02T00:00:00Z'),
    });

    expect(IntegrationAudit.count.calledOnce).to.be.true;
    expect(IntegrationAudit.count.firstCall.args[0]).to.deep.equal({
      redboxOid: 'oid-1',
      status: 'failed',
      startedAt: {
        '>=': '2025-01-01T00:00:00.000Z',
        '<=': '2025-01-02T00:00:00.000Z',
      },
    });
  });

  it('rejects restoreRecord for empty oids and reports failures', async function () {
    await expectRejects(() => service.restoreRecord(''), 'refusing to search using an empty OID');

    DeletedRecord.findOne.resolves({ deletedRecordMetadata: null });
    const response = await service.restoreRecord('oid-1');

    expect(response.success).to.equal(false);
  });

  it('loads deleted record metadata by oid', async function () {
    const metadata = { redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1' } };

    await expectRejects(() => service.getDeletedRecordMeta(''), 'refusing to search using an empty OID');
    DeletedRecord.findOne.resolves(null);
    expect(await service.getDeletedRecordMeta('missing')).to.equal(null);

    DeletedRecord.findOne.resolves({ deletedRecordMetadata: metadata });
    expect(await service.getDeletedRecordMeta('oid-1')).to.deep.equal({ ...metadata, revision: 0 });
    expect(DeletedRecord.findOne.lastCall.args[0]).to.deep.equal({ redboxOid: 'oid-1' });
  });

  it('destroys deleted records and reports validation or persistence failures', async function () {
    await expectRejects(() => service.destroyDeletedRecord(''), 'refusing to search using an empty OID');

    DeletedRecord.destroyOne.rejects(new Error('destroy failed'));
    const response = await service.destroyDeletedRecord('oid-1');

    expect(response.success).to.equal(false);
    expect(response.message).to.equal('destroy failed');
  });

  it('routes conditional tombstone destruction through the atomic purge primitive', async function () {
    deletedRecordCollection.findOneAndDelete.resolves({
      redboxOid: 'oid-1',
      revision: 4,
      lifecycleState: 'purge-pending',
    });
    const result = await service.destroyDeletedRecord('oid-1', {
      precondition: { expectedRevision: 4, requireRevision: true },
    });

    expect(result).to.include({ applicationState: 'applied', committedRevision: 4 });
    expect(DeletedRecord.destroyOne.notCalled).to.equal(true);
  });

  it('exposes the bucket lookup helper directly', function () {
    const expectedCursor = {};
    mockBucket.find.returns(expectedCursor);

    const result = service.getFileWithName('oid-1/file-1');

    expect(result).to.equal(expectedCursor);
    expect(mockBucket.find.calledOnceWith({ filename: 'oid-1/file-1' }, { limit: 1 })).to.be.true;
  });
});
