let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import { createHash } from 'node:crypto';

import { ObjectId } from 'mongodb';
import { of } from 'rxjs';
import * as sinon from 'sinon';

import { createRecordSaveContext, isRecordSaveContext, type RecordSaveContext } from '../../src/RecordSaveResponse';
import { FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES } from '../../src/RecordStorageConcurrency';
import { serializeRedboxCanonicalJsonV1 } from '../../src/record-contract/canonical-json';
import type {
  PersistRecordSchemaSaveUsageRequest,
  PersistRecordSchemaSaveUsageResult,
} from '../../src/services/RecordSchemaService';
import type { RecordValidationRequest, RecordValidationResult } from '../../src/services/RecordValidationService';
import { buildResolvedRecordValidationResult } from '../fixtures/record-validation.fixtures';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

type QueryLike = {
  sort: sinon.SinonStub;
  skip: sinon.SinonStub;
  limit: sinon.SinonStub;
  meta: sinon.SinonStub;
  then: (onFulfilled: (value: unknown) => unknown) => Promise<unknown>;
};

function createChainableQuery(result: unknown): QueryLike {
  const query = {
    sort: sinon.stub().returnsThis(),
    skip: sinon.stub().returnsThis(),
    limit: sinon.stub().returnsThis(),
    meta: sinon.stub().returnsThis(),
    then(onFulfilled: (value: unknown) => unknown) {
      return Promise.resolve(onFulfilled(result));
    },
  } as QueryLike;
  return query;
}

function harvestSaveContext(): RecordSaveContext {
  return createRecordSaveContext({
    routeFamily: 'api',
    operation: 'create',
    portal: 'tenant-portal',
  });
}

function recordedSchemaUsageResult(
  request: PersistRecordSchemaSaveUsageRequest
): Extract<PersistRecordSchemaSaveUsageResult, { readonly kind: 'recorded' }> {
  const referenceIdentity = {
    digest: request.digest,
    brand: request.brand,
    portal: request.portal,
    schemaKind: request.schemaKind,
    recordType: request.recordType,
    operation: request.operation,
    oid: request.oid,
    kind: 'save',
    saveIdentity: request.saveIdentity,
  } as const;
  return {
    kind: 'recorded',
    reference: {
      digest: request.digest,
      referenceKey: `save:${createHash('sha256')
        .update(serializeRedboxCanonicalJsonV1(referenceIdentity), 'utf8')
        .digest('hex')}`,
    },
  };
}

function recordValidationResult(
  request: RecordValidationRequest,
  blockingErrors: readonly {
    message: string;
    field: string;
    class: string;
  }[] = [],
  mode: 'shadow' | 'enforce' = 'shadow'
): RecordValidationResult {
  return buildResolvedRecordValidationResult(request, {
    shouldBlock: mode === 'enforce' && blockingErrors.length > 0,
    mode,
    blockingErrors,
  });
}

