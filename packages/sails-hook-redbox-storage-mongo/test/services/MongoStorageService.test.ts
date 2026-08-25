const { expect } = require('chai');
const sinon = require('sinon');
const { of, firstValueFrom } = require('rxjs');
const { PassThrough, Readable } = require('node:stream');
const mongodb = require('mongodb');

async function expectRejects(fn: () => Promise<unknown>, message: string) {
  let rejection: unknown;
  try {
    await fn();
  } catch (error) {
    rejection = error;
  }
  expect(rejection, `Expected rejection containing: ${message}`).not.to.equal(undefined);
  expect(rejection instanceof Error ? rejection.message : String(rejection)).to.include(message);
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
  let recordIdentityCollection: any;
  let RecordSchemaArtifact: any;
  let RecordSchemaReference: any;

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
      find: sandbox.stub().returns({
        limit: sandbox.stub().returnsThis(),
        toArray: sandbox.stub().resolves([]),
      }),
      insertOne: sandbox.stub().resolves({ acknowledged: true }),
    };
    recordIdentityCollection = {
      findOne: sandbox.stub().resolves(null),
      insertOne: sandbox.stub().resolves({ acknowledged: true }),
      deleteOne: sandbox.stub().resolves({ acknowledged: true, deletedCount: 1 }),
      createIndexes: sandbox.stub().resolves([]),
    };
    mockDb.collection.callsFake((name: string) => {
      if (name === 'record') return recordCollection;
      if (name === 'deletedrecord') return deletedRecordCollection;
      return recordIdentityCollection;
    });

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
    RecordSchemaArtifact = {
      tableName: 'recordschemaartifact',
      getDatastore: sandbox.stub().returns({ manager: mockDb }),
    };
    RecordSchemaReference = {
      tableName: 'recordschemareference',
      getDatastore: sandbox.stub().returns({ manager: mockDb }),
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
    (global as any).RecordSchemaArtifact = RecordSchemaArtifact;
    (global as any).RecordSchemaReference = RecordSchemaReference;
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
    delete (global as any).RecordSchemaArtifact;
    delete (global as any).RecordSchemaReference;
    delete (global as any).TranslationService;
    delete (global as any).RecordTypesService;
    delete (global as any).FormsService;
    delete (global as any).StorageManagerService;
  });

  it('registers a ready hook in the constructor', function () {
    expect(mockSails.on.calledOnceWith('ready')).to.be.true;
  });

  it('awaits one shared initialization and propagates the real failure before allowing a retry', async function () {
    const failure = new Error('required index creation failed');
    let rejectInitialization: ((error: Error) => void) | undefined;
    const pendingInitialization = new Promise<void>((_resolve, reject) => {
      rejectInitialization = reject;
    });
    const performInit = sandbox.stub(service, 'performInit');
    performInit.onFirstCall().returns(pendingInitialization);
    performInit.onSecondCall().resolves();

    const first = service.init();
    const concurrent = service.init();
    expect(performInit.calledOnce).to.equal(true);

    rejectInitialization?.(failure);
    await expectRejects(() => first, failure.message);
    await expectRejects(() => concurrent, failure.message);
    expect(mockSails.log.error.calledOnceWithMatch(`storage_initialization_failed: ${failure.message}`)).to.equal(true);

    await service.init();
    expect(performInit.calledTwice).to.equal(true);
  });

  it('initializes collections and indices when they already exist', async function () {
    const recordCollection = {
      indexes: sandbox.stub().resolves([{ name: '_id_' }]),
      createIndexes: sandbox.stub().resolves([]),
    };
    const deletedCollection = {
      createIndexes: sandbox.stub().resolves([]),
    };
    const identityCollection = {
      createIndexes: sandbox.stub().resolves([]),
    };
    const artifactCollection = {
      indexes: sandbox.stub().resolves([{ name: '_id_', key: { _id: 1 } }]),
      createIndexes: sandbox.stub().resolves([]),
    };
    const referenceCollection = {
      indexes: sandbox.stub().resolves([{ name: '_id_', key: { _id: 1 } }]),
      createIndexes: sandbox.stub().resolves([]),
    };
    mockDb.collection.callsFake((name: string, options?: any) => {
      if (options?.strict) {
        return { ok: 1 };
      }
      if (name === 'record') {
        return recordCollection;
      }
      if (name === 'deletedrecord') return deletedCollection;
      if (name === 'recordidentity') return identityCollection;
      if (name === 'recordschemaartifact') {
        return artifactCollection;
      }
      if (name === 'recordschemareference') {
        return referenceCollection;
      }
      return deletedCollection;
    });

    await service.performInit();

    expect(service.gridFsBucket).to.be.ok;
    expect(service.recordCol).to.equal(recordCollection);
    expect(service.deletedRecordCol).to.equal(deletedCollection);
    expect(service.recordIdentityCol).to.equal(identityCollection);
    expect(recordCollection.createIndexes.calledOnceWith(mockSails.config.storage.mongodb.indices)).to.be.true;
    expect(deletedCollection.createIndexes.calledOnceWith(mockSails.config.storage.mongodb.deletedRecordIndices)).to.be
      .true;
    expect(artifactCollection.createIndexes.calledOnce).to.be.true;
    expect(referenceCollection.createIndexes.calledOnce).to.be.true;
  });

  it('creates the collection through a seed record when strict lookup fails', async function () {
    const recordCollection = {
      indexes: sandbox.stub().resolves([]),
      createIndexes: sandbox.stub().resolves([]),
    };
    const artifactCollection = {
      indexes: sandbox.stub().resolves([{ name: '_id_', key: { _id: 1 } }]),
      createIndexes: sandbox.stub().resolves([]),
    };
    const referenceCollection = {
      indexes: sandbox.stub().resolves([{ name: '_id_', key: { _id: 1 } }]),
      createIndexes: sandbox.stub().resolves([]),
    };
    mockDb.collection.callsFake((name: string, options?: { strict?: boolean }) => {
      if (options?.strict) {
        throw new Error('missing');
      }
      if (name === 'record') {
        return recordCollection;
      }
      if (name === 'recordidentity') {
        return { createIndexes: sandbox.stub().resolves([]) };
      }
      if (name === 'recordschemaartifact') {
        return artifactCollection;
      }
      if (name === 'recordschemareference') {
        return referenceCollection;
      }
      return { createIndexes: sandbox.stub().resolves([]) };
    });

    await service.performInit();

    expect(Record.create.calledOnce).to.be.true;
    expect(Record.destroyOne.calledOnce).to.be.true;
  });

  it('fails closed without advertising readiness or capability when a required index cannot be created', async function () {
    const recordCollection = {
      indexes: sandbox.stub().resolves([]),
      createIndexes: sandbox.stub().rejects(new Error('boom')),
      findOneAndUpdate: sandbox.stub(),
      findOneAndDelete: sandbox.stub(),
      findOne: sandbox.stub(),
      insertOne: sandbox.stub(),
    };
    mockDb.collection.returns(recordCollection);

    await expectRejects(() => service.performInit(), 'boom');

    expect(mockSails.emit.calledWith('hook:redbox:storage:ready')).to.equal(false);
    expect(service.getCapabilities()).to.deep.equal({});
  });

  it('accepts equivalent record-schema indexes with legacy names without recreating them', async function () {
    const standardCollection = {
      indexes: sandbox.stub().resolves([{ name: '_id_', key: { _id: 1 } }]),
      createIndexes: sandbox.stub().resolves([]),
    };
    const artifactCollection = {
      indexes: sandbox.stub().resolves([
        { name: '_id_', key: { _id: 1 } },
        {
          name: 'record_schema_artifact_digest_unique',
          key: { digest: 1 },
          unique: true,
        },
      ]),
      createIndexes: sandbox.stub().resolves([]),
    };
    const referenceCollection = {
      indexes: sandbox.stub().resolves([
        { name: '_id_', key: { _id: 1 } },
        {
          name: 'record_schema_reference_key_unique',
          key: { referenceKey: 1 },
          unique: true,
        },
        {
          name: 'digest_1_kind_1',
          key: { digest: 1, kind: 1 },
        },
        {
          name: 'oid_1_kind_1',
          key: { oid: 1, kind: 1 },
          sparse: true,
        },
        {
          name: 'kind_1_expiresAt_1',
          key: { kind: 1, expiresAt: 1 },
          partialFilterExpression: { kind: 'pin' },
        },
      ]),
      createIndexes: sandbox.stub().resolves([]),
    };
    mockDb.collection.callsFake((name: string) => {
      if (name === 'recordschemaartifact') return artifactCollection;
      if (name === 'recordschemareference') return referenceCollection;
      return standardCollection;
    });

    await service.performInit();

    expect(artifactCollection.createIndexes.called).to.equal(false);
    expect(referenceCollection.createIndexes.called).to.equal(false);
    expect(mockSails.emit.calledWith('hook:redbox:storage:ready')).to.equal(true);
  });

  it('accepts an equivalent Waterline digest_1 index definition', async function () {
    const standardCollection = {
      indexes: sandbox.stub().resolves([{ name: '_id_', key: { _id: 1 } }]),
      createIndexes: sandbox.stub().resolves([]),
    };
    const artifactCollection = {
      indexes: sandbox.stub().resolves([
        { name: '_id_', key: { _id: 1 } },
        { name: 'digest_1', key: { digest: 1 }, unique: true },
      ]),
      createIndexes: sandbox.stub().resolves([]),
    };
    mockDb.collection.callsFake((name: string) =>
      name === 'recordschemaartifact' ? artifactCollection : standardCollection
    );

    await service.performInit();

    expect(artifactCollection.createIndexes.called).to.equal(false);
  });

  it('fails initialization when an existing record-schema index has mismatched options', async function () {
    const standardCollection = {
      indexes: sandbox.stub().resolves([{ name: '_id_', key: { _id: 1 } }]),
      createIndexes: sandbox.stub().resolves([]),
    };
    const artifactCollection = {
      indexes: sandbox.stub().resolves([
        { name: '_id_', key: { _id: 1 } },
        {
          name: 'record_schema_artifact_digest_unique',
          key: { digest: 1 },
          unique: false,
        },
      ]),
      createIndexes: sandbox.stub().resolves([]),
    };
    mockDb.collection.callsFake((name: string) =>
      name === 'recordschemaartifact' ? artifactCollection : standardCollection
    );

    await expectRejects(
      () => service.performInit(),
      'Existing index record_schema_artifact_digest_unique has options that do not match required index digest_1'
    );

    expect(artifactCollection.createIndexes.called).to.equal(false);
    expect(mockSails.emit.calledWith('hook:redbox:storage:ready')).to.equal(false);
  });

  it('creates a record and assigns a generated oid', async function () {
    sandbox.stub(service as any, 'getUuid').returns('12345678901234567890123456789012');

    const response = await service.create(null, { metadata: {} }, null);

    expect(response.success).to.equal(true);
    expect(response.oid).to.equal('12345678901234567890123456789012');
    expect(response.committedRevision).to.equal(0);
    expect(recordCollection.insertOne.firstCall.args[0]).to.include({
      redboxOid: '12345678901234567890123456789012',
      revision: 0,
    });
    expect(recordCollection.insertOne.firstCall.args[0].incarnationId).to.match(/^[0-9a-f-]{36}$/);
  });

  it('overwrites a client-supplied create revision', async function () {
    const candidate = {
      redboxOid: 'oid-client',
      revision: 72,
      incarnationId: '22222222-2222-4222-8222-222222222222',
      metadata: {},
    };

    const response = await service.create(null, candidate, null);

    expect(response.committedRevision).to.equal(0);
    expect(recordCollection.insertOne.firstCall.args[0].revision).to.equal(0);
    expect(recordCollection.insertOne.firstCall.args[0].incarnationId).not.to.equal(candidate.incarnationId);
    expect(candidate.revision).to.equal(72);
  });

  it('preserves a preassigned record oid instead of generating a replacement', async function () {
    const getUuid = sandbox.stub(service as any, 'getUuid').throws(new Error('unexpected generated oid'));
    const redboxOid = 'preassigned-record-oid';

    const response = await service.create(null, { redboxOid, metadata: {} }, null);

    expect(response.success).to.equal(true);
    expect(response.oid).to.equal(redboxOid);
    expect(getUuid.notCalled).to.equal(true);
    expect(recordCollection.insertOne.firstCall.args[0]).to.include({ redboxOid });
  });

  it('returns a failed response when create throws', async function () {
    sandbox.stub(service as any, 'getUuid').returns('12345678901234567890123456789012');
    recordCollection.insertOne.rejects(new Error('create failed'));

    const response = await service.create(null, { metadata: {} }, null);

    expect(response.success).to.equal(false);
    expect(response.message).to.equal('Record creation could not be confirmed');
    expect(response.message).not.to.include('create failed');
  });

  it('releases only this failed create reservation and permits an explicit-OID retry', async function () {
    recordCollection.insertOne
      .onFirstCall()
      .rejects(new mongodb.MongoServerError({ message: 'document validation rejected', code: 121 }));
    recordCollection.insertOne.onSecondCall().resolves({ acknowledged: true });

    const first = await service.create(null, { redboxOid: 'retryable-oid', metadata: {} }, null);
    const firstReservation = recordIdentityCollection.insertOne.firstCall.args[0];
    const second = await service.create(null, { redboxOid: 'retryable-oid', metadata: {} }, null);

    expect(first).to.include({ applicationState: 'unknown', success: false });
    expect(first.message).not.to.include('document validation rejected');
    expect(
      recordIdentityCollection.deleteOne.calledOnceWith({
        redboxOid: 'retryable-oid',
        incarnationId: firstReservation.incarnationId,
      })
    ).to.equal(true);
    expect(second).to.include({ applicationState: 'applied', success: true });
    expect(recordIdentityCollection.insertOne.callCount).to.equal(2);
  });

  it('keeps a failed create reservation when competing active state is observed', async function () {
    recordCollection.findOne.onFirstCall().resolves(null);
    recordCollection.findOne.onSecondCall().resolves({
      redboxOid: 'raced-oid',
      revision: 0,
      incarnationId: '22222222-2222-4222-8222-222222222222',
    });
    recordCollection.insertOne.rejects(new Error('ambiguous insert failure'));

    const response = await service.create(null, { redboxOid: 'raced-oid', metadata: {} }, null);

    expect(response).to.include({ applicationState: 'unknown', success: false });
    expect(recordIdentityCollection.deleteOne.notCalled).to.equal(true);
  });

  it('retains an ambiguous unused reservation so a retry cannot race a late commit', async function () {
    recordCollection.insertOne.rejects(new mongodb.MongoNetworkError('connection reset after dispatch'));
    recordIdentityCollection.findOne
      .onSecondCall()
      .callsFake(() => Promise.resolve(recordIdentityCollection.insertOne.firstCall.args[0]));

    const first = await service.create(null, { redboxOid: 'ambiguous-oid', metadata: {} }, null);
    const retry = await service.create(null, { redboxOid: 'ambiguous-oid', metadata: {} }, null);

    expect(first).to.include({ applicationState: 'unknown', success: false });
    expect(recordIdentityCollection.deleteOne.notCalled).to.equal(true);
    expect(retry).to.include({ applicationState: 'not-applied', nonApplicationReason: 'lifecycle-conflict' });
    expect(recordCollection.insertOne.calledOnce).to.equal(true);
  });

  it('reconciles an ambiguous insert as applied when the active record carries this reservation', async function () {
    recordCollection.insertOne.rejects(new mongodb.MongoNetworkError('connection reset after dispatch'));
    recordCollection.findOne.onSecondCall().callsFake(() => {
      const reservation = recordIdentityCollection.insertOne.firstCall.args[0];
      return Promise.resolve({
        redboxOid: 'reconciled-oid',
        revision: 0,
        incarnationId: reservation.incarnationId,
        metadata: {},
      });
    });

    const response = await service.create(null, { redboxOid: 'reconciled-oid', metadata: {} }, null);

    expect(response).to.include({ applicationState: 'applied', success: true, committedRevision: 0 });
    expect(recordIdentityCollection.deleteOne.notCalled).to.equal(true);
  });

  it('refuses an explicit OID that already has a durable owner without issuing an active create', async function () {
    recordIdentityCollection.findOne.resolves({
      redboxOid: 'owned-oid',
      incarnationId: '11111111-1111-4111-8111-111111111111',
    });

    const response = await service.create(null, { redboxOid: 'owned-oid', metadata: {} }, null);

    expect(response).to.include({ applicationState: 'not-applied', nonApplicationReason: 'lifecycle-conflict' });
    expect(recordCollection.insertOne.notCalled).to.equal(true);
  });

  it('durably reserves a legacy tombstone OID before rejecting explicit recreation', async function () {
    deletedRecordCollection.findOne.resolves({
      redboxOid: 'deleted-oid',
      revision: 7,
      lifecycleState: 'deleted',
      deletedRecordMetadata: { redboxOid: 'deleted-oid' },
    });

    const response = await service.create(null, { redboxOid: 'deleted-oid', metadata: {} }, null);

    expect(response).to.include({ applicationState: 'not-applied', nonApplicationReason: 'lifecycle-conflict' });
    expect(recordIdentityCollection.insertOne.calledOnce).to.equal(true);
    expect(recordIdentityCollection.insertOne.firstCall.args[0]).to.include({ redboxOid: 'deleted-oid' });
    expect(recordCollection.insertOne.notCalled).to.equal(true);
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

  it('declares full concurrency capability only after required indices and native atomic collections are ready', function () {
    expect(service.getCapabilities()).to.deep.equal({});
    service._requiredIndicesReady = true;
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
      operationId: '11111111-1111-4111-8111-111111111111',
      kind: 'restore',
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
      lifecycle: { expectedState: 'deleted', operationId: operation.operationId },
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
    expect(persisted.lifecycleOperation.requestId).to.equal(operation.requestId);
    expect(updated.requestId).to.equal(requestId);
    expect(deletedRecordCollection.findOneAndUpdate.firstCall.args[0].$and).to.deep.include.members([
      { lifecycleState: 'deleted' },
      { 'lifecycleOperation.operationId': operation.operationId },
    ]);

    deletedRecordCollection.findOneAndDelete.resolves({
      redboxOid: 'oid-1',
      revision: 6,
      brandId: 'brand-1',
      lifecycleState: 'restore-pending',
    });
    const removed = await service.removeTombstone({ id: 'brand-1' }, 'oid-1', {
      precondition: { expectedRevision: 6, requireRevision: true },
      requestId,
      lifecycle: { expectedState: 'restore-pending', operationId: operation.operationId },
    });
    expect(removed).to.include({ applicationState: 'applied', committedRevision: 6, requestId });
    expect(removed.removedRecord.lifecycleState).to.equal('restore-pending');
  });

  it('rejects malformed or inconsistent lifecycle candidates before dispatch', async function () {
    const options = {
      precondition: { expectedRevision: 5, requireRevision: true },
      lifecycle: { expectedState: 'deleted' as const },
    };
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
          operationId: '11111111-1111-4111-8111-111111111111',
          kind: 'restore',
          requestId: '123e4567-e89b-42d3-a456-426614174000',
          sourceRevision: 4,
          targetRevision: 7,
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

  it('atomically creates one owned tombstone intent and makes duplicate delivery idempotent', async function () {
    const operationId = '11111111-1111-4111-8111-111111111111';
    const tombstone = {
      redboxOid: 'oid-1',
      revision: 6,
      brandId: 'brand-1',
      lifecycleState: 'delete-pending',
      lifecycleOperation: {
        operationId,
        kind: 'delete',
        requestId: '22222222-2222-4222-8222-222222222222',
        sourceRevision: 5,
        targetRevision: 6,
        startedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
        attempts: 1,
        resolution: 'direct',
      },
      deletedRecordMetadata: {
        redboxOid: 'oid-1',
        revision: 5,
        metaMetadata: { brandId: 'brand-1' },
        metadata: {},
      },
    };
    const options = {
      precondition: { expectedRevision: 5, requireRevision: true },
      lifecycle: { expectedState: 'delete-pending', operationId },
    };

    const created = await service.createTombstone({ id: 'brand-1' }, 'oid-1', tombstone, options);
    expect(created).to.include({ applicationState: 'applied', committedRevision: 6 });
    expect(deletedRecordCollection.insertOne.firstCall.args[0].deletedRecordMetadata).not.to.have.property('revision');

    deletedRecordCollection.insertOne.rejects(Object.assign(new Error('duplicate'), { code: 11000 }));
    deletedRecordCollection.findOne.resolves(deletedRecordCollection.insertOne.firstCall.args[0]);
    const retry = await service.createTombstone({ id: 'brand-1' }, 'oid-1', tombstone, options);
    expect(retry).to.include({ applicationState: 'applied', committedRevision: 6 });

    const competingOperationId = '33333333-3333-4333-8333-333333333333';
    const competitor = await service.createTombstone(
      { id: 'brand-1' },
      'oid-1',
      {
        ...tombstone,
        lifecycleOperation: { ...tombstone.lifecycleOperation, operationId: competingOperationId },
      },
      {
        ...options,
        lifecycle: { ...options.lifecycle, operationId: competingOperationId },
      }
    );
    expect(competitor).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'lifecycle-conflict',
    });
  });

  it('keeps cross-brand lifecycle intent failures private and never dispatches the insert', async function () {
    const operationId = '11111111-1111-4111-8111-111111111111';
    const response = await service.createTombstone(
      { id: 'brand-1' },
      'oid-private',
      {
        redboxOid: 'oid-private',
        revision: 2,
        brandId: 'brand-2',
        lifecycleState: 'delete-pending',
        lifecycleOperation: {
          operationId,
          kind: 'delete',
          requestId: '22222222-2222-4222-8222-222222222222',
          sourceRevision: 1,
          targetRevision: 2,
          startedAt: '2026-08-24T00:00:00.000Z',
          updatedAt: '2026-08-24T00:00:00.000Z',
          attempts: 1,
          resolution: 'direct',
        },
        deletedRecordMetadata: {
          metaMetadata: { brandId: 'brand-2' },
          metadata: { secret: 'private' },
        },
      },
      {
        precondition: { expectedRevision: 1, requireRevision: true },
        lifecycle: { expectedState: 'delete-pending', operationId },
      }
    );

    expect(response).to.include({ applicationState: 'not-applied', nonApplicationReason: 'brand-mismatch' });
    expect(response.committedRecord).to.equal(undefined);
    expect(response.metadata).to.equal(null);
    expect(deletedRecordCollection.insertOne.notCalled).to.equal(true);
  });

  it('creates a restored active record once and certifies same-operation retries', async function () {
    const operationId = '11111111-1111-4111-8111-111111111111';
    const options = {
      precondition: { expectedRevision: 6, requireRevision: true },
      lifecycle: { expectedState: 'restore-pending', operationId },
    };
    deletedRecordCollection.findOne.resolves({
      redboxOid: 'oid-1',
      revision: 6,
      brandId: 'brand-1',
      lifecycleState: 'restore-pending',
      lifecycleOperation: {
        operationId,
        kind: 'restore',
        requestId: '22222222-2222-4222-8222-222222222222',
        sourceRevision: 5,
        targetRevision: 6,
        startedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:01.000Z',
        attempts: 1,
        resolution: 'direct',
      },
      deletedRecordMetadata: {
        redboxOid: 'oid-1',
        dateCreated: '2026-08-01T00:00:00.000Z',
        metaMetadata: { brandId: 'brand-1' },
        metadata: { title: 'Authoritative snapshot' },
      },
    });
    const record = {
      redboxOid: 'oid-1',
      revision: 999,
      lifecycleOperationId: 'client-marker',
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Restored' },
    };

    const created = await service.createActiveRecordFromTombstone({ id: 'brand-1' }, 'oid-1', record, options);
    expect(created).to.include({ applicationState: 'applied', committedRevision: 7 });
    const inserted = recordCollection.insertOne.firstCall.args[0];
    expect(inserted).to.include({
      revision: 7,
      lifecycleOperationId: operationId,
      dateCreated: '2026-08-01T00:00:00.000Z',
    });
    expect(inserted.metadata).to.deep.equal({ title: 'Authoritative snapshot' });

    recordCollection.insertOne.rejects(Object.assign(new Error('duplicate'), { code: 11000 }));
    recordCollection.findOne.resolves(inserted);
    const retry = await service.createActiveRecordFromTombstone({ id: 'brand-1' }, 'oid-1', record, options);
    expect(retry).to.include({ applicationState: 'applied', committedRevision: 7 });

    recordCollection.findOne.resolves({ ...inserted, lifecycleOperationId: 'other-operation' });
    const collision = await service.createActiveRecordFromTombstone({ id: 'brand-1' }, 'oid-1', record, options);
    expect(collision).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'lifecycle-conflict',
    });
  });

  it('returns unknown after an unclassified intent insert failure and bounds recovery scans', async function () {
    const operationId = '11111111-1111-4111-8111-111111111111';
    deletedRecordCollection.insertOne.rejects(new Error('network timeout'));
    const unknown = await service.createTombstone(
      { id: 'brand-1' },
      'oid-1',
      {
        redboxOid: 'oid-1',
        revision: 2,
        brandId: 'brand-1',
        lifecycleState: 'delete-pending',
        lifecycleOperation: {
          operationId,
          kind: 'delete',
          requestId: '22222222-2222-4222-8222-222222222222',
          sourceRevision: 1,
          targetRevision: 2,
          startedAt: '2026-08-24T00:00:00.000Z',
          updatedAt: '2026-08-24T00:00:00.000Z',
          attempts: 1,
          resolution: 'direct',
        },
        deletedRecordMetadata: { redboxOid: 'oid-1', metaMetadata: { brandId: 'brand-1' }, metadata: {} },
      },
      {
        precondition: { expectedRevision: 1, requireRevision: true },
        lifecycle: { expectedState: 'delete-pending', operationId },
      }
    );
    expect(unknown.applicationState).to.equal('unknown');

    const cursor = deletedRecordCollection.find();
    deletedRecordCollection.find.resetHistory();
    deletedRecordCollection.find.returns(cursor);
    await service.getLifecycleTombstones(['delete-pending', 'invalid', 'recovery-required'], 50_000);
    expect(deletedRecordCollection.find.firstCall.args[0]).to.deep.equal({
      lifecycleState: { $in: ['delete-pending', 'recovery-required'] },
    });
    expect(cursor.limit.calledWith(1000)).to.equal(true);
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
    const createStub = sandbox.stub(service, 'create').resolves({ success: true, applicationState: 'applied' });
    const data = [
      { externalId: 'ext-1', metaMetadata: {} },
      { externalId: 'ext-2', metaMetadata: {} },
    ];

    const response = await service.createBatch('rdmp', data, 'externalId');

    expect(response.success).to.equal(true);
    expect(response.applicationState).to.equal('applied');
    expect(createStub.callCount).to.equal(2);
    expect(data[0]).to.include({ harvestId: 'ext-1' });
    expect(data[0].metaMetadata).to.include({ type: 'rdmp' });
  });

  it('records createBatch failures in the response message when create rejects asynchronously', async function () {
    sandbox.stub(service, 'create').rejects(new Error('bad row'));
    const data = [{ externalId: 'ext-1', metaMetadata: {} }];

    const response = await service.createBatch('rdmp', data, 'externalId');

    expect(response.success).to.equal(false);
    expect(response.applicationState).to.equal('unknown');
    expect(response.message).to.equal('Batch create incomplete (0 not applied, 1 unknown).');
    expect(response.message).not.to.include('bad row');
  });

  it('reports a typed non-applied create as a definite batch failure and still awaits later rows', async function () {
    const createStub = sandbox.stub(service, 'create');
    createStub.onFirstCall().resolves({
      success: false,
      applicationState: 'not-applied',
      nonApplicationReason: 'lifecycle-conflict',
    });
    createStub.onSecondCall().resolves({ success: true, applicationState: 'applied' });
    const data = [
      { externalId: 'ext-1', metaMetadata: {} },
      { externalId: 'ext-2', metaMetadata: {} },
    ];

    const response = await service.createBatch('rdmp', data, 'externalId');

    expect(createStub.callCount).to.equal(2);
    expect(response.success).to.equal(false);
    expect(response.applicationState).to.equal('not-applied');
    expect(response.message).to.equal('Batch create incomplete (1 not applied, 0 unknown).');
  });

  it('lets a typed unknown create take precedence in the aggregate batch result', async function () {
    const createStub = sandbox.stub(service, 'create');
    createStub.onFirstCall().resolves({ success: false, applicationState: 'not-applied' });
    createStub.onSecondCall().resolves({ success: false, applicationState: 'unknown' });

    const response = await service.createBatch(
      'rdmp',
      [
        { externalId: 'ext-1', metaMetadata: {} },
        { externalId: 'ext-2', metaMetadata: {} },
      ],
      'externalId'
    );

    expect(response.success).to.equal(false);
    expect(response.applicationState).to.equal('unknown');
    expect(response.message).to.equal('Batch create incomplete (1 not applied, 1 unknown).');
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

  it('fails closed for tokenless legacy soft-delete calls', async function () {
    sandbox.stub(service, 'getMeta').resolves({ redboxOid: 'oid-1', revision: 4, metadata: {} });

    const response = await service.delete('oid-1', false);

    expect(response).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'capability-unavailable',
    });
    expect(deletedRecordCollection.insertOne.notCalled).to.be.true;
    expect(Record.destroyOne.notCalled).to.be.true;
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

  it('fails closed for every tokenless legacy lifecycle mutation', async function () {
    const deleted = await service.delete('oid-lineage', false);
    const restored = await service.restoreRecord('oid-lineage');
    const purged = await service.destroyDeletedRecord('oid-lineage');

    for (const response of [deleted, restored, purged]) {
      expect(response).to.include({
        applicationState: 'not-applied',
        nonApplicationReason: 'capability-unavailable',
      });
    }
    expect(deletedRecordCollection.insertOne.notCalled).to.be.true;
    expect(recordCollection.insertOne.notCalled).to.be.true;
    expect(DeletedRecord.destroyOne.notCalled).to.be.true;
  });

  it('does not let the legacy permanent-delete entry point touch GridFS', async function () {
    sandbox.stub(service, 'listDatastreams').resolves([{ _id: 'file-1' }]);
    mockBucket.delete.callsFake((id, cb) => cb(null, {}));

    const response = await service.delete('oid-1', true);

    expect(response).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'capability-unavailable',
    });
    expect(mockBucket.delete.notCalled).to.be.true;
  });

  it('does not dispatch legacy delete even when old persistence dependencies would fail', async function () {
    sandbox.stub(service, 'getMeta').resolves({ redboxOid: 'oid-1', metadata: {} });
    Record.destroyOne.rejects(new Error('delete failed'));

    const response = await service.delete('oid-1', false);

    expect(response).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'capability-unavailable',
    });
    expect(Record.destroyOne.notCalled).to.be.true;
  });

  it('does not invoke legacy permanent-delete callbacks', async function () {
    sandbox.stub(service, 'listDatastreams').resolves([{ _id: 'file-1' }]);
    mockBucket.delete.callsFake((id, cb) => cb(new Error('gridfs failed')));

    const response = await service.delete('oid-1', true);

    expect(response.nonApplicationReason).to.equal('capability-unavailable');
    expect(mockBucket.delete.notCalled).to.be.true;
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

  it('does not route legacy restore through direct collection mutations', async function () {
    DeletedRecord.findOne.resolves({
      redboxOid: 'oid-1',
      revision: 8,
      deletedRecordMetadata: { _id: 'mongo-id', redboxOid: 'oid-1', title: 'Restored' },
    });

    const response = await service.restoreRecord('oid-1');

    expect(response).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'capability-unavailable',
    });
    expect(recordCollection.insertOne.notCalled).to.be.true;
    expect(DeletedRecord.destroyOne.notCalled).to.be.true;
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

  it('fails closed for empty and populated legacy restore requests', async function () {
    const empty = await service.restoreRecord('');
    DeletedRecord.findOne.resolves({ deletedRecordMetadata: null });
    const response = await service.restoreRecord('oid-1');

    expect(empty.nonApplicationReason).to.equal('capability-unavailable');
    expect(response.nonApplicationReason).to.equal('capability-unavailable');
    expect(DeletedRecord.findOne.notCalled).to.be.true;
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

  it('fails closed for empty and populated legacy tombstone destruction', async function () {
    const empty = await service.destroyDeletedRecord('');
    DeletedRecord.destroyOne.rejects(new Error('destroy failed'));
    const response = await service.destroyDeletedRecord('oid-1');

    expect(empty.nonApplicationReason).to.equal('capability-unavailable');
    expect(response.nonApplicationReason).to.equal('capability-unavailable');
    expect(DeletedRecord.destroyOne.notCalled).to.be.true;
  });

  it('does not allow conditional callers to bypass staged tombstone purge', async function () {
    deletedRecordCollection.findOneAndDelete.resolves({
      redboxOid: 'oid-1',
      revision: 4,
      lifecycleState: 'purge-pending',
    });
    const result = await service.destroyDeletedRecord('oid-1', {
      precondition: { expectedRevision: 4, requireRevision: true },
    });

    expect(result).to.include({
      applicationState: 'not-applied',
      nonApplicationReason: 'capability-unavailable',
    });
    expect(DeletedRecord.destroyOne.notCalled).to.equal(true);
    expect(deletedRecordCollection.findOneAndDelete.notCalled).to.equal(true);
  });

  it('exposes the bucket lookup helper directly', function () {
    const expectedCursor = {};
    mockBucket.find.returns(expectedCursor);

    const result = service.getFileWithName('oid-1/file-1');

    expect(result).to.equal(expectedCursor);
    expect(mockBucket.find.calledOnceWith({ filename: 'oid-1/file-1' }, { limit: 1 })).to.be.true;
  });
});
