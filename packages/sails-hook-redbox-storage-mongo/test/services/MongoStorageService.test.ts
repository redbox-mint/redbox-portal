import type { RecordModel } from '@researchdatabox/redbox-core';
import * as _ from 'lodash';
const { expect } = require('chai');
const sinon = require('sinon');
const { of, firstValueFrom } = require('rxjs');
const { PassThrough, Readable, Writable } = require('node:stream');
const mongodb = require('mongodb');
import { inspect } from 'node:util';

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

function institutionRecord(oid: string, institution: boolean | string): RecordModel {
  const grants = { edit: [], view: [], editRoles: [], viewRoles: [], editPending: [], viewPending: [] };
  return {
    id: oid, redboxOid: oid, harvestId: '', metadata: { institution },
    metaMetadata: { brandId: 'brand-1', createdBy: 'fixture', type: 'rdmp', searchCore: 'default', form: 'rdmp', attachmentFields: [] },
    workflow: { stage: 'draft', stageLabel: 'Draft' },
    authorization: { ...grants, stored: { ...grants } }, dateCreated: '2026-01-01', lastSaveDate: '2026-01-01',
  };
}

describe('MongoStorageService', function () {
  let sandbox: any;
  let owner: any;
  let service: any;
  let collaborators: any;
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

  beforeEach(async function () {
    sandbox = sinon.createSandbox();
    owner = {
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
      createIndex: sandbox.stub().resolves('figshareSyncIntent_pending_readiness_requestedAt'),
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
      tableName: 'recordaudit',
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
    };
    RecordSchemaReference = {
      tableName: 'recordschemareference',
    };

    mockBucket = {
      find: sandbox.stub(),
      delete: sandbox.stub(),
      openUploadStream: sandbox.stub(),
      openDownloadStreamByName: sandbox.stub().returns(new PassThrough()),
    };

    collaborators = {
      log: owner.log,
      translate: sandbox.stub().returns('missing attachment'),
      recordTypes: { get: sandbox.stub() },
      forms: { getFormByName: sandbox.stub().returns(of({ attachmentFields: [] })) },
      disks: { stagingDisk: sandbox.stub(), disk: sandbox.stub() },
      exportMaxRecords: () => owner.config.record.export.maxRecords,
    };

    sandbox.stub(mongodb, 'GridFSBucket').callsFake(function () {
      return mockBucket as any;
    });

    service = new (require('../../src/persistence/PrismaStorage').PrismaStorage)(owner, collaborators);
    service.recordCol = recordCollection;
    service.deletedRecordCol = deletedRecordCollection;
    service.recordIdentityCol = recordIdentityCollection;
    service._requiredIndicesReady = true;
    recordCollection.count = (...args: any[]) => Record.count(...args);
    recordCollection.list = async (criteria: any, options: any = {}) => {
      const query = Record.find(criteria, options);
      const rows = [...((await (query?.meta ? query.meta({ enableExperimentalDeepTargets: true }) : query)) ?? [])];
      rows.sort((a, b) => {
        for (const [key, direction] of Object.entries(options.sort ?? {})) {
          const result = String(_.get(a, key)).localeCompare(String(_.get(b, key)));
          if (result) return result * Number(direction);
        }
        return 0;
      });
      return rows.slice(0, options.limit > 0 ? options.limit : Infinity);
    };
    deletedRecordCollection.list = async (criteria: any, options: any = {}) => {
      const cursor = deletedRecordCollection.find(criteria, options);
      if (options.sort) cursor.sort(options.sort);
      if (options.limit) cursor.limit(options.limit);
      return cursor.toArray();
    };
    // Inject physical read/audit ports for shared-protocol unit tests. The live
    // suite exercises their actual Prisma encoders, plans and stored format.
    service.requireClient = () => ({ orm: { recordaudit: RecordAudit, integrationaudit: IntegrationAudit } });
    service.getMeta = (oid: string) => {
      if (!oid) return Promise.reject(new Error('refusing to search using an empty OID'));
      return Record.findOne({ redboxOid: oid });
    };
    service.getDeletedRecordMeta = async (oid: string) => {
      if (!oid) throw new Error('refusing to search using an empty OID');
      const row = await DeletedRecord.findOne({ redboxOid: oid });
      return row?.deletedRecordMetadata ? { ...row.deletedRecordMetadata, revision: row.revision ?? 0 } : null;
    };
    sandbox.stub(service, 'gridFsDatabase').resolves(mockDb);
    service.gridFsBucket = mockBucket;
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('allows institution services to override an owned operation with an arrow method', async () => {
    const { PrismaStorage }: typeof import('../../src/persistence/PrismaStorage') = require('../../src/persistence/PrismaStorage');
    class InstitutionStorageService extends PrismaStorage {
      getMeta = async (oid: string) => institutionRecord(oid, true);
    }
    const exported = new InstitutionStorageService(owner, collaborators);
    expect(await exported.getMeta('institution-oid')).to.deep.equal(institutionRecord('institution-oid', true));
  });

  it('allows institution services to override an owned operation with an ordinary method', async () => {
    const { PrismaStorage }: typeof import('../../src/persistence/PrismaStorage') = require('../../src/persistence/PrismaStorage');
    class InstitutionStorageService extends PrismaStorage {
      async getMeta(oid: string) {
        return institutionRecord(oid, 'method');
      }
    }
    const exported = new InstitutionStorageService(owner, collaborators);
    expect(await exported.getMeta('institution-oid')).to.deep.equal(institutionRecord('institution-oid', 'method'));
  });

  it('keeps harvest enrichment scoped by tracked brand and record type', async () => {
    const rows = [{ redboxOid: 'opaque', harvestId: 'item' }];
    recordCollection.list = sandbox.stub().resolves(rows);
    expect(await service.findHarvestRecords(['item'], 'data', 'brand')).to.deep.equal(rows);
    expect(recordCollection.list.firstCall.args[0]).to.deep.equal({
      harvestId: { $in: ['item'] },
      'metaMetadata.type': 'data',
      'metaMetadata.brandId': 'brand',
    });
    expect(await service.findHarvestRecords([], 'data', 'brand')).to.deep.equal([]);
    expect(recordCollection.list.calledOnce).to.equal(true);
  });

  it('selects the next update grant after an exclusive authorization cursor through the current-edit ACL join', async function () {
    const digest = 'a'.repeat(64);
    const afterReferenceKey = 'grant:update:' + 'a'.repeat(64);
    const grant = {
      referenceKey: 'grant:update:' + 'b'.repeat(64),
      digest,
      kind: 'grant',
      schemaKind: 'update',
      brand: 'default',
      portal: 'portal',
      recordType: 'dataset',
      operation: 'strict-all',
      oid: 'oid-1',
      createdAt: new Date('2026-08-27T00:00:00.000Z'),
      updatedAt: new Date('2026-08-27T00:00:00.000Z'),
    };
    const list = sandbox.stub().resolves([grant]);
    service.schemaReferenceRepository = () => ({ list });
    recordCollection.findOne.resolves({ redboxOid: 'oid-1' });
    const result = await service.findRecordSchemaGrantForAuthorization({
      digest,
      brand: 'default',
      portal: 'portal',
      schemaKind: 'update',
      recordType: 'dataset',
      operation: 'strict-all',
      recordBrandId: 'brand-1',
      username: 'alice',
      roleNames: ['Researcher'],
      afterReferenceKey,
    });

    expect(result).to.deep.include({ referenceKey: grant.referenceKey, oid: 'oid-1' });
    expect(list.firstCall.args[0].referenceKey).to.deep.equal({ $gt: afterReferenceKey });
    expect(recordCollection.findOne.firstCall.args[0]).to.deep.equal({
      redboxOid: 'oid-1',
      'metaMetadata.brandId': 'brand-1',
      $or: [{ 'authorization.edit': 'alice' }, { 'authorization.editRoles': { $in: ['Researcher'] } }],
    });
  });

  it('selects the next create grant after an exclusive authorization cursor by exact public context', async function () {
    const digest = 'a'.repeat(64);
    const afterReferenceKey = 'grant:create:' + 'a'.repeat(64);
    const grant = {
      referenceKey: 'grant:create:' + 'b'.repeat(64),
      digest,
      kind: 'grant',
      schemaKind: 'create',
      brand: 'default',
      portal: 'portal',
      recordType: 'dataset',
      operation: 'strict-all',
      createdAt: new Date('2026-08-27T00:00:00.000Z'),
      updatedAt: new Date('2026-08-27T00:00:00.000Z'),
    };
    const findOne = sandbox.stub().resolves(grant);
    service.schemaReferenceRepository = () => ({ findOne });

    const result = await service.findRecordSchemaGrantForAuthorization({
      digest,
      brand: 'default',
      portal: 'portal',
      schemaKind: 'create',
      recordType: 'dataset',
      operation: 'strict-all',
      recordBrandId: 'brand-1',
      username: 'alice',
      roleNames: [],
      afterReferenceKey,
    });

    expect(result).to.deep.include({ referenceKey: grant.referenceKey, schemaKind: 'create' });
    expect(
      findOne.calledOnceWithExactly(
        {
          digest,
          kind: 'grant',
          brand: 'default',
          portal: 'portal',
          schemaKind: 'create',
          recordType: 'dataset',
          operation: 'strict-all',
          referenceKey: { $gt: afterReferenceKey },
        },
        {
          sort: { referenceKey: 1 },
        }
      )
    ).to.equal(true);
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
      recordVersion: 999,
      figshareSyncIntent: { pending: false },
    };

    const response = await service.updateMeta(null, 'oid-1', record);
    expect(response.success).to.equal(true);
    const update = recordCollection.findOneAndUpdate.firstCall.args[1];
    expect(update.$set.keep).to.equal(true);
    expect(update.$set).to.not.have.keys(
      'id',
      '_id',
      'redboxOid',
      'revision',
      'dateCreated',
      'recordVersion',
      'figshareSyncIntent'
    );
    expect(update.$set.lastSaveDate).to.be.a('string');
    expect(update.$inc).to.deep.equal({ revision: 1, recordVersion: 1 });
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

  it('bounds failed mutation diagnostics without serializing actor credentials', async function () {
    const secret = 'private-mongo-mutation-provider-credential';
    recordCollection.findOneAndUpdate.rejects(Object.assign(new Error(secret), { credentials: secret }));
    const response = await service.updateMeta({ id: 'brand-1' }, 'oid-1', { metadata: {} }, { username: 'alice', password: secret, token: secret });
    expect(response.success).to.equal(false);
    expect(response.applicationState).to.equal('unknown');
    expect(owner.log.error.called).to.equal(true);
    expect(JSON.stringify(owner.log.error.args)).not.to.include(secret);
  });

  it('returns an unsuccessful response when updateMeta fails', async function () {
    recordCollection.findOneAndUpdate.rejects(new Error('update failed'));

    recordCollection.findOneAndUpdate.rejects(new Error('update failed'));
    const response = await service.updateMeta('brand', 'oid-1', { keep: true }, 'user');

    expect(response.success).to.equal(false);
    expect(response.applicationState).to.equal('unknown');
    expect(String(response.message.message || response.message)).to.include('update failed');
    expect(owner.log.error.calledWithMatch('updateMeta() failed for oid oid-1.')).to.equal(true);
  });

  it('declares concurrency capability only after required indices and typed handles are ready', function () {
    service._requiredIndicesReady = false;
    expect(service.getCapabilities()).to.deep.equal({});
    service._requiredIndicesReady = true;
    expect(service.getCapabilities().recordConcurrency).to.equal(1);

    service.recordCol = undefined;
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
    expect(recordCollection.findOneAndUpdate.firstCall.args[1].$inc).to.deep.equal({ revision: 1, recordVersion: 1 });
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
    expect(recordCollection.findOneAndUpdate.firstCall.args[1].$inc).to.deep.equal({ revision: 1, recordVersion: 1 });
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

  it('refuses mutation before the typed record handle is initialized', async function () {
    service.recordCol = undefined;
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
    const firstService = new ServiceClass(owner, collaborators);
    const secondService = new ServiceClass(owner, collaborators);
    firstService._requiredIndicesReady = true;
    secondService._requiredIndicesReady = true;
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
    collaborators.recordTypes.get.callsFake((_brand: any, recordTypeName: string) =>
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
    collaborators.recordTypes.get.callsFake((_brand: any, recordTypeName: string) =>
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
    collaborators.recordTypes.get.callsFake((_brand: any, recordTypeName: string) =>
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
    owner.log.verbose.resetHistory();

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
    expect(JSON.stringify(owner.log.verbose.args)).not.to.include('must-not-be-logged-or-mutated');
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

  for (const method of ['getRecords', 'getDeletedRecords']) {
    for (const { sort, secondarySort, expected, expectedDeleted } of [
      {
        sort: undefined,
        expected: [
          ['lastSaveDate', -1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.lastSaveDate', -1],
          ['_id', 1],
        ],
      },
      {
        sort: '',
        expected: [
          ['lastSaveDate', -1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.lastSaveDate', -1],
          ['_id', 1],
        ],
      },
      {
        sort: 'metadata.title',
        expected: [
          ['metadata.title', -1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.metadata.title', -1],
          ['_id', 1],
        ],
      },
      {
        sort: 'lastSaveDate:1',
        expected: [
          ['lastSaveDate', 1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.lastSaveDate', 1],
          ['_id', 1],
        ],
      },
      {
        sort: '{"metadata.title":1,"lastSaveDate":-1}',
        expected: [
          ['metadata.title', 1],
          ['lastSaveDate', -1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.metadata.title', 1],
          ['deletedRecordMetadata.lastSaveDate', -1],
          ['_id', 1],
        ],
      },
      {
        sort: '[["metadata.title",1],["lastSaveDate",-1]]',
        expected: [
          ['metadata.title', 1],
          ['lastSaveDate', -1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.metadata.title', 1],
          ['deletedRecordMetadata.lastSaveDate', -1],
          ['_id', 1],
        ],
      },
      {
        sort: 'lastSaveDate:1',
        secondarySort: 'redboxOid:-1',
        expected: [
          ['lastSaveDate', 1],
          ['redboxOid', -1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.lastSaveDate', 1],
          ['redboxOid', -1],
          ['_id', 1],
        ],
      },
      { sort: '{"_id":-1}', expected: [['_id', -1]] },
      {
        sort: 'lastSaveDate:1',
        secondarySort: '_id:-1',
        expected: [
          ['lastSaveDate', 1],
          ['_id', -1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.lastSaveDate', 1],
          ['_id', -1],
        ],
      },
      { sort: '{}', expected: [['_id', 1]] },
      { sort: '[]', expected: [['_id', 1]] },
      {
        sort: '{"metadata.title":"ASC","lastSaveDate":"descending"}',
        expected: [
          ['metadata.title', 1],
          ['lastSaveDate', -1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.metadata.title', 1],
          ['deletedRecordMetadata.lastSaveDate', -1],
          ['_id', 1],
        ],
      },
      {
        sort: '[["lastSaveDate","-1"],["redboxOid","1"]]',
        expected: [
          ['lastSaveDate', -1],
          ['redboxOid', 1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.lastSaveDate', -1],
          ['redboxOid', 1],
          ['_id', 1],
        ],
      },
      {
        sort: 'lastSaveDate:ascending',
        secondarySort: 'redboxOid:desc',
        expected: [
          ['lastSaveDate', 1],
          ['redboxOid', -1],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.lastSaveDate', 1],
          ['redboxOid', -1],
          ['_id', 1],
        ],
      },
      {
        sort: '{"score":{"$meta":"textScore"}}',
        expected: [
          ['score', { $meta: 'textScore' }],
          ['_id', 1],
        ],
        expectedDeleted: [
          ['deletedRecordMetadata.score', { $meta: 'textScore' }],
          ['_id', 1],
        ],
      },
    ]) {
      it(`${method} keeps requested sort precedence and breaks ties for ${sort}, ${secondarySort}`, async function () {
        const queryMethod = method === 'getRecords' ? 'runRecordQuery' : 'runDeletedRecordQuery';
        const runStub = sandbox.stub(service, queryMethod).resolves({ items: [], totalItems: 0 });

        await service[method](
          'draft',
          ['rdmp'],
          20,
          20,
          'user',
          [],
          { id: 'brand-1' },
          undefined,
          undefined,
          sort,
          undefined,
          undefined,
          undefined,
          secondarySort
        );

        const options = runStub.firstCall.args[2];
        expect(options).to.include({ skip: 20, limit: 20 });
        expect(Object.entries(options.sort)).to.deep.equal(
          method === 'getDeletedRecords' ? (expectedDeleted ?? expected) : expected
        );
      });
    }

    for (const sort of [
      'null',
      'true',
      'false',
      '1',
      '"lastSaveDate"',
      '[null]',
      '[1]',
      '[{}]',
      '["lastSaveDate"]',
      '[[null,1]]',
      '[["lastSaveDate"]]',
      '[["lastSaveDate",1,2]]',
      '[["",1]]',
    ]) {
      it(`${method} rejects invalid JSON sort ${sort} as a client validation error`, async function () {
        const queryMethod = method === 'getRecords' ? 'runRecordQuery' : 'runDeletedRecordQuery';
        const runStub = sandbox.stub(service, queryMethod);
        let failure: unknown;
        try {
          await service[method]('draft', ['rdmp'], 0, 20, 'user', [], { id: 'brand-1' }, undefined, undefined, sort);
        } catch (error) {
          failure = error;
        }
        expect(failure).to.have.property('name', 'RBValidationError');
        expect(failure).to.have.nested.property('displayErrors[0].status', '400');
        expect(runStub.notCalled).to.be.true;
      });
    }

    const invalidDirections = [null, true, false, {}, [], [1], 'up', '', 0, 2, { $meta: 1 }];
    const invalidSorts = invalidDirections.flatMap(direction => [
      { sort: JSON.stringify({ lastSaveDate: direction }), secondarySort: undefined },
      { sort: JSON.stringify([['lastSaveDate', direction]]), secondarySort: undefined },
    ]);
    invalidSorts.push(
      ...[
        'lastSaveDate:up',
        'lastSaveDate:0',
        'lastSaveDate:',
        'lastSaveDate:NaN',
        ':asc',
        'field:desc:extra',
        'field:asc:extra',
      ].flatMap(sort => [
        { sort, secondarySort: undefined },
        { sort: 'lastSaveDate:-1', secondarySort: sort },
      ])
    );
    invalidSorts.push({ sort: 'lastSaveDate:-1', secondarySort: 'field' });
    for (const { sort, secondarySort } of invalidSorts) {
      it(`${method} rejects invalid sort syntax or directions in ${sort}, ${secondarySort}`, async function () {
        const queryMethod = method === 'getRecords' ? 'runRecordQuery' : 'runDeletedRecordQuery';
        const runStub = sandbox.stub(service, queryMethod);
        let failure: unknown;
        try {
          await service[method](
            'draft',
            ['rdmp'],
            0,
            20,
            'user',
            [],
            { id: 'brand-1' },
            undefined,
            undefined,
            sort,
            undefined,
            undefined,
            undefined,
            secondarySort
          );
        } catch (error) {
          failure = error;
        }
        expect(failure).to.have.property('name', 'RBValidationError');
        expect(failure).to.have.nested.property('displayErrors[0].status', '400');
        expect(runStub.notCalled).to.be.true;
      });
    }
  }

  for (const [field, storedField] of [
    ['title', 'deletedRecordMetadata.metadata.title'],
    ['dateCreatedDisplay', 'deletedRecordMetadata.dateCreated'],
    ['dateModifiedDisplay', 'deletedRecordMetadata.lastSaveDate'],
    ['dateDeletedDisplay', 'dateDeleted'],
  ]) {
    for (const direction of [1, -1]) {
      it(`sorts the deleted-record ${field} column in direction ${direction}`, async function () {
        const runStub = sandbox.stub(service, 'runDeletedRecordQuery').resolves({ items: [], totalItems: 0 });
        await service.getDeletedRecords(
          undefined,
          undefined,
          0,
          20,
          'user',
          [],
          { id: 'brand-1' },
          undefined,
          undefined,
          `${field}:${direction}`
        );
        expect(Object.entries(runStub.firstCall.args[2].sort)).to.deep.equal([
          [storedField, direction],
          ['_id', 1],
        ]);
      });
    }
  }

  it('maps deleted-record aliases in JSON and secondary sorts', async function () {
    const runStub = sandbox.stub(service, 'runDeletedRecordQuery').resolves({ items: [], totalItems: 0 });
    await service.getDeletedRecords(
      undefined,
      undefined,
      0,
      20,
      'user',
      [],
      { id: 'brand-1' },
      undefined,
      undefined,
      '{"title":1}',
      undefined,
      undefined,
      undefined,
      'dateDeletedDisplay:-1'
    );
    expect(Object.entries(runStub.firstCall.args[2].sort)).to.deep.equal([
      ['deletedRecordMetadata.metadata.title', 1],
      ['dateDeleted', -1],
      ['_id', 1],
    ]);
  });

  it('keeps deleted-record fields and already qualified record fields at their requested paths', async function () {
    const runStub = sandbox.stub(service, 'runDeletedRecordQuery').resolves({ items: [], totalItems: 0 });
    await service.getDeletedRecords(
      'draft',
      ['rdmp'],
      0,
      20,
      'user',
      [],
      { id: 'brand-1' },
      undefined,
      undefined,
      '{"dateDeleted":-1,"redboxOid":1,"deletedRecordMetadata.dateCreated":1,"_id":-1}',
      undefined,
      undefined,
      undefined,
      'metadata.title:1'
    );
    expect(Object.entries(runStub.firstCall.args[2].sort)).to.deep.equal([
      ['dateDeleted', -1],
      ['redboxOid', 1],
      ['deletedRecordMetadata.dateCreated', 1],
      ['_id', -1],
      ['deletedRecordMetadata.metadata.title', 1],
    ]);
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
    expect(options.sort['deletedRecordMetadata.lastSaveDate']).to.equal(1);
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
    expect(`${query.$and[1]['metadata.title']}`).to.include('a\\+b');
    expect(query['metaMetadata.brandId']).to.equal('brand-1');
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
    expect(query.$and[1]['metadata.title']).to.equal('Exact title');
    expect(query['metaMetadata.brandId']).to.equal('brand-1');
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
      list: sandbox.stub().resolves(['record']),
      count: sandbox.stub().resolves(1),
    };
    service.deletedRecordCol = {
      list: sandbox.stub().resolves(['deleted']),
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
  const pagedList = (batch: any[]) =>
    sandbox.stub().callsFake(async (_query: any, opts: any) => ((opts.skip ?? 0) === 0 ? batch : []));

  const pagedListPages = (pagesBySkip: Record<number, any[]>) =>
    sandbox.stub().callsFake(async (_query: any, opts: any) => pagesBySkip[opts.skip ?? 0] ?? []);

  it('exports plans as UTF-8 BOM csv using streamed records', async function () {
    service.recordCol = { list: pagedList([{ redboxOid: '1', metadata: { title: 'Waldenström' } }]) };

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
    expect(service.recordCol.list.callCount).to.equal(4);
    for (const call of service.recordCol.list.getCalls()) {
      expect(Object.entries(call.args[1].sort)).to.deep.equal([
        ['lastSaveDate', -1],
        ['_id', 1],
      ]);
    }
  });

  it('sanitizes formula-prefixed values after nested records are flattened', async function () {
    service.recordCol = {
      list: pagedList([
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
      list: pagedListPages({
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
    expect(service.recordCol.list.callCount).to.equal(6);
  });

  it('produces an empty csv and skips the second pass when there are no records', async function () {
    service.recordCol = { list: pagedList([]) };

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
    expect(service.recordCol.list.callCount).to.equal(1);
  });

  it('stops collecting csv fields once the export has been cancelled', async function () {
    // Each page holds one record; cancellation is signalled after the first record is seen.
    const listStub = sandbox.stub();
    listStub.onFirstCall().resolves([{ redboxOid: '1', metadata: { title: 'One' } }]);
    listStub.onSecondCall().resolves([{ redboxOid: '2', metadata: { extraField: 'present' } }]);
    // A third page is never requested; if it were, this unstubbed call would throw and fail the test.
    service.recordCol = { list: listStub };

    let scanned = 0;
    const isCancelled = () => scanned++ >= 1;
    const fields = await service.collectCsvFields({}, { limit: 1 }, isCancelled);

    // The loop bails out before the second record's columns are collected, so the scan stops short
    // instead of reading every matching record.
    expect(fields).to.include('redboxOid');
    expect(fields).to.not.include('metadata.extraField');
    expect(listStub.callCount).to.equal(2);
  });

  it('errors the export stream when the csv query fails', async function () {
    service.recordCol = {
      list: sandbox.stub().rejects(new Error('mongo query failed')),
    };

    const exportStream = service.exportAllPlans('user', [], { id: 'brand-1' }, 'csv', null, null, 'rdmp');
    await expectRejects(async () => {
      for await (const _chunk of exportStream) {
        // drain
      }
    }, 'mongo query failed');
  });

  it('exports plans as json and iterates over multiple record pages', async function () {
    const listStub = sandbox.stub();
    listStub.onFirstCall().resolves([{ redboxOid: '1' }]);
    listStub.onSecondCall().resolves([{ redboxOid: '2' }]);
    listStub.onThirdCall().resolves([]);
    service.recordCol = { list: listStub };

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
    expect(listStub.callCount).to.equal(3);
    for (const call of listStub.getCalls()) {
      expect(Object.entries(call.args[1].sort)).to.deep.equal([
        ['lastSaveDate', -1],
        ['_id', 1],
      ]);
    }
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
    collaborators.disks.stagingDisk.returns(stagingDisk);
    const chunks: Buffer[] = [];
    const bucketStream = new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    }) as any;
    bucketStream.chunkSizeBytes = 255 * 1024;
    bucketStream.gridFSFile = { _id: 'grid-file' };
    mockBucket.openUploadStream.returns(bucketStream);

    await service.addDatastream('oid-1', { fileId: 'file-1', metadata: { name: 'doc' } });

    expect(Buffer.concat(chunks).toString()).to.equal('hello');
    expect(stagingDisk.getStream.calledOnceWith('file-1')).to.be.true;
    expect(
      mockBucket.openUploadStream.calledOnceWith('oid-1/file-1', { metadata: { name: 'doc', redboxOid: 'oid-1' } })
    ).to.be.true;
  });

  it('uses a named disk and computes attachment add/remove requests in updateDatastream', async function () {
    const disk = { getStream: sandbox.stub() };
    collaborators.disks.disk.returns(disk);
    const addAndRemoveStub = sandbox.stub(service, 'addAndRemoveDatastreams').resolves({ ok: true });
    collaborators.forms.getFormByName.returns(of({ configuration: { attachmentFields: ['files'] } }));

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

    expect(collaborators.disks.disk.calledOnceWith('staging')).to.be.true;
    expect(collaborators.forms.getFormByName.calledOnceWith('rdmp', true, 'brand-1')).to.be.true;
    await Promise.all(result);
    expect(addAndRemoveStub.calledOnce).to.be.true;
    expect(addAndRemoveStub.firstCall.args[1][0].fileId).to.equal('new');
    expect(addAndRemoveStub.firstCall.args[2][0].fileId).to.equal('old');
  });

  it('returns a dummy request when updateDatastream finds no attachment fields', async function () {
    collaborators.forms.getFormByName.returns(of({ attachmentFields: [] }));
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
    const addStub = sandbox.stub(service, 'addDatastreamInternal').resolves(undefined);
    const removeStub = sandbox.stub(service, 'removeDatastreamInternal').resolves(undefined);

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

    expect(owner.log.verbose.called).to.be.true;
  });

  it('logs delete callback errors when removing a datastream', async function () {
    sandbox.stub(service as any, 'getFileWithName').returns({
      toArray: sandbox.stub().resolves([{ _id: 'grid-file' }]),
    });
    mockBucket.delete.callsFake((id, cb) => cb(new Error('delete failed')));

    await service.removeDatastream('oid-1', { fileId: 'file-1' });

    expect(owner.log.error.called).to.be.true;
  });

  it('refuses foreign cancelled staging rather than trusting the journal file id', async function () {
    const disk = {
      exists: sandbox.stub().resolves(true),
      get: sandbox.stub().resolves(JSON.stringify({ id: 'file-1', size: 9, offset: 3,
        metadata: { redboxActor: 'other-actor', redboxBrand: 'other-brand', redboxRecord: 'other-record' } })),
      delete: sandbox.stub().resolves(), deleteAll: sandbox.stub().resolves(),
    };
    collaborators.disks.stagingDisk.returns(disk);
    await expectRejects(
      () => service.removeStagedDatastream('file-1', { oid: 'record', actorId: 'actor', brandId: 'brand' }),
      'Staged attachment ownership does not match the actor, brand and record'
    );
    expect(disk.delete.called).to.equal(false);
    expect(disk.deleteAll.called).to.equal(false);
  });

  it('rejects path-shaped staging cleanup identities before accessing storage', async function () {
    await expectRejects(
      () => service.removeStagedDatastream('../../outside-staging'),
      'Invalid staged attachment identity.'
    );

    expect(collaborators.disks.stagingDisk.notCalled).to.be.true;
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

    expect(result.readstream).to.equal(mockBucket.openDownloadStreamByName.firstCall.returnValue);
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
    expect(RecordAudit.create.calledOnceWithMatch({ redboxOid: 'oid-1', action: 'save', record: { safe: true } })).to.be
      .true;
  });

  it('preserves event time when the queue persists an audit later', async function () {
    const occurredAt = '2026-03-01T12:00:00Z';
    await service.createRecordAudit({ redboxOid: 'oid-1', action: 'updated', occurredAt, record: {} });
    expect(RecordAudit.create.firstCall.args[0].occurredAt).to.equal(occurredAt);
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
    expect(response.message).to.equal('Audit append has an unknown outcome. Reconcile before retrying.');
    expect(RecordAudit.create.calledOnceWithMatch({ redboxOid: 'oid-1', action: 'save' })).to.be.true;
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

  it('scopes record audit reads and validates an empty OID', async () => {
    const all = sandbox.stub().returns({ toArray: async () => [] });
    const where = sandbox.stub().returns({ all });
    RecordAudit.where = where;
    const from = new Date('2025-01-01T00:00:00Z');
    await service.getRecordAudit({ oid: 'oid-1', dateFrom: from });
    expect(where.firstCall.args[0]).to.deep.equal(
      require('@researchdatabox/redbox-core').prismaModelFilter({
        redboxOid: 'oid-1',
        createdAt: { $gte: from.toISOString() },
      })
    );
    await expectRejects(() => service.getRecordAudit({ oid: '' }), 'require an OID');
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
    expect(IntegrationAudit.create.firstCall.args[0].requestSummary).to.equal(null);
  });

  it('scopes and pages integration audit reads with ISO bounds', async () => {
    const query = {
      orderBy: sandbox.stub().returnsThis(),
      offset: sandbox.stub().returnsThis(),
      limit: sandbox.stub().returnsThis(),
      all: () => ({ toArray: async () => [] }),
    };
    const where = sandbox.stub().returns(query);
    IntegrationAudit.where = where;
    const from = new Date('2025-01-01T00:00:00Z');
    await service.getIntegrationAudit({ oid: 'oid-1', status: 'failed', dateFrom: from, page: 2, pageSize: 5 });
    expect(where.firstCall.args[0]).to.deep.equal(
      require('@researchdatabox/redbox-core').prismaModelFilter({
        redboxOid: 'oid-1',
        status: 'failed',
        startedAt: { $gte: from.toISOString() },
      })
    );
    expect(query.offset.calledOnceWith(5)).to.equal(true);
    expect(query.limit.calledOnceWith(5)).to.equal(true);
  });
  it('uses the same scoped count predicate without a payload read', async () => {
    const match = sandbox.stub().returns({ count: () => ({ build: () => ({}) }) });
    const client = {
      query: { from: sandbox.stub().returns({ match }) },
      runtime: async () => ({ query: () => ({ toArray: async () => [{ total: 4 }] }) }),
    };
    service.requireClient = () => client;
    expect(await service.countIntegrationAudit({ oid: 'oid-1', status: 'failed' })).to.equal(4);
    expect(match.firstCall.args[0]).to.deep.equal(
      require('@researchdatabox/redbox-core').prismaModelFilter({ redboxOid: 'oid-1', status: 'failed' })
    );
  });

  for (const [method, modelName] of [
    ['createRecordAudit', 'RecordAudit'],
    ['createIntegrationAudit', 'IntegrationAudit'],
  ]) {
    it(`bounds ${method} native failures in responses and logs`, async function () {
      const failure = Object.assign(new Error('private-native-audit'), {
        code: 121,
        errInfo: { document: 'private-native-audit-document' },
        cause: new Error('private-native-audit-credentials'),
      });
      (({ RecordAudit, IntegrationAudit }) as any)[modelName].create.rejects(failure);
      const response = await service[method]({ redboxOid: 'audit-oid', action: 'save' });
      expect(response.success).to.equal(false);
      expect(response.message).to.include('unknown outcome');
      expect(inspect({ response, logs: owner.log.error.args }, { depth: 10 })).not.to.include('private-native-audit');
      expect(inspect(response)).not.to.include('private-native-audit');
    });
  }

  for (const method of ['getRecords', 'getDeletedRecords']) {
    it(`preserves invalid sort validation through the deployed ${method} guard`, async () => {
      const runtime = require('@researchdatabox/redbox-core');
      const { guardPrismaStorage } = require('../../src/persistence/PrismaStorage');
      await runtime.initializePersistence(owner);
      const queryMethod = method === 'getRecords' ? 'runRecordQuery' : 'runDeletedRecordQuery';
      const run = sandbox.stub(service, queryMethod);
      const guarded = guardPrismaStorage(owner, service);
      try {
        const failure = await guarded[method](
          'draft', ['rdmp'], 0, 20, 'user', [], { id: 'brand-1' }, undefined, undefined, 'title:sideways'
        ).then(() => undefined, (error: unknown) => error);
        expect(failure).to.be.instanceOf(runtime.RBValidationError);
        expect(failure).to.have.property('message', 'Invalid record sort direction');
        expect(failure).to.have.nested.property('displayErrors[0].status', '400');
        expect(run.notCalled).to.equal(true);
      } finally {
        await runtime.cleanupPersistence(owner);
      }
    });
  }

  it('bounds audit read errors at the deployed storage boundary', async () => {
    const { PersistenceError } = require('@researchdatabox/redbox-core');
    const { guardPrismaStorage } = require('../../src/persistence/PrismaStorage');
    const runtime = require('@researchdatabox/redbox-core');
    await runtime.initializePersistence(owner);
    const guarded = guardPrismaStorage(owner, service);
    RecordAudit.where = () => {
      throw new Error('private-audit-read');
    };
    IntegrationAudit.where = RecordAudit.where;
    service.countIntegrationAudit = async () => {
      throw new Error('private-audit-read');
    };
    for (const method of ['getRecordAudit', 'getIntegrationAudit']) {
      const rejection = await guarded[method]({ oid: 'private-query-oid' }).then(
        () => undefined,
        (error: unknown) => error
      );
      expect(rejection).to.be.instanceOf(PersistenceError).with.property('code', 'storage-read');
      expect(inspect(rejection, { depth: 10 })).not.to.include('private-');
    }
    await runtime.cleanupPersistence(owner);
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
