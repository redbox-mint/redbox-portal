const { expect } = require('chai');
const sinon = require('sinon');
const { of, firstValueFrom } = require('rxjs');
const { PassThrough, Readable } = require('stream');
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

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockSails = {
      config: {
        storage: {
          mongodb: {
            indices: [{ key: { redboxOid: 1 } }],
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
    const deletedCollection = {};
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
    expect(Record.create.firstCall.args[0]).to.include({ redboxOid: '12345678901234567890123456789012' });
  });

  it('returns a failed response when create throws', async function () {
    sandbox.stub(service as any, 'getUuid').returns('12345678901234567890123456789012');
    Record.create.rejects(new Error('create failed'));

    const response = await service.create(null, { metadata: {} }, null);

    expect(response.success).to.equal(false);
    expect(response.message).to.equal('create failed');
  });

  it('strips immutable fields before updateMeta persists', async function () {
    const setStub = sandbox.stub().resolves({});
    Record.updateOne.returns({ set: setStub });
    const record = { id: 'a', _id: 'b', dateCreated: 'c', lastSaveDate: 'd', keep: true };

    const response = await service.updateMeta(null, 'oid-1', record);

    expect(response.success).to.equal(true);
    expect(setStub.calledOnceWith({ keep: true })).to.be.true;
  });

  it('returns an unsuccessful response when updateMeta fails', async function () {
    const setStub = sandbox.stub().rejects(new Error('update failed'));
    Record.updateOne.returns({ set: setStub });

    const response = await service.updateMeta('brand', 'oid-1', { keep: true }, 'user');

    expect(response.success).to.equal(false);
    expect(String(response.message.message || response.message)).to.include('update failed');
  });

  it('rejects getMeta for an empty oid', async function () {
    await expectRejects(() => service.getMeta(''), 'refusing to search using an empty OID');
  });

  it('checks existence via Record.count', async function () {
    Record.count.resolves(2);
    expect(await service.exists('oid-1')).to.equal(true);
    expect(Record.count.calledOnceWith({ redboxOid: 'oid-1' })).to.be.true;
  });

  it('promotes pending authorization into real access arrays', async function () {
    const metadata = {
      authorization: {
        view: ['existing'],
        edit: [],
        viewPending: ['user@example.com'],
        editPending: ['user@example.com', 'user@example.com'],
      },
    };
    sandbox.stub(service, 'getMeta').resolves(metadata);
    const updateMetaStub = sandbox.stub(service, 'updateMeta').resolves({});

    service.provideUserAccessAndRemovePendingAccess('oid-1', 'user@example.com', 'user@example.com');
    await Promise.resolve();
    await Promise.resolve();

    expect(updateMetaStub.calledOnce).to.be.true;
    const updated = updateMetaStub.firstCall.args[2];
    expect(updated.authorization.edit).to.deep.equal(['user@example.com']);
    expect(updated.authorization.view).to.deep.equal(['existing', 'user@example.com']);
    expect(updated.authorization.editPending).to.deep.equal([]);
    expect(updated.authorization.viewPending).to.deep.equal([]);
  });

  it('logs an error if pending authorization promotion cannot save', async function () {
    sandbox.stub(service, 'getMeta').resolves({ authorization: {} });
    sandbox.stub(service, 'updateMeta').rejects(new Error('save failed'));

    service.provideUserAccessAndRemovePendingAccess('oid-1', 'user@example.com', 'user@example.com');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockSails.log.error.called).to.be.true;
  });

  it('prepares batch items before dispatching create calls', async function () {
    const createStub = sandbox.stub(service, 'create').resolves({ success: true });
    const data = [{ externalId: 'ext-1', metaMetadata: {} }, { externalId: 'ext-2', metaMetadata: {} }];

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
      of(recordTypeName === 'parent' ? { relatedTo: [{ recordType: 'child', foreignField: 'parentId' }] } : { relatedTo: [] })
    );
    const metaQuery = { meta: sandbox.stub().resolves([{ redboxOid: 'child-1', parentId: 'oid-1' }]) };
    Record.find.returns(metaQuery);

    const result = await service.getRelatedRecords('oid-1', { id: 'brand-1' });

    expect(result.processedRelationships).to.deep.equal(['parent', 'child']);
    expect(result.relatedObjects.parent).to.have.length(1);
    expect(result.relatedObjects.child).to.have.length(1);
    expect(Record.find.calledOnce).to.be.true;
    expect(metaQuery.meta.calledOnce).to.be.true;
  });

  it('soft-deletes records by copying them into DeletedRecord first', async function () {
    sandbox.stub(service, 'getMeta').resolves({ redboxOid: 'oid-1', metadata: {} });

    const response = await service.delete('oid-1', false);

    expect(response.success).to.equal(true);
    expect(DeletedRecord.create.calledOnce).to.be.true;
    expect(Record.destroyOne.calledOnceWith({ redboxOid: 'oid-1' })).to.be.true;
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

  it('updates notification logs and persists when the trigger condition is met', async function () {
    const updateMetaStub = sandbox.stub(service, 'updateMeta').resolves({});
    const record = {};

    const result = await service.updateNotificationLog('oid-1', record, {
      name: 'notify',
      logName: 'notifications',
      flagName: 'status.sent',
      flagVal: true,
      forceRun: true,
      saveRecord: true,
    });

    expect(result.notifications).to.have.length(1);
    expect(result.status.sent).to.equal(true);
    expect(updateMetaStub.calledOnce).to.be.true;
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

  it('rethrows when notification persistence fails', async function () {
    sandbox.stub(service, 'metTriggerCondition').returns('true');
    sandbox.stub(service, 'updateMeta').rejects(new Error('persist failed'));

    await expectRejects(
      () => service.updateNotificationLog('oid-1', {}, { name: 'notify', saveRecord: true }),
      'persist failed'
    );
  });

  it('restores deleted records and removes the tombstone', async function () {
    DeletedRecord.findOne.resolves({
      redboxOid: 'oid-1',
      deletedRecordMetadata: { _id: 'mongo-id', redboxOid: 'oid-1', title: 'Restored' },
    });
    Record.create.resolves({ redboxOid: 'oid-1', title: 'Restored' });

    const response = await service.restoreRecord('oid-1');

    expect(response.success).to.equal(true);
    expect(Record.create.calledOnceWith({ redboxOid: 'oid-1', title: 'Restored' })).to.be.true;
    expect(DeletedRecord.destroyOne.calledOnceWith({ redboxOid: 'oid-1' })).to.be.true;
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

    await service.getRecords(
      '',
      ['rdmp'],
      0,
      5,
      'user',
      [],
      { id: 'brand-1' },
      undefined,
      ['package-a']
    );

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

  it('exports plans as csv using streamed records', async function () {
    const firstBatch = [{ redboxOid: '1', metadata: { title: 'One' } }];
    const secondBatch: any[] = [];
    service.recordCol = {
      find: sandbox.stub().onFirstCall().returns({ toArray: sandbox.stub().resolves(firstBatch) }).onSecondCall().returns({
        toArray: sandbox.stub().resolves(secondBatch),
      }),
    };

    const exportStream = service.exportAllPlans('user', [], { id: 'brand-1' }, 'csv', null, null, 'rdmp');
    const chunks: Buffer[] = [];
    for await (const chunk of exportStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks).toString('utf8')).to.include('redboxOid');
  });

  it('exports plans as json and iterates over multiple record pages', async function () {
    const findStub = sandbox.stub();
    findStub.onFirstCall().returns({ toArray: sandbox.stub().resolves([{ redboxOid: '1' }]) });
    findStub.onSecondCall().returns({ toArray: sandbox.stub().resolves([{ redboxOid: '2' }]) });
    findStub.onThirdCall().returns({ toArray: sandbox.stub().resolves([]) });
    service.recordCol = { find: findStub };

    const exportStream = service.exportAllPlans('user', [{ name: 'Admin', branding: 'brand-1' }], { id: 'brand-1' }, 'json', '2025-01-10', '2025-01-01', 'rdmp');
    const chunks: Buffer[] = [];
    for await (const chunk of exportStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const output = Buffer.concat(chunks).toString('utf8');
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
    expect(mockBucket.openUploadStream.calledOnceWith('oid-1/file-1', { metadata: { name: 'doc', redboxOid: 'oid-1' } }))
      .to.be.true;
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
          metaMetadata: { form: 'rdmp' },
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

    await service.addAndRemoveDatastreams('oid-1', [{ fileId: 'new' }], [{ fileId: 'old' }], { getStream: sandbox.stub() });

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
        '>=': new Date('2025-01-01T00:00:00Z'),
        '<=': new Date('2025-01-02T00:00:00Z'),
      },
    });
    expect(query.sort.calledOnce).to.be.true;
    expect(query.skip.calledOnceWith(5)).to.be.true;
    expect(query.limit.calledOnceWith(5)).to.be.true;
  });

  it('counts integration-audit queries using Date criteria objects', async function () {
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
        '>=': new Date('2025-01-01T00:00:00Z'),
        '<=': new Date('2025-01-02T00:00:00Z'),
      },
    });
  });

  it('rejects restoreRecord for empty oids and reports failures', async function () {
    await expectRejects(() => service.restoreRecord(''), 'refusing to search using an empty OID');

    DeletedRecord.findOne.resolves({ deletedRecordMetadata: null });
    const response = await service.restoreRecord('oid-1');

    expect(response.success).to.equal(false);
  });

  it('destroys deleted records and reports validation or persistence failures', async function () {
    await expectRejects(() => service.destroyDeletedRecord(''), 'refusing to search using an empty OID');

    DeletedRecord.destroyOne.rejects(new Error('destroy failed'));
    const response = await service.destroyDeletedRecord('oid-1');

    expect(response.success).to.equal(false);
    expect(response.message).to.equal('destroy failed');
  });

  it('exposes the bucket lookup helper directly', function () {
    const expectedCursor = {};
    mockBucket.find.returns(expectedCursor);

    const result = service.getFileWithName('oid-1/file-1');

    expect(result).to.equal(expectedCursor);
    expect(mockBucket.find.calledOnceWith({ filename: 'oid-1/file-1' }, { limit: 1 })).to.be.true;
  });
});