describe('HarvestRunService', function () {
  let HarvestRunServiceClass: any;
  let service: any;
  let originalRecord: any;
  let originalHarvestRun: any;
  let originalHarvestRunChunk: any;
  let originalHarvestRecordEvent: any;
  let originalRecordTypesService: any;
  let mockSails: any;
  let recordsService: {
    create: sinon.SinonStub;
    getMeta: sinon.SinonStub;
    updateMetaInternal: sinon.SinonStub;
    delete: sinon.SinonStub;
    restoreRecord: sinon.SinonStub;
    setWorkflowStepRelatedMetadata: sinon.SinonStub;
  };

  beforeEach(function () {
    originalRecord = (global as any).Record;
    originalHarvestRun = (global as any).HarvestRun;
    originalHarvestRunChunk = (global as any).HarvestRunChunk;
    originalHarvestRecordEvent = (global as any).HarvestRecordEvent;
    originalRecordTypesService = (global as any).RecordTypesService;

    recordsService = {
      create: sinon.stub(),
      getMeta: sinon.stub(),
      updateMetaInternal: sinon.stub(),
      delete: sinon.stub(),
      restoreRecord: sinon.stub(),
      setWorkflowStepRelatedMetadata: sinon.stub(),
    };

    mockSails = createMockSails({
      services: {
        recordsservice: recordsService,
      },
    });
    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = recordsService;

    (global as any).HarvestRun = {
      findOne: sinon.stub(),
      create: sinon.stub(),
      updateOne: sinon.stub(),
      find: sinon.stub(),
      count: sinon.stub(),
      getDatastore: sinon.stub().returns(null),
    };
    (global as any).HarvestRunChunk = {
      findOne: sinon.stub(),
      create: sinon.stub(),
      updateOne: sinon.stub(),
      find: sinon.stub(),
      count: sinon.stub(),
    };
    (global as any).HarvestRecordEvent = {
      create: sinon.stub(),
      createEach: sinon.stub(),
      find: sinon.stub(),
      count: sinon.stub(),
    };
    (global as any).Record = {
      find: sinon.stub(),
    };
    (global as any).WorkflowStepsService = {
      get: sinon.stub(),
    };

    const module = require('../../src/services/HarvestRunService');
    HarvestRunServiceClass = module.Services.HarvestRunService;
    service = new HarvestRunServiceClass();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    (global as any).Record = originalRecord;
    (global as any).HarvestRun = originalHarvestRun;
    (global as any).HarvestRunChunk = originalHarvestRunChunk;
    (global as any).HarvestRecordEvent = originalHarvestRecordEvent;
    if (originalRecordTypesService === undefined) {
      delete (global as any).RecordTypesService;
    } else {
      (global as any).RecordTypesService = originalRecordTypesService;
    }
    delete (global as any).WorkflowStepsService;
    delete (global as any).FormsService;
    delete (global as any).RolesService;
    delete (global as any).UsersService;
    delete (global as any).RecordValidationService;
    delete (global as any).TranslationService;
    delete (global as any).BrandingService;
    delete (global as any).RedboxJavaStorageService;
    delete (global as any).SolrSearchService;
    sinon.restore();
  });

  function useRealRecordsService(recordSchemaEnabled: boolean) {
    const persistedRecords = new Map<string, any>();
    const storageService = {
      create: sinon.stub().callsFake(async (_brand: unknown, candidate: any) => {
        const committedRevision = 0;
        const committedRecord = { ...structuredClone(candidate), revision: committedRevision };
        persistedRecords.set(candidate.redboxOid, committedRecord);
        return { success: true, applicationState: 'applied', committedRevision, committedRecord };
      }),
      updateMeta: sinon.stub().callsFake(async (_brand: unknown, oid: string, candidate: any) => {
        const committedRevision = candidate.revision + 1;
        const committedRecord = { ...structuredClone(candidate), revision: committedRevision };
        persistedRecords.set(oid, committedRecord);
        return { success: true, applicationState: 'applied', oid, committedRevision, committedRecord };
      }),
      getMeta: sinon.stub().callsFake(async (oid: string) => structuredClone(persistedRecords.get(oid))),
      createRecordAudit: sinon.stub().resolves({ success: true }),
      getCapabilities: sinon.stub().returns({
        recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
      }),
    };
    const schemaResolver: {
      resolveCreate: sinon.SinonStub;
      resolveUpdate?: sinon.SinonStub;
      validateResolvedArtifact: sinon.SinonStub;
      persistSaveUsageReference: sinon.SinonStub<
        [request: PersistRecordSchemaSaveUsageRequest],
        Promise<PersistRecordSchemaSaveUsageResult>
      >;
    } = {
      resolveCreate: sinon.stub().rejects(new Error('authorization must run before schema resolution')),
      validateResolvedArtifact: sinon.stub(),
      persistSaveUsageReference: sinon
        .stub<[request: PersistRecordSchemaSaveUsageRequest], Promise<PersistRecordSchemaSaveUsageResult>>()
        .callsFake(async request => recordedSchemaUsageResult(request)),
    };
    const workflowStep = {
      name: 'draft',
      config: {
        form: 'default-form',
        workflow: { stage: 'draft' },
        authorization: {
          viewRoles: [],
          editRoles: ['HarvestEditor'],
          transitionRoles: [],
        },
      },
    };

    mockSails.config.recordSchema = { enabled: recordSchemaEnabled };
    mockSails.config.recordValidation = { mode: 'shadow' };
    mockSails.config.record = {
      auditing: { enabled: false, recordAuditJobName: 'RecordAudit' },
    };
    mockSails.config.jsonld = { addJsonLdContext: false, contexts: {} };
    mockSails.services.recordschemaservice = schemaResolver;
    (global as any).WorkflowStepsService = {
      getFirst: sinon.stub().returns(of(workflowStep)),
      get: sinon.stub().returns(of(workflowStep)),
    };
    (global as any).FormsService = {
      getForm: sinon.stub().resolves({ name: 'default-form', attachmentFields: [] }),
      getFormByName: sinon.stub().returns(of({ name: 'default-form', attachmentFields: [] })),
    };
    (global as any).RolesService = {
      getRole: sinon.stub().callsFake((_brand: unknown, name: string) => ({ id: `role-${name}` })),
    };
    (global as any).UsersService = {
      getUserWithUsername: sinon.stub().returns(of(null)),
    };
    const recordValidationService: {
      resolve: sinon.SinonStub<[request: RecordValidationRequest], Promise<RecordValidationResult>>;
    } = {
      resolve: sinon
        .stub<[request: RecordValidationRequest], Promise<RecordValidationResult>>()
        .callsFake(async request => recordValidationResult(request)),
    };
    (global as any).RecordValidationService = recordValidationService;
    mockSails.services.recordvalidationservice = recordValidationService;
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key),
    };
    (global as any).BrandingService = {
      getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).RedboxJavaStorageService = storageService;
    (global as any).SolrSearchService = { index: sinon.stub() };

    const recordsModule = require('../../src/services/RecordsService');
    const realRecordsService = new recordsModule.Services.Records();
    realRecordsService.storageService = storageService;
    realRecordsService.searchService = { index: sinon.stub() };
    realRecordsService.queueService = { now: sinon.stub() };
    realRecordsService.datastreamService = {};
    (global as any).RecordsService = realRecordsService;
    mockSails.services.recordsservice = realRecordsService;

    return {
      persistedRecords,
      realRecordsService,
      recordValidationService,
      schemaResolver,
      storageService,
    };
  }

  function configureTrackedCreateChunk() {
    const run = {
      id: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceName: 'source-a',
      sourceRunId: 'source-run-1',
      status: 'running',
      startedAt: '2026-05-25T00:00:00.000Z',
      totalProcessed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 0,
      duplicateChunks: 0,
    };
    const chunk = {
      id: 'chunk-1',
      runId: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceRunId: 'source-run-1',
      contentHash: 'hash-1',
      attempt: 1,
      status: 'processing',
      recordCount: 2,
      totalProcessed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      duplicate: false,
      submittedAt: '2026-05-25T00:00:00.000Z',
    };

    (global as any).HarvestRun.findOne.resolves(null);
    (global as any).HarvestRun.create.returns({ fetch: sinon.stub().resolves(run) });
    (global as any).HarvestRunChunk.find.returns(createChainableQuery([]));
    (global as any).HarvestRunChunk.create.returns({ fetch: sinon.stub().resolves(chunk) });
    (global as any).HarvestRunChunk.updateOne.callsFake(() => ({
      set: sinon.stub().callsFake(async (updates: any) => ({ ...chunk, ...updates })),
    }));
    (global as any).HarvestRun.updateOne.callsFake(() => ({
      set: sinon.stub().callsFake(async (updates: any) => ({ ...run, ...updates })),
    }));
    (global as any).HarvestRecordEvent.createEach.callsFake(async (events: any[]) => events);
  }

  function rejectNonArrayTagUpdates(schemaResolver: {
    resolveUpdate?: sinon.SinonStub;
    validateResolvedArtifact: sinon.SinonStub;
  }): sinon.SinonStub {
    const resolveUpdate = sinon.stub().resolves({
      kind: 'resolved',
      document: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `/brand-1/tenant-portal/api/records/schemas/${'b'.repeat(64)}`,
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
      },
      digest: 'b'.repeat(64),
      grant: {},
      metadata: {
        schemaKind: 'update',
        contractFormat: 'redbox-record-contract/1',
        completeness: 'complete',
        byteLength: 128,
        etag: `"sha256:${'b'.repeat(64)}"`,
        context: {
          brand: 'brand-1',
          portal: 'tenant-portal',
          kind: 'update',
          recordType: 'dataset',
          workflowStep: 'draft',
          form: 'default-form',
          operation: 'strict-all',
          unknownProperties: 'allow',
          enforcement: 'enforce',
        },
      },
    });
    schemaResolver.resolveUpdate = resolveUpdate;
    schemaResolver.validateResolvedArtifact.callsFake((request: { input?: { tags?: unknown } }) => {
      const valid = Array.isArray(request.input?.tags);
      return {
        kind: 'validated',
        valid,
        issues: valid ? [] : [{ code: 'record-schema.type', pointer: '/tags', expected: { type: 'array' } }],
        truncated: false,
      };
    });
    return resolveUpdate;
  }

  it('threads authoritative contexts through compatibility and legacy creates in shadow and enforce', async function () {
    mockSails.config.recordSchema = { enabled: true };
    (global as any).Record.find.returns({ meta: sinon.stub().resolves([]) });
    recordsService.create.resolves({
      oid: 'record-1',
      message: 'Created',
      wasPersisted: () => true,
    });
    const submissions = [
      () =>
        service.submitCompatibilityRecords(
          { id: 'brand-1', name: 'default' },
          { name: 'dataset' },
          { records: [{ harvestId: 'harvest-1', recordRequest: { metadata: { title: 'Test' } } }] },
          'override',
          { username: 'tester' },
          harvestSaveContext()
        ),
      () =>
        service.submitLegacyRecords(
          { id: 'brand-1', name: 'default' },
          { name: 'dataset' },
          { records: [{ harvest_id: 'harvest-1', metadata: { data: { title: 'Test' } } }] },
          false,
          { username: 'tester' },
          harvestSaveContext()
        ),
    ];

    for (const mode of ['shadow', 'enforce'] as const) {
      mockSails.config.recordValidation = { mode };
      for (const submit of submissions) {
        recordsService.create.resetHistory();

        const response = await submit();

        expect(response[0].status, mode).to.equal(true);
        expect(recordsService.create.calledOnce, mode).to.equal(true);
        const context = recordsService.create.firstCall.args[7];
        expect(isRecordSaveContext(context), mode).to.equal(true);
        expect(context).to.include({
          routeFamily: 'api',
          operation: 'create',
          portal: 'tenant-portal',
        });
      }
    }
  });

  it('supports legacy harvest arities while schemas are disabled and supplies operation-only save contexts', async function () {
    mockSails.config.recordSchema = { enabled: false };
    (global as any).Record.find.returns({ meta: sinon.stub().resolves([]) });
    recordsService.create.resolves({
      oid: 'record-1',
      message: 'Created',
      wasPersisted: () => true,
    });

    const compatibility = await service.submitCompatibilityRecords(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      { records: [{ harvestId: 'compat-1', recordRequest: { metadata: { title: 'Compatibility' } } }] },
      'override',
      { username: 'tester' }
    );
    const legacy = await service.submitLegacyRecords(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      { records: [{ harvest_id: 'legacy-1', metadata: { data: { title: 'Legacy' } } }] },
      false,
      { username: 'tester' }
    );

    configureTrackedCreateChunk();
    const tracked = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        chunk: { index: 1 },
        records: [{ harvestId: 'tracked-1', operation: 'create', recordRequest: { metadata: { title: 'Tracked' } } }],
      },
      { username: 'tester' }
    );

    expect(compatibility[0].status).to.equal(true);
    expect(legacy[0].status).to.equal(true);
    expect(tracked.chunk.responseSummary).to.deep.include({ created: 1, failed: 0 });
    expect(recordsService.create.callCount).to.equal(3);
    for (const call of recordsService.create.getCalls()) {
      const context = call.args[7];
      expect(isRecordSaveContext(context)).to.equal(true);
      expect(context.operation).to.equal('create');
      expect(context.routeFamily).to.equal(undefined);
      expect(context.portal).to.equal(undefined);
      expect(context.validationOperation).to.equal(undefined);
      expect(context.validationRequestParameters).to.equal(undefined);
      expect(context.validationRuntimeContext).to.equal(undefined);
    }
  });

  it('strips allowlisted request and runtime facts only from schema-disabled harvest saves', async function () {
    (global as any).Record.find.returns({ meta: sinon.stub().resolves([]) });
    recordsService.create.resolves({
      oid: 'record-1',
      message: 'Created',
      wasPersisted: () => true,
    });
    const context = createRecordSaveContext({
      routeFamily: 'api',
      operation: 'create',
      portal: 'tenant-portal',
      validationOperation: 'publish',
      validationRequestParameters: { recordType: 'dataset', merge: true },
      validationRuntimeContext: { transport: 'harvest' },
    });
    const submit = () =>
      service.submitCompatibilityRecords(
        { id: 'brand-1', name: 'default' },
        { name: 'dataset' },
        { records: [{ harvestId: 'compat-1', recordRequest: { metadata: { title: 'Compatibility' } } }] },
        'override',
        { username: 'tester' },
        context
      );

    mockSails.config.recordSchema = { enabled: false };
    await submit();
    const disabledContext = recordsService.create.firstCall.args[7];
    expect(disabledContext).to.include({ operation: 'create' });
    expect(disabledContext.routeFamily).to.equal(undefined);
    expect(disabledContext.portal).to.equal(undefined);
    expect(disabledContext.validationOperation).to.equal(undefined);
    expect(disabledContext.validationRequestParameters).to.equal(undefined);
    expect(disabledContext.validationRuntimeContext).to.equal(undefined);

    recordsService.create.resetHistory();
    mockSails.config.recordSchema = { enabled: true };
    await submit();
    const enabledContext = recordsService.create.firstCall.args[7];
    expect(enabledContext).to.include({
      routeFamily: 'api',
      operation: 'create',
      portal: 'tenant-portal',
      validationOperation: 'publish',
    });
    expect(enabledContext.validationRequestParameters).to.deep.equal({ recordType: 'dataset', merge: true });
    expect(enabledContext.validationRuntimeContext).to.deep.equal({ transport: 'harvest' });
  });

  it('preserves disabled compatibility and legacy harvest create ACL semantics through real RecordsService', async function () {
    const { realRecordsService, schemaResolver, storageService } = useRealRecordsService(false);
    const hasEditAccess = sinon.spy(realRecordsService, 'hasEditAccess');
    const user = { username: 'harvester', roles: [{ id: 'role-Researcher', name: 'Researcher' }] };
    const brand = { id: 'brand-1', name: 'default' };
    const recordType = { name: 'dataset', hooks: {}, searchable: false };
    (global as any).Record.find.returns({ meta: sinon.stub().resolves([]) });

    const compatibility = await service.submitCompatibilityRecords(
      brand,
      recordType,
      { records: [{ harvestId: 'compat-1', recordRequest: { metadata: { title: 'Compatibility' } } }] },
      'override',
      user,
      harvestSaveContext()
    );
    const legacy = await service.submitLegacyRecords(
      brand,
      recordType,
      { records: [{ harvest_id: 'legacy-1', metadata: { data: { title: 'Legacy' } } }] },
      false,
      user,
      harvestSaveContext()
    );

    expect(compatibility[0].status).to.equal(true);
    expect(legacy[0].status).to.equal(true);
    expect(storageService.create.callCount).to.equal(2);
    expect(hasEditAccess.notCalled).to.equal(true);
    expect(schemaResolver.resolveCreate.notCalled).to.equal(true);
    expect(schemaResolver.persistSaveUsageReference.notCalled).to.equal(true);
    for (const call of storageService.create.getCalls()) {
      expect(call.args[1].authorization.editRoles).to.deep.equal(['HarvestEditor']);
    }
  });

  it('preserves disabled tracked harvest create and upsert ACL semantics through real RecordsService', async function () {
    const { realRecordsService, schemaResolver, storageService } = useRealRecordsService(false);
    const hasEditAccess = sinon.spy(realRecordsService, 'hasEditAccess');
    configureTrackedCreateChunk();
    (global as any).Record.find.returns({ meta: sinon.stub().resolves([]) });

    const response = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset', hooks: {}, searchable: false },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        finalChunk: true,
        chunk: { index: 1 },
        records: [
          { harvestId: 'tracked-create', operation: 'create', recordRequest: { metadata: { title: 'Create' } } },
          { harvestId: 'tracked-upsert', operation: 'upsert', recordRequest: { metadata: { title: 'Upsert' } } },
        ],
      },
      { username: 'harvester', roles: [{ id: 'role-Researcher', name: 'Researcher' }] },
      harvestSaveContext()
    );

    expect(response.chunk.responseSummary).to.deep.include({ created: 2, failed: 0 });
    expect(storageService.create.callCount).to.equal(2);
    expect(hasEditAccess.notCalled).to.equal(true);
    expect(schemaResolver.resolveCreate.notCalled).to.equal(true);
    expect(schemaResolver.persistSaveUsageReference.notCalled).to.equal(true);
  });

  it('keeps enabled harvest creates authorized against workflow ACLs before schema resolution', async function () {
    const { realRecordsService, schemaResolver, storageService } = useRealRecordsService(true);
    const hasEditAccess = sinon.spy(realRecordsService, 'hasEditAccess');
    const user = { username: 'harvester', roles: [{ id: 'role-Researcher', name: 'Researcher' }] };
    const brand = { id: 'brand-1', name: 'default' };
    const recordType = { name: 'dataset', hooks: {}, searchable: false };
    (global as any).Record.find.returns({ meta: sinon.stub().resolves([]) });

    const compatibility = await service.submitCompatibilityRecords(
      brand,
      recordType,
      { records: [{ harvestId: 'compat-1', recordRequest: { metadata: { title: 'Compatibility' } } }] },
      'override',
      user,
      harvestSaveContext()
    );
    const legacy = await service.submitLegacyRecords(
      brand,
      recordType,
      { records: [{ harvest_id: 'legacy-1', metadata: { data: { title: 'Legacy' } } }] },
      false,
      user,
      harvestSaveContext()
    );

    configureTrackedCreateChunk();
    const tracked = await service.submitChunk(
      brand,
      recordType,
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        finalChunk: true,
        chunk: { index: 1 },
        records: [
          { harvestId: 'tracked-create', operation: 'create', recordRequest: { metadata: { title: 'Create' } } },
          { harvestId: 'tracked-upsert', operation: 'upsert', recordRequest: { metadata: { title: 'Upsert' } } },
        ],
      },
      user,
      harvestSaveContext()
    );

    expect(compatibility[0].status).to.equal(false);
    expect(legacy[0].status).to.equal(false);
    expect(tracked.chunk.responseSummary).to.deep.include({ created: 0, failed: 2 });
    expect(storageService.create.notCalled).to.equal(true);
    expect(schemaResolver.resolveCreate.notCalled).to.equal(true);
    expect(hasEditAccess.callCount).to.equal(4);
    for (const call of hasEditAccess.getCalls()) {
      expect(call.args[3].authorization.editRoles).to.deep.equal(['HarvestEditor']);
    }
  });

  it('creates a tracked harvest run, chunk, and events', async function () {
    mockSails.config.recordSchema = { enabled: true };
    (global as any).HarvestRun.findOne.resolves(null);
    (global as any).HarvestRun.create.returns({
      fetch: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 0,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRunChunk.find.returns(createChainableQuery([]));
    (global as any).HarvestRunChunk.create.returns({
      fetch: sinon.stub().resolves({
        id: 'chunk-1',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        attempt: 1,
        status: 'processing',
        recordCount: 1,
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        duplicate: false,
        submittedAt: '2026-05-25T00:00:00.000Z',
      }),
    });
    (global as any).HarvestRunChunk.updateOne.returns({
      set: sinon.stub().resolves({
        id: 'chunk-1',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        status: 'processed',
        recordCount: 1,
        totalProcessed: 1,
        created: 1,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        duplicate: false,
        submittedAt: '2026-05-25T00:00:00.000Z',
        responseSummary: { totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0 },
      }),
    });
    (global as any).HarvestRun.updateOne.returns({
      set: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'completed',
        startedAt: '2026-05-25T00:00:00.000Z',
        completedAt: '2026-05-25T00:05:00.000Z',
        totalProcessed: 1,
        created: 1,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 1,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRecordEvent.createEach.resolves([{ id: 'event-1' }]);
    (global as any).Record.find.callsFake(() => ({ meta: sinon.stub().resolves([]) }));
    recordsService.create.resolves({
      oid: 'record-1',
      message: 'Created',
      details: '',
      isSuccessful: () => true,
      isComplete: () => true,
      wasPersisted: () => true,
    });

    const response = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        finalChunk: true,
        chunk: { index: 1, label: 'part-1' },
        records: [{ harvestId: 'harvest-1', operation: 'upsert', recordRequest: { metadata: { title: 'Test' } } }],
      },
      { username: 'tester' },
      harvestSaveContext()
    );

    expect(recordsService.create.calledOnce).to.equal(true);
    const createContext = recordsService.create.firstCall.args[7];
    expect(isRecordSaveContext(createContext)).to.equal(true);
    expect(createContext).to.include({ operation: 'create', portal: 'tenant-portal' });
    expect((global as any).HarvestRecordEvent.createEach.calledOnce).to.equal(true);
    expect((global as any).Record.find.calledOnce).to.equal(true);
    expect(response.run.sourceRunId).to.equal('source-run-1');
    expect(response.chunk.status).to.equal('processed');
    expect(response.records).to.equal(undefined);
  });

  it('returns a duplicate chunk response without reprocessing records', async function () {
    (global as any).HarvestRun.findOne.resolves({
      id: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceName: 'source-a',
      sourceRunId: 'source-run-1',
      status: 'running',
      startedAt: '2026-05-25T00:00:00.000Z',
      totalProcessed: 1,
      created: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 1,
      duplicateChunks: 0,
    });
    (global as any).HarvestRunChunk.find.returns(
      createChainableQuery([
        {
          id: 'chunk-1',
          runId: 'run-1',
          brandId: 'brand-1',
          recordType: 'dataset',
          sourceRunId: 'source-run-1',
          contentHash: 'hash-1',
          attempt: 1,
          status: 'processed',
          recordCount: 1,
          totalProcessed: 1,
          created: 1,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          failed: 0,
          duplicate: false,
          submittedAt: '2026-05-25T00:00:00.000Z',
          responseSummary: { totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0 },
        },
      ])
    );
    (global as any).HarvestRun.updateOne.returns({
      set: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 1,
        created: 1,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 1,
        duplicateChunks: 1,
      }),
    });

    const response = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        chunk: { index: 1 },
        records: [{ harvestId: 'harvest-1', recordRequest: { metadata: { title: 'Test' } } }],
      },
      { username: 'tester' },
      harvestSaveContext()
    );

    expect(recordsService.create.called).to.equal(false);
    expect(response.chunk.duplicate).to.equal(true);
    expect(response.run.duplicateChunks).to.equal(1);
    expect(response.records).to.equal(undefined);
  });

  it('returns run counters as aggregate counts to avoid stale-read races', async function () {
    (global as any).HarvestRun.findOne.resolves({
      id: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceName: 'source-a',
      sourceRunId: 'source-run-1',
      status: 'completed',
      startedAt: '2026-05-25T00:00:00.000Z',
      totalProcessed: 5,
      created: 1,
      updated: 2,
      deleted: 1,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 2,
      duplicateChunks: 1,
    });
    (global as any).HarvestRunChunk.find.returns(
      createChainableQuery([
        {
          id: 'chunk-1',
          runId: 'run-1',
          brandId: 'brand-1',
          recordType: 'dataset',
          sourceRunId: 'source-run-1',
          contentHash: 'hash-1',
          attempt: 1,
          status: 'processed',
          recordCount: 1,
          totalProcessed: 2,
          created: 1,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          failed: 0,
          duplicate: false,
          submittedAt: '2026-05-25T00:00:00.000Z',
        },
        {
          id: 'chunk-2',
          runId: 'run-1',
          brandId: 'brand-1',
          recordType: 'dataset',
          sourceRunId: 'source-run-1',
          contentHash: 'hash-2',
          attempt: 1,
          status: 'processed',
          recordCount: 1,
          totalProcessed: 3,
          created: 0,
          updated: 2,
          deleted: 1,
          unchanged: 0,
          failed: 0,
          duplicate: true,
          submittedAt: '2026-05-25T00:01:00.000Z',
        },
      ])
    );
    (global as any).HarvestRecordEvent.find.returns(createChainableQuery([]));

    const result = await service.getRun({ id: 'brand-1', name: 'default' }, 'run-1');

    expect(result).to.not.equal(null);
    expect(result.aggregateCounts).to.deep.equal({
      totalProcessed: 5,
      created: 1,
      updated: 2,
      deleted: 1,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 2,
      duplicateChunks: 1,
    });
    expect((global as any).HarvestRunChunk.find.firstCall.returnValue.limit.calledWith(100)).to.equal(true);
  });

  it('rejects tracked chunks over the configured record limit before processing', async function () {
    mockSails.config.harvestRuns = { maxRecordsPerChunk: 1, maxChunkBytes: 5_000_000 };

    try {
      await service.submitChunk(
        { id: 'brand-1', name: 'default' },
        { name: 'dataset' },
        {
          sourceRunId: 'source-run-1',
          sourceName: 'source-a',
          chunk: { index: 1 },
          records: [
            { harvestId: 'harvest-1', recordRequest: { metadata: { title: 'One' } } },
            { harvestId: 'harvest-2', recordRequest: { metadata: { title: 'Two' } } },
          ],
        },
        { username: 'tester' },
        harvestSaveContext()
      );
      throw new Error('Expected submitChunk to reject oversized chunk');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).to.equal(413);
      expect((global as any).HarvestRun.findOne.called).to.equal(false);
    }
  });

  it('returns 409 for a fresh duplicate processing chunk', async function () {
    (global as any).HarvestRun.findOne.resolves({
      id: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceName: 'source-a',
      sourceRunId: 'source-run-1',
      status: 'running',
      startedAt: '2026-05-25T00:00:00.000Z',
      totalProcessed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 0,
      duplicateChunks: 0,
    });
    (global as any).HarvestRunChunk.find.returns(
      createChainableQuery([
        {
          id: 'chunk-1',
          runId: 'run-1',
          brandId: 'brand-1',
          recordType: 'dataset',
          sourceRunId: 'source-run-1',
          contentHash: 'hash-1',
          attempt: 1,
          status: 'processing',
          recordCount: 1,
          duplicate: false,
          submittedAt: new Date().toISOString(),
        },
      ])
    );

    try {
      await service.submitChunk(
        { id: 'brand-1', name: 'default' },
        { name: 'dataset' },
        {
          sourceRunId: 'source-run-1',
          sourceName: 'source-a',
          chunk: { index: 1 },
          records: [{ harvestId: 'harvest-1', recordRequest: { metadata: { title: 'Test' } } }],
        },
        { username: 'tester' },
        harvestSaveContext()
      );
      throw new Error('Expected submitChunk to reject duplicate processing chunk');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).to.equal(409);
      expect((global as any).HarvestRunChunk.create.called).to.equal(false);
    }
  });

  it('resumes a failed chunk retry from previously persisted events', async function () {
    (global as any).HarvestRun.findOne.resolves({
      id: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceName: 'source-a',
      sourceRunId: 'source-run-1',
      status: 'running',
      startedAt: '2026-05-25T00:00:00.000Z',
      totalProcessed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 0,
      duplicateChunks: 0,
    });
    (global as any).HarvestRunChunk.find.returns(
      createChainableQuery([
        {
          id: 'chunk-1',
          runId: 'run-1',
          brandId: 'brand-1',
          recordType: 'dataset',
          sourceRunId: 'source-run-1',
          contentHash: 'hash-1',
          attempt: 1,
          status: 'failed',
          recordCount: 2,
          totalProcessed: 1,
          created: 1,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          failed: 0,
          duplicate: false,
          submittedAt: '2026-05-25T00:00:00.000Z',
          completedAt: '2026-05-25T00:01:00.000Z',
          responseSummary: { totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0 },
          errorMessage: 'write failed',
        },
      ])
    );
    (global as any).HarvestRecordEvent.find.callsFake((criteria: any) => {
      if (criteria?.chunkId?.in?.includes('chunk-1')) {
        return createChainableQuery([
          {
            id: 'event-1',
            runId: 'run-1',
            chunkId: 'chunk-1',
            brandId: 'brand-1',
            recordType: 'dataset',
            sourceRunId: 'source-run-1',
            harvestId: 'harvest-1',
            oid: 'record-1',
            operation: 'create',
            outcome: 'created',
            status: true,
            createdAt: '2026-05-25T00:00:30.000Z',
          },
        ]);
      }
      return createChainableQuery([]);
    });
    (global as any).HarvestRunChunk.create.returns({
      fetch: sinon.stub().resolves({
        id: 'chunk-2',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        attempt: 2,
        status: 'processing',
        recordCount: 2,
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        duplicate: false,
        submittedAt: '2026-05-25T00:02:00.000Z',
      }),
    });
    (global as any).HarvestRunChunk.updateOne.callsFake(() => ({ set: sinon.stub().resolves(null) }));
    (global as any).HarvestRun.updateOne.returns({
      set: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'completed',
        startedAt: '2026-05-25T00:00:00.000Z',
        completedAt: '2026-05-25T00:03:00.000Z',
        totalProcessed: 2,
        created: 2,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 1,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRecordEvent.createEach.resolves([{ id: 'event-2' }]);
    (global as any).Record.find.callsFake(() => ({
      meta: sinon.stub().resolves([
        {
          harvestId: 'harvest-1',
          redboxOid: 'record-1',
          metadata: { title: 'Existing' },
          metaMetadata: { brandId: 'brand-1', type: 'dataset' },
        },
      ]),
    }));
    recordsService.create.resolves({
      oid: 'record-2',
      message: '',
      details: '',
      isSuccessful: () => true,
      outcome: 'saved-with-warnings',
      isComplete: () => false,
      wasPersisted: () => true,
    });

    const response = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        finalChunk: true,
        chunk: { index: 1 },
        records: [
          { harvestId: 'harvest-1', operation: 'create', recordRequest: { metadata: { title: 'Existing' } } },
          { harvestId: 'harvest-2', operation: 'create', recordRequest: { metadata: { title: 'New' } } },
        ],
      },
      { username: 'tester' },
      harvestSaveContext()
    );

    expect(recordsService.create.calledOnce).to.equal(true);
    expect(recordsService.create.firstCall.args[1]).to.deep.include({ harvestId: 'harvest-2' });
    expect((global as any).HarvestRecordEvent.createEach.calledOnce).to.equal(true);
    expect((global as any).HarvestRecordEvent.createEach.firstCall.args[0]).to.have.length(1);
    expect((global as any).HarvestRecordEvent.createEach.firstCall.args[0][0].harvestId).to.equal('harvest-2');
    expect((global as any).HarvestRecordEvent.createEach.firstCall.args[0][0].oid).to.equal('record-2');
    expect((global as any).HarvestRecordEvent.createEach.firstCall.args[0][0].message).to.equal('saved-with-warnings');
    expect(response.chunk.status).to.equal('processed');
    expect(response.chunk.responseSummary).to.deep.include({ totalProcessed: 2, created: 2, failed: 0 });
  });

  it('soft deletes tracked records when delete is requested', async function () {
    (global as any).HarvestRun.findOne.resolves(null);
    (global as any).HarvestRun.create.returns({
      fetch: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 0,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRunChunk.find.returns(createChainableQuery([]));
    (global as any).HarvestRunChunk.create.returns({
      fetch: sinon.stub().resolves({
        id: 'chunk-1',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        attempt: 1,
        status: 'processing',
        recordCount: 1,
        duplicate: false,
        submittedAt: '2026-05-25T00:00:00.000Z',
      }),
    });
    (global as any).HarvestRunChunk.updateOne.returns({ set: sinon.stub().resolves(null) });
    (global as any).HarvestRun.updateOne.returns({ set: sinon.stub().resolves(null) });
    (global as any).HarvestRecordEvent.createEach.resolves([{ id: 'event-1' }]);
    (global as any).Record.find.callsFake(() => ({
      meta: sinon.stub().resolves([
        {
          harvestId: 'harvest-1',
          redboxOid: 'record-1',
          metadata: { title: 'Existing' },
          metaMetadata: { brandId: 'brand-1', type: 'dataset' },
        },
      ]),
    }));
    recordsService.delete.resolves({
      message: 'Deleted',
      details: '',
      isSuccessful: () => true,
    });

    const response = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        chunk: { index: 1 },
        records: [{ harvestId: 'harvest-1', operation: 'delete' }],
      },
      { username: 'tester' },
      harvestSaveContext()
    );

    expect(recordsService.delete.calledOnce).to.equal(true);
    expect(response.records).to.equal(undefined);
  });

  it('updates tracked records when incoming metadata removes an existing field', async function () {
    mockSails.config.recordSchema = { enabled: true };
    (global as any).HarvestRun.findOne.resolves(null);
    (global as any).HarvestRun.create.returns({
      fetch: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 0,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRunChunk.find.returns(createChainableQuery([]));
    (global as any).HarvestRunChunk.create.returns({
      fetch: sinon.stub().resolves({
        id: 'chunk-1',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        attempt: 1,
        status: 'processing',
        recordCount: 1,
        duplicate: false,
        submittedAt: '2026-05-25T00:00:00.000Z',
      }),
    });
    (global as any).HarvestRunChunk.updateOne.returns({
      set: sinon.stub().resolves({
        id: 'chunk-1',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        status: 'processed',
        recordCount: 1,
        totalProcessed: 1,
        created: 0,
        updated: 1,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        duplicate: false,
        submittedAt: '2026-05-25T00:00:00.000Z',
        responseSummary: { totalProcessed: 1, created: 0, updated: 1, deleted: 0, unchanged: 0, failed: 0 },
      }),
    });
    (global as any).HarvestRun.updateOne.returns({
      set: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 1,
        created: 0,
        updated: 1,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 1,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRecordEvent.createEach.resolves([{ id: 'event-1' }]);
    (global as any).Record.find.callsFake(() => ({
      meta: sinon.stub().resolves([
        {
          harvestId: 'harvest-1',
          redboxOid: 'record-1',
          metadata: { title: 'Existing', description: 'To remove' },
          metaMetadata: { brandId: 'brand-1', type: 'dataset' },
        },
      ]),
    }));
    recordsService.getMeta.resolves({
      metadata: { title: 'Existing', description: 'To remove' },
      authorization: { edit: true },
    });
    recordsService.updateMetaInternal.resolves({
      oid: 'record-1',
      message: 'Updated',
      details: '',
      isSuccessful: () => true,
      isComplete: () => true,
      wasPersisted: () => true,
    });

    const response = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      { name: 'dataset' },
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        chunk: { index: 1 },
        records: [{ harvestId: 'harvest-1', operation: 'upsert', recordRequest: { metadata: { title: 'Existing' } } }],
      },
      { username: 'tester' },
      harvestSaveContext()
    );

    expect(recordsService.updateMetaInternal.calledOnce).to.equal(true);
    const updateContext = recordsService.updateMetaInternal.firstCall.args[0].context;
    expect(isRecordSaveContext(updateContext)).to.equal(true);
    expect(updateContext).to.include({ operation: 'update', portal: 'tenant-portal' });
    expect(response.chunk.responseSummary).to.deep.include({ updated: 1, unchanged: 0 });
  });

  it('rejects a raw merge type failure before hooks or mutation in legacy and tracked updates', async function () {
    const { persistedRecords, realRecordsService, recordValidationService, schemaResolver, storageService } =
      useRealRecordsService(true);
    const resolveUpdate = rejectNonArrayTagUpdates(schemaResolver);
    const originalRecord = {
      redboxOid: 'record-1',
      revision: 1,
      harvestId: 'harvest-1',
      metadata: { title: 'Original', tags: ['stored'] },
      metaMetadata: {
        brandId: 'brand-1',
        type: 'dataset',
        form: 'default-form',
        attachmentFields: [],
      },
      workflow: { stage: 'draft' },
      authorization: {
        edit: ['harvester'],
        view: ['harvester'],
        editRoles: [],
        viewRoles: [],
      },
    };
    persistedRecords.set('record-1', structuredClone(originalRecord));
    const recordType = { name: 'dataset', hooks: {}, searchable: false };
    (global as any).RecordTypesService = {
      get: sinon.stub().returns(of(recordType)),
    };
    (global as any).Record.find.returns({
      meta: sinon.stub().resolves([structuredClone(originalRecord)]),
    });
    const applySubmittedMetadata = sinon.spy(realRecordsService, 'applySubmittedMetadata');
    const preSaveHook = sinon.spy(realRecordsService, 'triggerPreSaveTriggers');
    const rawDelta = { tags: 'invalid-scalar' };

    const legacyResponse = await service.submitLegacyRecords(
      { id: 'brand-1', name: 'default' },
      recordType,
      {
        records: [
          {
            harvest_id: 'harvest-1',
            metadata: { data: rawDelta },
          },
        ],
      },
      true,
      { username: 'harvester', roles: [] },
      harvestSaveContext()
    );

    expect(legacyResponse[0].status).to.equal(false);
    expect(resolveUpdate.calledOnce).to.equal(true);
    expect(schemaResolver.validateResolvedArtifact.calledOnce).to.equal(true);
    expect(schemaResolver.validateResolvedArtifact.firstCall.args[0].input).to.equal(rawDelta);
    expect(schemaResolver.validateResolvedArtifact.firstCall.returnValue).to.deep.include({
      kind: 'validated',
      valid: false,
    });
    expect(resolveUpdate.calledBefore(schemaResolver.validateResolvedArtifact)).to.equal(true);
    expect(applySubmittedMetadata.notCalled).to.equal(true);
    expect(preSaveHook.notCalled).to.equal(true);
    expect(recordValidationService.resolve.notCalled).to.equal(true);
    expect(storageService.updateMeta.notCalled).to.equal(true);
    expect(schemaResolver.persistSaveUsageReference.notCalled).to.equal(true);
    expect(persistedRecords.get('record-1')).to.deep.equal(originalRecord);

    persistedRecords.set('record-1', structuredClone(originalRecord));
    resolveUpdate.resetHistory();
    schemaResolver.validateResolvedArtifact.resetHistory();
    applySubmittedMetadata.resetHistory();
    preSaveHook.resetHistory();
    recordValidationService.resolve.resetHistory();
    storageService.updateMeta.resetHistory();
    schemaResolver.persistSaveUsageReference.resetHistory();
    configureTrackedCreateChunk();

    const trackedResponse = await service.submitChunk(
      { id: 'brand-1', name: 'default' },
      recordType,
      {
        sourceRunId: 'source-run-1',
        sourceName: 'source-a',
        chunk: { index: 1 },
        records: [
          {
            harvestId: 'harvest-1',
            operation: 'update',
            updateStrategy: 'merge',
            recordRequest: { metadata: rawDelta },
          },
        ],
      },
      { username: 'harvester', roles: [] },
      harvestSaveContext()
    );

    expect(trackedResponse.chunk.responseSummary).to.deep.include({
      updated: 0,
      failed: 1,
    });
    expect(resolveUpdate.calledOnce).to.equal(true);
    expect(schemaResolver.validateResolvedArtifact.calledOnce).to.equal(true);
    expect(schemaResolver.validateResolvedArtifact.firstCall.args[0].input).to.equal(rawDelta);
    expect(schemaResolver.validateResolvedArtifact.firstCall.returnValue).to.deep.include({
      kind: 'validated',
      valid: false,
    });
    expect(resolveUpdate.calledBefore(schemaResolver.validateResolvedArtifact)).to.equal(true);
    expect(applySubmittedMetadata.notCalled).to.equal(true);
    expect(preSaveHook.notCalled).to.equal(true);
    expect(recordValidationService.resolve.notCalled).to.equal(true);
    expect(storageService.updateMeta.notCalled).to.equal(true);
    expect(schemaResolver.persistSaveUsageReference.notCalled).to.equal(true);
    expect(persistedRecords.get('record-1')).to.deep.equal(originalRecord);
    expect(rawDelta).to.deep.equal({ tags: 'invalid-scalar' });
  });

  it('runs schema-valid legacy and tracked harvest updates through the business validator exactly once', async function () {
    const { persistedRecords, realRecordsService, recordValidationService, schemaResolver, storageService } =
      useRealRecordsService(true);
    rejectNonArrayTagUpdates(schemaResolver);
    const original = {
      redboxOid: 'record-1',
      revision: 1,
      harvestId: 'harvest-1',
      metadata: { title: 'Original', score: 12, approval: 'approved', tags: ['stored'] },
      metaMetadata: {
        brandId: 'brand-1',
        type: 'dataset',
        form: 'default-form',
        attachmentFields: [],
      },
      workflow: { stage: 'draft' },
      authorization: {
        edit: ['harvester'],
        view: ['harvester'],
        editRoles: [],
        viewRoles: [],
      },
    };
    const recordType = {
      name: 'dataset',
      hooks: {
        onUpdate: {
          pre: [
            {
              function:
                '(_oid, record) => ({ ...record, metadata: { ...record.metadata, harvestRunBeforeValidatorCount: (record.metadata.harvestRunBeforeValidatorCount ?? 0) + 1 } })',
            },
          ],
        },
      },
      searchable: false,
    };
    (global as any).RecordTypesService = { get: sinon.stub().returns(of(recordType)) };
    const internalSave = sinon.spy(realRecordsService, 'updateMetaInternal');
    const applySubmittedMetadata = sinon.spy(realRecordsService, 'applySubmittedMetadata');
    const preSaveHook = sinon.spy(realRecordsService, 'triggerPreSaveTriggers');
    const cases = [
      {
        name: 'legacy/business-valid',
        tracked: false,
        metadata: {
          title: 'Approved',
          score: 10,
          approval: 'approved',
          tags: ['incoming'],
        },
        expectedPersisted: true,
      },
      {
        name: 'legacy/business-invalid',
        tracked: false,
        metadata: { title: '', score: 9, approval: 'rejected', tags: ['incoming'] },
        expectedPersisted: false,
      },
      {
        name: 'tracked/business-valid',
        tracked: true,
        metadata: { title: 'Approved', score: 10, approval: 'approved', tags: ['incoming'] },
        expectedPersisted: true,
      },
      {
        name: 'tracked/business-invalid',
        tracked: true,
        metadata: {
          title: '',
          score: 9,
          approval: 'rejected',
          tags: ['incoming'],
        },
        expectedPersisted: false,
      },
    ] as const;

    for (const testCase of cases) {
      persistedRecords.set('record-1', structuredClone(original));
      (global as any).Record.find.returns({
        meta: sinon.stub().resolves([structuredClone(original)]),
      });
      if (testCase.tracked) configureTrackedCreateChunk();
      schemaResolver.validateResolvedArtifact.resetHistory();
      schemaResolver.persistSaveUsageReference.resetHistory();
      internalSave.resetHistory();
      applySubmittedMetadata.resetHistory();
      preSaveHook.resetHistory();
      storageService.updateMeta.resetHistory();
      recordValidationService.resolve.resetHistory();
      recordValidationService.resolve.callsFake(
        async (request: RecordValidationRequest): Promise<RecordValidationResult> => {
          const invalid = request.candidate.metadata.approval !== 'approved';
          return recordValidationResult(
            request,
            invalid
              ? [
                  {
                    message: '@validator-error-required',
                    field: 'title',
                    class: 'required',
                  },
                  {
                    message: '@validator-error-min',
                    field: 'score',
                    class: 'min',
                  },
                  {
                    message: '@validator-error-jsonata-expression',
                    field: 'approval',
                    class: 'jsonata-expression',
                  },
                ]
              : [],
            'enforce'
          );
        }
      );
      const rawDelta = structuredClone(testCase.metadata);

      let persisted: boolean;
      if (testCase.tracked) {
        const response = await service.submitChunk(
          { id: 'brand-1', name: 'default' },
          recordType,
          {
            sourceRunId: 'source-run-1',
            sourceName: 'source-a',
            chunk: { index: 1 },
            records: [
              {
                harvestId: 'harvest-1',
                operation: 'update',
                updateStrategy: 'merge',
                recordRequest: { metadata: rawDelta },
              },
            ],
          },
          { username: 'harvester', roles: [] },
          harvestSaveContext()
        );
        expect(response.chunk.status, testCase.name).to.equal('processed');
        expect(response.chunk.responseSummary, testCase.name).to.deep.include({
          updated: testCase.expectedPersisted ? 1 : 0,
          failed: testCase.expectedPersisted ? 0 : 1,
        });
        persisted = response.chunk.responseSummary.updated === 1;
      } else {
        const response = await service.submitLegacyRecords(
          { id: 'brand-1', name: 'default' },
          recordType,
          { records: [{ harvest_id: 'harvest-1', metadata: { data: rawDelta } }] },
          true,
          { username: 'harvester', roles: [] },
          harvestSaveContext()
        );
        expect(response[0].status, testCase.name).to.equal(testCase.expectedPersisted);
        if (testCase.expectedPersisted) {
          expect(response[0].message, testCase.name).to.equal('saved');
        }
        persisted = response[0].status;
      }

      expect(persisted, testCase.name).to.equal(testCase.expectedPersisted);
      expect(internalSave.calledOnce, testCase.name).to.equal(true);
      expect(internalSave.firstCall.args[0], testCase.name).to.deep.include({
        actor: {
          kind: 'service',
          id: testCase.tracked
            ? 'HarvestRunService.updateTrackedRecord'
            : 'HarvestRunService.legacyUpdateHarvestRecord',
        },
        authorization: { kind: 'service' },
        mutationClass: 'full-record',
        metadata: rawDelta,
        metadataMode: 'merge',
      });
      expect(internalSave.firstCall.args[0].record.metadata, testCase.name).to.deep.equal(original.metadata);
      expect(schemaResolver.validateResolvedArtifact.calledOnce, testCase.name).to.equal(true);
      expect(schemaResolver.validateResolvedArtifact.firstCall.args[0].input, testCase.name).to.equal(rawDelta);
      expect(applySubmittedMetadata.calledOnce, testCase.name).to.equal(true);
      expect(preSaveHook.calledOnce, testCase.name).to.equal(true);
      expect(recordValidationService.resolve.calledOnce, testCase.name).to.equal(true);
      expect(internalSave.calledBefore(schemaResolver.validateResolvedArtifact), testCase.name).to.equal(true);
      expect(schemaResolver.validateResolvedArtifact.calledBefore(preSaveHook), testCase.name).to.equal(true);
      expect(schemaResolver.validateResolvedArtifact.calledBefore(applySubmittedMetadata), testCase.name).to.equal(
        true
      );
      expect(applySubmittedMetadata.calledBefore(preSaveHook), testCase.name).to.equal(true);
      expect(preSaveHook.calledBefore(recordValidationService.resolve), testCase.name).to.equal(true);
      const validationRequest: RecordValidationRequest = recordValidationService.resolve.firstCall.args[0];
      expect(validationRequest.writeKind, testCase.name).to.equal('update');
      expect(validationRequest.candidate.metadata, testCase.name).to.deep.include({
        ...testCase.metadata,
        tags: ['stored', 'incoming'],
        harvestRunBeforeValidatorCount: 1,
      });
      expect(rawDelta, testCase.name).to.deep.equal(testCase.metadata);

      if (testCase.expectedPersisted) {
        expect(storageService.updateMeta.calledOnce, testCase.name).to.equal(true);
        expect(recordValidationService.resolve.calledBefore(storageService.updateMeta), testCase.name).to.equal(true);
        expect(schemaResolver.persistSaveUsageReference.calledOnce, testCase.name).to.equal(true);
        expect(
          storageService.updateMeta.calledBefore(schemaResolver.persistSaveUsageReference),
          testCase.name
        ).to.equal(true);
        expect(schemaResolver.persistSaveUsageReference.firstCall.args[0], testCase.name).to.deep.include({
          digest: 'b'.repeat(64),
          brand: 'brand-1',
          portal: 'tenant-portal',
          schemaKind: 'update',
          recordType: 'dataset',
          oid: 'record-1',
          operation: 'strict-all',
        });
        expect(
          mockSails.log.error.neverCalledWithMatch(
            sinon.match('record schema save usage persistence failed'),
            sinon.match.has('event', 'record_schema_save_usage_persistence_failed')
          ),
          testCase.name
        ).to.equal(true);
        expect(persistedRecords.get('record-1').metadata, testCase.name).to.deep.include({
          ...testCase.metadata,
          tags: ['stored', 'incoming'],
          harvestRunBeforeValidatorCount: 1,
        });
        expect(persistedRecords.get('record-1').revision, testCase.name).to.equal(2);
      } else {
        expect(storageService.updateMeta.notCalled, testCase.name).to.equal(true);
        expect(schemaResolver.persistSaveUsageReference.notCalled, testCase.name).to.equal(true);
        expect(persistedRecords.get('record-1'), testCase.name).to.deep.equal(original);
      }
    }
  });

  it('rolls back created records when event persistence fails before checkpointing', async function () {
    (global as any).HarvestRun.findOne.resolves(null);
    (global as any).HarvestRun.create.returns({
      fetch: sinon.stub().resolves({
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 0,
        duplicateChunks: 0,
      }),
    });
    (global as any).HarvestRunChunk.find.returns(createChainableQuery([]));
    (global as any).HarvestRunChunk.create.returns({
      fetch: sinon.stub().resolves({
        id: 'chunk-1',
        runId: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceRunId: 'source-run-1',
        contentHash: 'hash-1',
        attempt: 1,
        status: 'processing',
        recordCount: 1,
        duplicate: false,
        submittedAt: '2026-05-25T00:00:00.000Z',
      }),
    });
    (global as any).HarvestRunChunk.updateOne.returns({ set: sinon.stub().resolves(null) });
    (global as any).HarvestRun.updateOne.returns({ set: sinon.stub().resolves(null) });
    (global as any).HarvestRecordEvent.createEach.rejects(new Error('event write failed'));
    (global as any).Record.find.callsFake(() => ({ meta: sinon.stub().resolves([]) }));
    recordsService.create.resolves({
      oid: 'record-1',
      message: 'Created',
      details: '',
      isSuccessful: () => true,
      isComplete: () => true,
      wasPersisted: () => true,
    });
    recordsService.getMeta.resolves({
      redboxOid: 'record-1',
      metadata: { title: 'Test' },
      metaMetadata: { brandId: 'brand-1', type: 'dataset' },
    });
    recordsService.delete.resolves({
      message: 'Deleted',
      details: '',
      isSuccessful: () => true,
    });

    try {
      await service.submitChunk(
        { id: 'brand-1', name: 'default' },
        { name: 'dataset' },
        {
          sourceRunId: 'source-run-1',
          sourceName: 'source-a',
          chunk: { index: 1 },
          records: [{ harvestId: 'harvest-1', operation: 'create', recordRequest: { metadata: { title: 'Test' } } }],
        },
        { username: 'tester' },
        harvestSaveContext()
      );
      throw new Error('Expected submitChunk to fail when event persistence fails');
    } catch (error) {
      expect((error as Error).message).to.equal('event write failed');
    }

    expect(recordsService.create.calledOnce).to.equal(true);
    expect(recordsService.delete.calledOnce).to.equal(true);
    expect((global as any).HarvestRun.updateOne.called).to.equal(false);
  });

  for (const operation of ['update', 'upsert'] as const) {
    it(`uses trusted internal compensation when a tracked ${operation} hook changes the ACL`, async function () {
      const { persistedRecords, storageService } = useRealRecordsService(true);
      const originalRecord = {
        redboxOid: 'record-1',
        revision: 1,
        harvestId: 'harvest-1',
        metadata: { title: 'Original' },
        metaMetadata: {
          brandId: 'brand-1',
          type: 'dataset',
          form: 'default-form',
          attachmentFields: [],
        },
        workflow: { stage: 'draft' },
        authorization: {
          edit: ['harvester'],
          view: ['harvester'],
          editRoles: [],
          viewRoles: [],
        },
      };
      persistedRecords.set('record-1', structuredClone(originalRecord));
      const recordType = {
        name: 'dataset',
        hooks: {
          onUpdate: {
            pre: [
              {
                function:
                  '(_oid, record) => ({ ...record, authorization: { ...record.authorization, edit: ["replacement-owner"] } })',
              },
            ],
          },
        },
        searchable: false,
      };
      (global as any).RecordTypesService = {
        get: sinon.stub().returns(of(recordType)),
      };
      configureTrackedCreateChunk();
      (global as any).HarvestRecordEvent.createEach.rejects(new Error('event write failed'));
      (global as any).Record.find.returns({
        meta: sinon.stub().resolves([structuredClone(originalRecord)]),
      });

      let caught: unknown;
      try {
        await service.submitChunk(
          { id: 'brand-1', name: 'default' },
          recordType,
          {
            sourceRunId: 'source-run-1',
            sourceName: 'source-a',
            chunk: { index: 1 },
            records: [
              {
                harvestId: 'harvest-1',
                operation,
                recordRequest: { metadata: { title: 'Changed' } },
              },
            ],
          },
          { username: 'harvester', roles: [] },
          harvestSaveContext()
        );
      } catch (error) {
        caught = error;
      }

      expect(caught).to.be.an('error').with.property('message', 'event write failed');
      expect(storageService.updateMeta.callCount).to.equal(2);
      expect(storageService.updateMeta.firstCall.args[2].authorization.edit).to.deep.equal(['replacement-owner']);
      expect(storageService.createRecordAudit.calledOnce).to.equal(true);
      const restoredRecord = await storageService.getMeta('record-1');
      expect(restoredRecord.metadata).to.deep.equal(originalRecord.metadata);
      expect(restoredRecord.authorization.edit).to.deep.equal(originalRecord.authorization.edit);
      expect(restoredRecord.authorization.view).to.deep.equal(originalRecord.authorization.view);
      expect(restoredRecord.workflow).to.deep.equal(originalRecord.workflow);
    });
  }

  it('uses baseline validation for schema-disabled tracked update rollback without audit storage', async function () {
    const { persistedRecords, storageService } = useRealRecordsService(false);
    Reflect.deleteProperty(storageService, 'createRecordAudit');
    const validationResolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
    const originalRecord = {
      redboxOid: 'record-1',
      revision: 1,
      harvestId: 'harvest-1',
      metadata: { title: 'Original' },
      metaMetadata: {
        brandId: 'brand-1',
        type: 'dataset',
        form: 'default-form',
        attachmentFields: [],
      },
      workflow: { stage: 'draft' },
      authorization: {
        edit: ['harvester'],
        view: ['harvester'],
        editRoles: [],
        viewRoles: [],
      },
    };
    persistedRecords.set('record-1', structuredClone(originalRecord));
    const recordType = { name: 'dataset', hooks: {}, searchable: false };
    (global as any).RecordTypesService = {
      get: sinon.stub().returns(of(recordType)),
    };
    configureTrackedCreateChunk();
    (global as any).HarvestRecordEvent.createEach.rejects(new Error('event write failed'));
    (global as any).Record.find.returns({
      meta: sinon.stub().resolves([structuredClone(originalRecord)]),
    });

    let caught: unknown;
    try {
      await service.submitChunk(
        { id: 'brand-1', name: 'default' },
        recordType,
        {
          sourceRunId: 'source-run-1',
          sourceName: 'source-a',
          chunk: { index: 1 },
          records: [
            {
              harvestId: 'harvest-1',
              operation: 'update',
              recordRequest: { metadata: { title: 'Changed' } },
            },
          ],
        },
        { username: 'harvester', roles: [] },
        harvestSaveContext()
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.an('error').with.property('message', 'event write failed');
    expect(validationResolve.callCount).to.equal(2);
    expect(storageService.updateMeta.callCount).to.equal(2);
    const restoredRecord = await storageService.getMeta('record-1');
    expect(restoredRecord.metadata).to.deep.equal(originalRecord.metadata);
  });

  it('retries non-atomic run counter updates when the row changes concurrently', async function () {
    const firstSet = sinon.stub().resolves(null);
    const secondSet = sinon.stub().resolves({
      id: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceName: 'source-a',
      sourceRunId: 'source-run-1',
      status: 'running',
      startedAt: '2026-05-25T00:00:00.000Z',
      totalProcessed: 7,
      created: 5,
      updated: 2,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 4,
      duplicateChunks: 0,
      lastChunkAt: '2026-05-25T00:05:00.000Z',
    });
    (global as any).HarvestRun.updateOne
      .onFirstCall()
      .returns({ set: firstSet })
      .onSecondCall()
      .returns({ set: secondSet });
    (global as any).HarvestRun.findOne.onFirstCall().resolves({
      id: 'run-1',
      brandId: 'brand-1',
      recordType: 'dataset',
      sourceName: 'source-a',
      sourceRunId: 'source-run-1',
      status: 'running',
      startedAt: '2026-05-25T00:00:00.000Z',
      totalProcessed: 5,
      created: 4,
      updated: 1,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 3,
      duplicateChunks: 0,
    });

    const updatedRun = await service.updateRunAfterChunk(
      {
        id: 'run-1',
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 0,
        duplicateChunks: 0,
      },
      { totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 0 },
      false,
      '2026-05-25T00:05:00.000Z'
    );

    expect((global as any).HarvestRun.updateOne.calledTwice).to.equal(true);
    expect((global as any).HarvestRun.findOne.calledOnce).to.equal(true);
    expect((global as any).HarvestRun.updateOne.firstCall.args[0]).to.deep.include({
      id: 'run-1',
      totalProcessed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 0,
      status: 'running',
    });
    expect((global as any).HarvestRun.updateOne.secondCall.args[0]).to.deep.include({
      id: 'run-1',
      totalProcessed: 5,
      created: 4,
      updated: 1,
      deleted: 0,
      unchanged: 0,
      failed: 0,
      chunksProcessed: 3,
      status: 'running',
    });
    expect(secondSet.firstCall.args[0]).to.deep.include({
      totalProcessed: 7,
      created: 5,
      updated: 2,
      chunksProcessed: 4,
      lastChunkAt: '2026-05-25T00:05:00.000Z',
    });
    expect(updatedRun.totalProcessed).to.equal(7);
  });

  it('treats asymmetric metadata field removal as a real change', function () {
    expect(service.isMetadataEqual({ title: 'Existing' }, { title: 'Existing', description: 'To remove' })).to.equal(
      false
    );
    expect(service.isMetadataEqual({ title: 'Existing', description: 'To remove' }, { title: 'Existing' })).to.equal(
      false
    );
  });

  it('atomically increments run counters when a datastore manager is available', async function () {
    const runId = '507f1f77bcf86cd799439011';
    const findOneAndUpdate = sinon.stub().resolves({
      value: {
        _id: new ObjectId(runId),
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        lastChunkAt: '2026-05-25T00:05:00.000Z',
        totalProcessed: 3,
        created: 2,
        updated: 1,
        deleted: 0,
        unchanged: 0,
        failed: 1,
        chunksProcessed: 2,
        duplicateChunks: 0,
      },
    });
    const collection = {
      findOneAndUpdate,
      s: {
        pkFactory: {
          createPk: () => new ObjectId(),
        },
      },
    };
    (global as any).HarvestRun.getDatastore.returns({
      manager: {
        collection: sinon.stub().withArgs('harvestrun').returns(collection),
      },
    });

    const updatedRun = await service.updateRunAfterChunk(
      {
        id: runId,
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 0,
        duplicateChunks: 0,
      },
      { totalProcessed: 2, created: 1, updated: 1, deleted: 0, unchanged: 0, failed: 1 },
      false,
      '2026-05-25T00:05:00.000Z'
    );

    expect(findOneAndUpdate.calledOnce).to.equal(true);
    expect(findOneAndUpdate.firstCall.args[0]._id).to.be.instanceOf(ObjectId);
    expect(findOneAndUpdate.firstCall.args[0]._id.toHexString()).to.equal(runId);
    expect(findOneAndUpdate.firstCall.args[1]).to.deep.equal([
      {
        $set: {
          lastChunkAt: '2026-05-25T00:05:00.000Z',
          totalProcessed: { $add: [{ $ifNull: ['$totalProcessed', 0] }, 2] },
          created: { $add: [{ $ifNull: ['$created', 0] }, 1] },
          updated: { $add: [{ $ifNull: ['$updated', 0] }, 1] },
          deleted: { $add: [{ $ifNull: ['$deleted', 0] }, 0] },
          unchanged: { $add: [{ $ifNull: ['$unchanged', 0] }, 0] },
          failed: { $add: [{ $ifNull: ['$failed', 0] }, 1] },
          chunksProcessed: { $add: [{ $ifNull: ['$chunksProcessed', 0] }, 1] },
          status: {
            $cond: [{ $eq: ['$status', 'completed'] }, 'completed_with_errors', '$status'],
          },
        },
      },
    ]);
    expect((global as any).HarvestRun.updateOne.called).to.equal(false);
    expect(updatedRun.id).to.equal(runId);
    expect(updatedRun.totalProcessed).to.equal(3);
    expect(updatedRun.failed).to.equal(1);
  });

  it('atomically increments duplicate chunk counts when a datastore manager is available', async function () {
    const runId = '507f1f77bcf86cd799439012';
    const findOneAndUpdate = sinon.stub().resolves({
      value: {
        _id: new ObjectId(runId),
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        lastChunkAt: '2026-05-25T00:05:00.000Z',
        totalProcessed: 3,
        created: 2,
        updated: 1,
        deleted: 0,
        unchanged: 0,
        failed: 1,
        chunksProcessed: 2,
        duplicateChunks: 1,
      },
    });
    (global as any).HarvestRun.getDatastore.returns({
      manager: {
        collection: sinon
          .stub()
          .withArgs('harvestrun')
          .returns({
            findOneAndUpdate,
            s: {
              pkFactory: {
                createPk: () => new ObjectId(),
              },
            },
          }),
      },
    });

    const clock = sinon.useFakeTimers(new Date('2026-05-25T00:05:00.000Z'));
    try {
      const updatedRun = await service.bumpDuplicateChunkCount({
        id: runId,
        brandId: 'brand-1',
        recordType: 'dataset',
        sourceName: 'source-a',
        sourceRunId: 'source-run-1',
        status: 'running',
        startedAt: '2026-05-25T00:00:00.000Z',
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        chunksProcessed: 0,
        duplicateChunks: 0,
      });

      expect(findOneAndUpdate.calledOnce).to.equal(true);
      expect(findOneAndUpdate.firstCall.args[0]._id).to.be.instanceOf(ObjectId);
      expect(findOneAndUpdate.firstCall.args[0]._id.toHexString()).to.equal(runId);
      expect(findOneAndUpdate.firstCall.args[1]).to.deep.equal([
        {
          $set: {
            duplicateChunks: { $add: [{ $ifNull: ['$duplicateChunks', 0] }, 1] },
            lastChunkAt: '2026-05-25T00:05:00.000Z',
          },
        },
      ]);
      expect((global as any).HarvestRun.updateOne.called).to.equal(false);
      expect(updatedRun.id).to.equal(runId);
      expect(updatedRun.duplicateChunks).to.equal(1);
    } finally {
      clock.restore();
    }
  });

  it('lists runs and events with brand-scoped filters', async function () {
    (global as any).HarvestRun.count.resolves(2);
    (global as any).HarvestRun.find.returns(
      createChainableQuery([
        {
          id: 'run-1',
          brandId: 'brand-1',
          recordType: 'dataset',
          sourceName: 'source-a',
          sourceRunId: 'source-run-1',
          status: 'running',
          startedAt: '2026-05-25T00:00:00.000Z',
          totalProcessed: 1,
          created: 1,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          failed: 0,
          chunksProcessed: 1,
          duplicateChunks: 0,
        },
      ])
    );
    (global as any).HarvestRecordEvent.count.resolves(1);
    (global as any).HarvestRecordEvent.find.returns(
      createChainableQuery([
        {
          id: 'event-1',
          runId: 'run-1',
          chunkId: 'chunk-1',
          brandId: 'brand-1',
          recordType: 'dataset',
          sourceRunId: 'source-run-1',
          harvestId: 'harvest-1',
          oid: 'record-1',
          operation: 'upsert',
          outcome: 'created',
          status: true,
          message: 'Record created successfully',
          details: '',
          createdAt: '2026-05-25T00:01:00.000Z',
        },
      ])
    );

    const runs = await service.listRuns(
      { id: 'brand-1', name: 'default' },
      { brandId: 'brand-1', page: 1, pageSize: 20 }
    );
    const events = await service.listRunEvents({ id: 'brand-1', name: 'default' }, 'run-1', {
      runId: 'run-1',
      brandId: 'brand-1',
      page: 1,
      pageSize: 20,
    });

    expect((global as any).HarvestRun.find.firstCall.args[0]).to.deep.equal({ brandId: 'brand-1' });
    expect((global as any).HarvestRecordEvent.find.firstCall.args[0]).to.deep.equal({
      runId: 'run-1',
      brandId: 'brand-1',
    });
    expect(runs.total).to.equal(2);
    expect(runs.rows[0].sourceRunId).to.equal('source-run-1');
    expect(events.total).to.equal(1);
    expect(events.rows[0].harvestId).to.equal('harvest-1');
  });
});
