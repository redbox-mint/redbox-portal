let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import _ from 'lodash';
import { of, firstValueFrom } from 'rxjs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { rejects } from 'node:assert/strict';
import {
  formValidatorsSharedDefinitions,
  type FormConfigFrame,
  type RecordSaveIssue,
  type RecordSaveProblem,
} from '@researchdatabox/sails-ng-common';
import { createRecordSaveContext, type RecordSaveContext } from '../../src/RecordSaveResponse';
import {
  RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS,
  type RecordSchemaStorageCapabilityMethod,
  type StorageService,
} from '../../src/StorageService';
import { FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES } from '../../src/RecordStorageConcurrency';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
import { StorageServiceResponse } from '../../src/StorageServiceResponse';
import { recordSchema } from '../../src/config/recordSchema.config';
import type { FormAttributes } from '../../src/waterline-models/Form';
import type {
  RecordValidationCandidate,
  RecordValidationRequest,
  RecordValidationResult,
  RecordValidationServiceDependencies,
  ResolvedRecordValidationResult,
  UnresolvedRecordValidationResult,
} from '../../src/services/RecordValidationService';
import type { Services as FormsServiceTypes } from '../../src/services/FormsService';
import type {
  PersistRecordSchemaSaveUsageRequest,
  PersistRecordSchemaSaveUsageResult,
} from '../../src/services/RecordSchemaService';
import { ValidatorFormConfigVisitor } from '../../src/visitor/validator.visitor';
import {
  createCoreRecordContractContributors,
  RecordContractContributorRegistry,
  serializeRedboxCanonicalJsonV1,
} from '../../src/record-contract';
import { buildResolvedRecordValidationResult } from '../fixtures/record-validation.fixtures';
import {
  setupServiceTestGlobals,
  cleanupServiceTestGlobals,
  createMockSails,
  createQueryObject,
  configureModelMethod,
} from './testHelper';

const { Services: RecordValidationServices } =
  require('../../src/services/RecordValidationService') as typeof import('../../src/services/RecordValidationService');
const { Services: RecordSchemaServices } =
  require('../../src/services/RecordSchemaService') as typeof import('../../src/services/RecordSchemaService');
const DomSanitizerServices = require('../../src/services/DomSanitizerService')
  .default as typeof import('../../src/services/DomSanitizerService').default;

type FormsServiceStub = {
  getForm: sinon.SinonStub<
    Parameters<FormsServiceTypes.Forms['getForm']>,
    ReturnType<FormsServiceTypes.Forms['getForm']>
  >;
  getFormByName: sinon.SinonStub<
    Parameters<FormsServiceTypes.Forms['getFormByName']>,
    ReturnType<FormsServiceTypes.Forms['getFormByName']>
  >;
};

type StorageUpdateCandidate = Record<string, unknown> & { revision?: number };

function assertUnknownRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected a captured record object.');
  }
}

describe('RecordsService', function () {
  let mockSails: any;
  let RecordsService: any;
  let mockRecord: any;
  let mockStorageService: any;
  let mockSearchService: any;
  let mockQueueService: any;
  let mockDatastreamService: any;
  let mockFormsService: FormsServiceStub;
  let mockRecordValidationService: {
    resolve: sinon.SinonStub<[request: RecordValidationRequest], Promise<RecordValidationResult>>;
  };

  beforeEach(function () {
    mockStorageService = {
      create: sinon.stub().resolves({ success: true, oid: 'new-record-123', isSuccessful: () => true }),
      updateMeta: sinon.stub().resolves({ success: true, oid: 'record-123', isSuccessful: () => true }),
      getMeta: sinon.stub().resolves({
        redboxOid: 'record-123',
        metadata: { title: 'Test' },
        metaMetadata: { type: 'rdmp' },
      }),
      getDeletedRecordMeta: sinon.stub().resolves({ redboxOid: 'deleted-record-123' }),
      createTombstone: sinon.stub().callsFake(async (_brand: any, oid: string, tombstone: any) => ({
        success: true,
        oid,
        applicationState: 'applied',
        committedRevision: tombstone.revision,
        committedRecord: structuredClone(tombstone),
      })),
      removeActiveRecord: sinon.stub().callsFake(async (_brand: any, oid: string, options: any) => ({
        success: true,
        oid,
        applicationState: 'applied',
        committedRevision: options.precondition.expectedRevision + 1,
        removedRecord: structuredClone(await mockStorageService.getMeta(oid)),
      })),
      updateTombstone: sinon.stub().callsFake(async (_brand: any, oid: string, mutation: any) => ({
        success: true,
        oid,
        applicationState: 'applied',
        committedRevision: mutation.lifecycleOperation?.targetRevision,
        committedRecord: structuredClone(mutation),
      })),
      removeTombstone: sinon.stub().callsFake(async (_brand: any, oid: string) => ({
        success: true,
        oid,
        applicationState: 'applied',
      })),
      createActiveRecordFromTombstone: sinon
        .stub()
        .callsFake(async (_brand: any, oid: string, record: any, options: any) => ({
          success: true,
          oid,
          applicationState: 'applied',
          committedRevision: options.precondition.expectedRevision + 1,
          committedRecord: { ...structuredClone(record), revision: options.precondition.expectedRevision + 1 },
        })),
      delete: sinon.stub().resolves({ success: true, isSuccessful: () => true }),
      getRecords: sinon.stub().resolves({ items: [] }),
      getRecordAudit: sinon.stub().resolves([]),
      createBatch: sinon.stub().resolves({}),
      getRelatedRecords: sinon.stub().resolves([]),
      provideUserAccessAndRemovePendingAccess: sinon.stub(),
      updateNotificationLog: sinon.stub().resolves({}),
      exportAllPlans: sinon.stub().returns({}),
      createRecordAudit: sinon.stub().resolves({ success: true, isSuccessful: () => true }),
      restoreRecord: sinon.stub().resolves({}),
      destroyDeletedRecord: sinon.stub().resolves({}),
    };

    mockSearchService = {
      index: sinon.stub().resolves(true),
      remove: sinon.stub(),
    };

    mockQueueService = {
      now: sinon.stub(),
    };

    mockDatastreamService = {
      listDatastreams: sinon.stub().resolves([]),
      removeDatastream: sinon.stub().resolves({ success: true }),
    };

    mockSails = createMockSails({
      config: {
        appPath: '/app',
        record: {
          baseUrl: {
            redbox: 'http://localhost:9000',
          },
          api: {
            info: { url: '/info', method: 'GET' },
            search: { url: '/search', method: 'GET' },
          },
          auditing: {
            enabled: true,
            recordAuditJobName: 'RecordAudit',
          },
          datastreamService: 'datastreamservice',
        },
        storage: {
          serviceName: 'mongostorageservice',
        },
        search: {
          serviceName: 'solrsearchservice',
        },
        queue: {
          serviceName: 'agendaqueueservice',
        },
        redbox: {
          apiKey: 'test-api-key',
        },
        jsonld: {
          addJsonLdContext: false,
          contexts: {},
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
      },
      services: {
        brandingservice: {
          getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
          getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
          getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
        },
        mongostorageservice: mockStorageService,
        solrsearchservice: mockSearchService,
        agendaqueueservice: mockQueueService,
        datastreamservice: mockDatastreamService,
      },
    });

    mockRecord = {
      find: sinon.stub(),
      findOne: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
      destroy: sinon.stub(),
    };

    setupServiceTestGlobals(mockSails);
    (global as any).Record = mockRecord;
    (global as any).RecordType = {
      findOne: sinon.stub().resolves({ name: 'rdmp', packageType: 'rdmp' }),
    };
    (global as any).WorkflowStep = {
      findOne: sinon.stub().resolves({ name: 'draft', config: {} }),
    };
    (global as any).BrandingService = {
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    const defaultForm: FormAttributes = {
      id: 'form-default-form',
      name: 'default-form',
      branding: 'brand-1',
      attachmentFields: [],
    };
    mockFormsService = {
      getForm: sinon
        .stub<Parameters<FormsServiceTypes.Forms['getForm']>, ReturnType<FormsServiceTypes.Forms['getForm']>>()
        .resolves(defaultForm),
      getFormByName: sinon
        .stub<
          Parameters<FormsServiceTypes.Forms['getFormByName']>,
          ReturnType<FormsServiceTypes.Forms['getFormByName']>
        >()
        .returns(of(defaultForm)),
    };
    Object.assign(globalThis, { FormsService: mockFormsService });
    (global as any).RolesService = {
      getAdminFromBrand: sinon.stub().returns({ id: 'role-admin', name: 'Admin' }),
      getRole: sinon.stub().returns(null),
    };
    (global as any).UsersService = {
      hasRole: sinon.stub().returns(true),
      getUserWithUsername: sinon.stub().returns(of(null)),
    };
    (global as any).WorkflowStepsService = {
      getAllForRecordType: sinon.stub().returns(
        of([
          { name: 'draft', starting: true, config: { form: 'default-form' } },
          { name: 'published', config: { form: 'published-form' } },
        ])
      ),
      getFirst: sinon.stub().returns(
        of({
          name: 'draft',
          config: {
            form: 'default-form',
            addJsonLdContext: false,
            authorization: { viewRoles: [], editRoles: [] },
          },
        })
      ),
      get: sinon.stub().callsFake((_recordType: unknown, step: string) =>
        of({
          name: step,
          config: {
            form: step === 'draft' ? 'default-form' : `${step}-form`,
            workflow: { stage: step },
            authorization: { transitionRoles: [], viewRoles: [], editRoles: [] },
          },
        })
      ),
    };
    (global as any).RecordTypesService = {
      get: sinon.stub().returns(of({ name: 'rdmp', hooks: {} })),
    };
    const recordValidationResolve = sinon.stub<[request: RecordValidationRequest], Promise<RecordValidationResult>>();
    recordValidationResolve.resolves({
      status: 'unresolved',
      shouldBlock: false,
      mode: 'shadow',
      diagnostics: [],
    });
    mockRecordValidationService = {
      resolve: recordValidationResolve,
    };
    (global as any).RecordValidationService = mockRecordValidationService;
    mockSails.services.recordvalidationservice = mockRecordValidationService;
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key),
    };
    (global as any).RedboxJavaStorageService = mockStorageService;
    (global as any).SolrSearchService = mockSearchService;

    // Import after mocks are set up
    const { Services } = require('../../src/services/RecordsService');
    RecordsService = new Services.Records();
    RecordsService.storageService = mockStorageService;
    RecordsService.searchService = mockSearchService;
    RecordsService.queueService = mockQueueService;
    RecordsService.datastreamService = mockDatastreamService;
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).Record;
    delete (global as any).RecordType;
    delete (global as any).WorkflowStep;
    delete (global as any).BrandingService;
    delete (global as any).FormsService;
    delete (global as any).RolesService;
    delete (global as any).UsersService;
    delete (global as any).WorkflowStepsService;
    delete (global as any).RecordTypesService;
    delete (global as any).RecordValidationService;
    delete (global as any).DomSanitizerService;
    delete (global as any).TranslationService;
    delete (global as any).RedboxJavaStorageService;
    delete (global as any).SolrSearchService;
    delete (globalThis as any).__w05Hooks;
    sinon.restore();
  });

  function enableLifecycleStorage() {
    mockStorageService.getCapabilities = sinon.stub().returns({
      recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
    });
    mockStorageService.getTombstone = sinon.stub().resolves(null);
    mockStorageService.getLifecycleTombstones = sinon.stub().resolves([]);
    mockStorageService.getMeta.resolves({
      redboxOid: 'record-123',
      revision: 1,
      metadata: { title: 'Test' },
      metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
      authorization: { edit: ['user-1'], view: ['user-1'], editRoles: [], viewRoles: [] },
      workflow: { stage: 'draft' },
    });
  }

  describe('constructor', function () {
    it('should set logHeader', function () {
      expect(RecordsService.logHeader).to.equal('RecordsService::');
    });

    it('registers detached-fiber teardown on the Sails lower lifecycle', function () {
      const supervisor = (RecordsService as any).hookExecutionSupervisor;
      const interruptAll = sinon.spy(supervisor, 'interruptAll');
      RecordsService.init();
      const lowerRegistration = mockSails.on.getCalls().find((call: any) => call.args[0] === 'lower');

      expect(lowerRegistration).to.not.equal(undefined);
      lowerRegistration.args[1]();
      expect(interruptAll.calledOnce).to.equal(true);
      interruptAll.restore();
    });
  });

  describe('record validation rollout audit', function () {
    it('resolves durable storage when bootstrap runs before the Sails ready event', async function () {
      RecordsService.storageService = undefined;

      const result = await RecordsService.auditRecordValidationRollout([{ name: 'dataset' }]);

      expect(result.status).to.equal('audited');
      expect(RecordsService.storageService).to.equal(mockStorageService);
      expect(mockStorageService.createRecordAudit.calledOnce).to.equal(true);
    });

    it('durably records only normalized rollout modes and skips an unchanged fingerprint', async function () {
      mockSails.config.recordValidation = {
        mode: 'shadow',
        timeoutMs: 5_000,
        shadowReportMaxSeries: 1_000,
        operations: { publish: { mode: 'enforce', secret: 'must-not-audit' } },
      };
      const recordTypes = [
        {
          name: 'dataset',
          recordValidation: {
            mode: 'shadow',
            operations: {
              submit: { mode: 'enforce', enabledValidationGroups: ['private-group'], roles: ['private-role'] },
            },
          },
          privateConfiguration: 'must-not-audit',
        },
      ];

      const first = await RecordsService.auditRecordValidationRollout(recordTypes);

      expect(first.status).to.equal('audited');
      expect(first.fingerprint).to.match(/^[a-f0-9]{64}$/);
      expect(mockStorageService.createRecordAudit.calledOnce).to.equal(true);
      const audit = mockStorageService.createRecordAudit.firstCall.args[0];
      expect(audit.redboxOid).to.equal('record-validation-rollout');
      expect(audit.action).to.equal('validation-mode-changed');
      expect(audit.record.recordValidationRollout).to.deep.include({
        schemaVersion: 1,
        fingerprint: first.fingerprint,
        changeType: 'baseline',
      });
      expect(audit.record.recordValidationRollout.snapshot.global).to.deep.equal({
        mode: 'shadow',
        operations: [{ operation: 'publish', mode: 'enforce' }],
        malformedOperationCount: 0,
      });
      expect(audit.record.recordValidationRollout.snapshot.recordTypes).to.deep.equal([
        {
          recordType: 'dataset',
          rollout: {
            mode: 'shadow',
            operations: [{ operation: 'submit', mode: 'enforce' }],
            malformedOperationCount: 0,
          },
        },
      ]);
      expect(JSON.stringify(audit)).not.to.match(/must-not-audit|private-group|private-role|privateConfiguration/);

      mockStorageService.createRecordAudit.resetHistory();
      mockStorageService.getRecordAudit.resolves([audit]);
      const unchanged = await RecordsService.auditRecordValidationRollout(recordTypes);
      expect(unchanged).to.deep.equal({ status: 'unchanged', fingerprint: first.fingerprint });
      expect(mockStorageService.createRecordAudit.notCalled).to.equal(true);
    });

    it('links mode changes to the previous fingerprint and fails closed without durable confirmation', async function () {
      mockSails.config.recordValidation = { mode: 'shadow' };
      const baseline = await RecordsService.auditRecordValidationRollout([{ name: 'dataset' }]);
      const baselineAudit = mockStorageService.createRecordAudit.firstCall.args[0];
      mockStorageService.getRecordAudit.resolves([baselineAudit]);
      mockStorageService.createRecordAudit.resetHistory();
      mockSails.config.recordValidation = { mode: 'enforce' };

      const changed = await RecordsService.auditRecordValidationRollout([{ name: 'dataset' }]);
      expect(changed.status).to.equal('audited');
      const changedAudit = mockStorageService.createRecordAudit.firstCall.args[0];
      expect(changedAudit.record.recordValidationRollout).to.deep.include({
        changeType: 'mode-change',
        previousFingerprint: baseline.fingerprint,
      });

      mockStorageService.getRecordAudit.resolves([changedAudit]);
      mockStorageService.createRecordAudit.resolves(undefined);
      mockSails.config.recordValidation = { mode: 'shadow' };
      let failure: unknown;
      try {
        await RecordsService.auditRecordValidationRollout([{ name: 'dataset' }]);
      } catch (error) {
        failure = error;
      }
      expect(failure).to.be.instanceOf(Error);
      expect((failure as Error).message).to.equal('Durable record-validation rollout audit was not confirmed.');
    });
  });

  describe('getDeletedRecordMeta', function () {
    it('returns deleted record metadata from storage', async function () {
      const result = await RecordsService.getDeletedRecordMeta('deleted-record-123');

      expect(mockStorageService.getDeletedRecordMeta.calledOnceWithExactly('deleted-record-123')).to.be.true;
      expect(result).to.deep.equal({ redboxOid: 'deleted-record-123' });
    });

    it('does not query storage for an empty oid', async function () {
      const result = await RecordsService.getDeletedRecordMeta('');

      expect(mockStorageService.getDeletedRecordMeta.called).to.be.false;
      expect(result).to.equal(null);
    });

    it('propagates storage lookup failures', async function () {
      mockStorageService.getDeletedRecordMeta.rejects(new Error('storage unavailable'));

      let caught: unknown;
      try {
        await RecordsService.getDeletedRecordMeta('deleted-record-123');
      } catch (error) {
        caught = error;
      }

      expect(caught).to.be.an('error').with.property('message', 'storage unavailable');
    });
  });

  describe('describeError', function () {
    it('should truncate circular cause chains', function () {
      const error = Object.assign(new Error('upload failed'), { name: 'UploadError' }) as Error & { cause?: unknown };
      error.cause = error;

      const result = RecordsService.describeError(error);

      expect(result).to.include('UploadError: upload failed');
      expect(result).to.include('[cause chain truncated]');
    });
  });

  describe('getStorageService', function () {
    it('should use configured storage service', function () {
      RecordsService.getStorageService();

      expect(RecordsService.storageService).to.exist;
    });

    it('should fallback to RedboxJavaStorageService when not configured', function () {
      mockSails.config.storage = {};

      RecordsService.getStorageService();

      expect(RecordsService.storageService).to.equal(mockStorageService);
    });
  });

  describe('getDatastreamService', function () {
    it('should use configured datastream service', function () {
      RecordsService.getDatastreamService();

      expect(RecordsService.datastreamService).to.exist;
    });
  });

  describe('getMeta', function () {
    it('should get record metadata', async function () {
      const oid = 'record-123';

      const result = await RecordsService.getMeta(oid);

      expect(mockStorageService.getMeta.calledWith(oid)).to.be.true;
      expect(result).to.have.property('metadata');
    });
  });

  describe('getRecordAudit', function () {
    it('should get record audit', async function () {
      const params = { oid: 'record-123' };

      await RecordsService.getRecordAudit(params);

      expect(mockStorageService.getRecordAudit.calledWith(params)).to.be.true;
    });
  });

  describe('getResolvedPermissionsSummary', function () {
    it('resolves edit and view users while preserving roles and pending lists', async function () {
      mockStorageService.getMeta.resolves({
        redboxOid: 'record-123',
        authorization: {
          edit: ['editor'],
          view: ['viewer'],
          editPending: ['pending-editor'],
          viewPending: ['pending-viewer'],
          editRoles: ['Admin'],
          viewRoles: ['Researcher'],
        },
      });
      (global as any).UsersService.getUserWithUsername
        .withArgs('editor')
        .returns(of({ name: 'Editor', email: 'editor@example.com' }));
      (global as any).UsersService.getUserWithUsername
        .withArgs('viewer')
        .returns(of({ name: 'Viewer', email: 'viewer@example.com' }));

      const result = await RecordsService.getResolvedPermissionsSummary('record-123');

      expect(result).to.deep.equal({
        edit: [{ username: 'editor', name: 'Editor', email: 'editor@example.com' }],
        view: [{ username: 'viewer', name: 'Viewer', email: 'viewer@example.com' }],
        editPending: ['pending-editor'],
        viewPending: ['pending-viewer'],
        editRoles: ['Admin'],
        viewRoles: ['Researcher'],
      });
    });

    it('falls back to blank user details when a username cannot be resolved', async function () {
      mockStorageService.getMeta.resolves({
        redboxOid: 'record-123',
        authorization: {
          edit: ['missing-user'],
          view: [],
          editPending: [],
          viewPending: [],
          editRoles: [],
          viewRoles: [],
        },
      });
      (global as any).UsersService.getUserWithUsername.withArgs('missing-user').returns(of(null));

      const result = await RecordsService.getResolvedPermissionsSummary('record-123');

      expect(result.edit).to.deep.equal([{ username: 'missing-user', name: '', email: '' }]);
      expect(result.view).to.deep.equal([]);
    });
  });

  describe('getRecords', function () {
    it('should get records with parameters', async function () {
      const result = await RecordsService.getRecords('draft', 'rdmp', 0, 10, 'user1', [], {});

      expect(mockStorageService.getRecords.called).to.be.true;
    });
  });

  describe('getAttachments', function () {
    it('should return empty array when no datastreams', async function () {
      mockDatastreamService.listDatastreams.resolves([]);

      const result = await RecordsService.getAttachments('record-123');

      expect(result).to.be.an('array').that.is.empty;
    });

    it('should format datastreams as attachments', async function () {
      mockDatastreamService.listDatastreams.resolves([
        {
          uploadDate: new Date().toISOString(),
          metadata: { name: 'file.pdf', mimeType: 'application/pdf' },
        },
      ]);

      const result = await RecordsService.getAttachments('record-123');

      expect(result).to.have.length(1);
      expect(result[0]).to.have.property('label', 'file.pdf');
      expect(result[0]).to.have.property('contentType', 'application/pdf');
    });

    it('should preserve the normalized dateUpdated when metadata also provides a dateUpdated value', async function () {
      mockDatastreamService.listDatastreams.resolves([
        {
          uploadDate: '2026-05-13T07:01:32.533Z',
          metadata: {
            name: 'file.pdf',
            mimeType: 'application/pdf',
            dateUpdated: '2001-01-01T00:00:00.000Z',
          },
        },
      ]);

      const result = await RecordsService.getAttachments('record-123');

      expect(result).to.have.length(1);
      expect(result[0]).to.have.property('dateUpdated', '2026-05-13T07:01:32.533Z');
    });

    it('should use lastModified when a datastream does not provide uploadDate', async function () {
      mockDatastreamService.listDatastreams.resolves([
        {
          lastModified: '2026-05-13T07:01:32.533Z',
          metadata: { name: 'file.pdf', mimeType: 'application/pdf' },
        },
      ]);

      const result = await RecordsService.getAttachments('record-123');

      expect(result).to.have.length(1);
      expect(new Date(result[0].dateUpdated as string).toISOString()).to.equal('2026-05-13T07:01:32.533Z');
    });

    it('should filter by label when provided', async function () {
      mockDatastreamService.listDatastreams.resolves([
        { label: 'matched-file.pdf', uploadDate: new Date().toISOString(), metadata: { name: 'matched-file.pdf' } },
        { label: 'other-file.txt', uploadDate: new Date().toISOString(), metadata: { name: 'other-file.txt' } },
      ]);

      const result = await RecordsService.getAttachments('record-123', 'matched');

      expect(result).to.have.length(1);
    });
  });

  describe('hasEditAccess', function () {
    it('should return true for record owner', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'testuser', roles: [] };
      const record = {
        authorization: {
          edit: ['testuser'],
          view: ['testuser'],
        },
      };

      const result = RecordsService.hasEditAccess(brand, user, [], record);

      expect(result).to.be.true;
    });

    it('should return true for user with edit role', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const adminRole = { id: 'role-admin', name: 'Admin' };
      const user = { username: 'adminuser', roles: [adminRole] };
      const record = {
        authorization: {
          edit: ['otheruser'],
          view: ['otheruser'],
          editRoles: ['Admin'],
        },
      };

      // Mock RolesService.getRole to return the admin role
      (global as any).RolesService.getRole = sinon.stub().returns(adminRole);

      const result = RecordsService.hasEditAccess(brand, user, [adminRole], record);

      expect(result).to.be.true;
    });

    it('should return false for unauthorized user', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'regularuser', roles: [] };
      const record = {
        authorization: {
          edit: ['otheruser'],
          view: ['otheruser'],
        },
      };

      const result = RecordsService.hasEditAccess(brand, user, [], record);

      expect(result).to.be.false;
    });

    it('should handle flat authorization structure (Solr format)', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'testuser', roles: [] };
      const record = {
        authorization_edit: ['testuser'],
        authorization_view: ['testuser'],
      };

      const result = RecordsService.hasEditAccess(brand, user, [], record);

      expect(result).to.be.true;
    });
  });

  describe('hasViewAccess', function () {
    it('should return true for record viewer', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'viewer', roles: [] };
      const record = {
        authorization: {
          edit: ['owner'],
          view: ['owner', 'viewer'],
        },
      };

      const result = RecordsService.hasViewAccess(brand, user, [], record);

      expect(result).to.be.true;
    });

    it('should return true for editors (editors can also view)', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'editor', roles: [] };
      const record = {
        authorization: {
          edit: ['editor'],
          view: ['viewer'],
        },
      };

      const result = RecordsService.hasViewAccess(brand, user, [], record);

      expect(result).to.be.true;
    });

    it('should return false for unauthorized user', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'stranger', roles: [] };
      const record = {
        authorization: {
          edit: ['owner'],
          view: ['viewer'],
        },
      };

      const result = RecordsService.hasViewAccess(brand, user, [], record);

      expect(result).to.be.false;
    });

    it('should handle flat authorization structure (Solr format)', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'viewer', roles: [] };
      const record = {
        authorization_edit: ['owner'],
        authorization_view: ['owner', 'viewer'],
      };

      const result = RecordsService.hasViewAccess(brand, user, [], record);

      expect(result).to.be.true;
    });
  });

  describe('auditRecord', function () {
    it('should queue audit job when enabled', function () {
      const record = { metadata: { title: 'Test' } };
      const user = { username: 'testuser' };

      RecordsService.auditRecord('record-123', record, user, 'updated');

      expect(mockQueueService.now.called).to.be.true;
      expect(mockQueueService.now.firstCall.args[0]).to.equal('RecordAudit');
    });

    it('should not queue when auditing is disabled', function () {
      mockSails.config.record.auditing.enabled = false;

      RecordsService.auditRecord('record-123', {}, {}, 'updated');

      expect(mockQueueService.now.called).to.be.false;
    });

    it('should skip when queue service is null', function () {
      RecordsService.queueService = null;

      expect(() => {
        RecordsService.auditRecord('record-123', {}, {}, 'updated');
      }).to.not.throw();
    });

    it('should remove password and token from user', function () {
      const user = { username: 'testuser', password: 'secret', token: 'token123' };

      RecordsService.auditRecord('record-123', {}, user, 'updated');

      expect(user.password).to.be.undefined;
      expect(user.token).to.be.undefined;
    });
  });

  describe('storeRecordAudit', function () {
    it('should store audit via storage service', function () {
      const job = {
        attrs: {
          data: { id: 'record-123', action: 'updated' },
        },
      };

      RecordsService.storeRecordAudit(job);

      expect(mockStorageService.createRecordAudit.called).to.be.true;
    });
  });

  describe('hasPostSaveSyncHooks', function () {
    it('should return true when hooks are configured', function () {
      const recordType = {
        hooks: {
          onUpdate: {
            postSync: [{ function: 'someFunction' }],
          },
        },
      };

      const result = RecordsService.hasPostSaveSyncHooks(recordType, 'onUpdate');

      expect(result).to.be.true;
    });

    it('should return false when no hooks configured', function () {
      const recordType = {
        hooks: {},
      };

      const result = RecordsService.hasPostSaveSyncHooks(recordType, 'onUpdate');

      expect(result).to.be.false;
    });

    it('should return false for empty hooks array', function () {
      const recordType = {
        hooks: {
          onUpdate: {
            postSync: [],
          },
        },
      };

      const result = RecordsService.hasPostSaveSyncHooks(recordType, 'onUpdate');

      expect(result).to.be.false;
    });
  });

  describe('addAuthFilter', function () {
    it('should add username-based authorization filter', function () {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles = [{ name: 'Admin', branding: 'brand-1' }];
      const brand = { id: 'brand-1' };

      const result = (RecordsService as any).addAuthFilter(url, username, roles, brand);

      expect(result).to.include('authorization_edit:testuser');
      expect(result).to.include('authorization_view:testuser');
    });

    it('should exclude view when editAccessOnly is true', function () {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles: any[] = [];
      const brand = { id: 'brand-1' };

      const result = (RecordsService as any).addAuthFilter(url, username, roles, brand, true);

      expect(result).to.include('authorization_edit:testuser');
      expect(result).to.not.include('authorization_view:testuser');
    });
  });

  describe('getOptions', function () {
    it('should build request options', function () {
      const result = (RecordsService as any).getOptions('http://localhost/api', 'GET');

      expect(result).to.have.property('method', 'GET');
      expect(result).to.have.property('url', 'http://localhost/api');
      expect(result.headers).to.have.property('Authorization');
    });

    it('should replace $oid placeholder', function () {
      const result = (RecordsService as any).getOptions('http://localhost/api/$oid', 'GET', 'record-123');

      expect(result.url).to.include('record-123');
      expect(result.url).to.not.include('$oid');
    });

    it('should replace $packageType placeholder', function () {
      const result = (RecordsService as any).getOptions('http://localhost/api/$packageType', 'GET', null, 'rdmp');

      expect(result.url).to.include('rdmp');
      expect(result.url).to.not.include('$packageType');
    });
  });

  describe('luceneEscape', function () {
    it('should escape special characters', function () {
      const result = (RecordsService as any).luceneEscape('test+query');

      expect(result).to.include('\\');
    });
  });

  describe('initRecordMetaMetadata', function () {
    it('should initialize meta metadata with required fields', function () {
      const recordType = {
        name: 'rdmp',
        packageType: 'rdmp',
        packageName: 'RDMP',
        searchCore: 'default',
      };
      const workflowStep = {
        config: { form: 'default-form' },
      };
      const form = {
        configuration: {
          attachmentFields: ['dataLocations'],
        },
      };

      const result = (RecordsService as any).initRecordMetaMetadata(
        'brand-1',
        'testuser',
        recordType,
        workflowStep,
        form,
        '2024-01-01T00:00:00Z'
      );

      expect(result).to.have.property('brandId', 'brand-1');
      expect(result).to.have.property('createdBy', 'testuser');
      expect(result).to.have.property('type', 'rdmp');
      expect(result).to.have.property('packageType', 'rdmp');
      expect(result).to.have.property('form', 'default-form');
      expect(result).to.have.property('attachmentFields', form.configuration.attachmentFields);
    });

    it('falls back to top-level attachmentFields when configuration is absent', function () {
      const recordType = {
        name: 'rdmp',
        packageType: 'rdmp',
        packageName: 'RDMP',
        searchCore: 'default',
      };
      const workflowStep = {
        config: { form: 'default-form' },
      };
      const form = {
        attachmentFields: ['dataLocations'],
      };

      const result = (RecordsService as any).initRecordMetaMetadata(
        'brand-1',
        'testuser',
        recordType,
        workflowStep,
        form,
        '2024-01-01T00:00:00Z'
      );

      expect(result).to.have.property('attachmentFields', form.attachmentFields);
    });
  });

  describe('bindPendingAttachmentOids', function () {
    it('rebinds pending attachment URLs and clears the pending flag', function () {
      const metadata = {
        attachments: [
          {
            pending: true,
            location: '/record/pending-oid/attach/file-123',
            uploadUrl: 'http://localhost/record/pending-oid/attach/file-123',
            fileId: 'file-123',
          },
        ],
      };

      (RecordsService as any).bindPendingAttachmentOids(metadata, ['attachments'], 'oid-100');

      expect(metadata.attachments[0]).to.deep.include({
        pending: false,
        location: '/record/oid-100/attach/file-123',
        uploadUrl: 'http://localhost/record/oid-100/attach/file-123',
      });
    });
  });

  describe('attachment save helpers', function () {
    it('assigns stable attachment IDs and rejects invalid or duplicate IDs', function () {
      const record = {
        metadata: {
          attachments: [{ fileId: 'file-1' }, { attachmentId: 'valid-2', fileId: 'file-2' }],
        },
      };

      (RecordsService as any).ensureAttachmentIds(record, ['attachments']);

      expect(record.metadata.attachments[0].attachmentId).to.match(/^[0-9a-f-]{36}$/i);
      expect(record.metadata.attachments[1].attachmentId).to.equal('valid-2');
      expect(() =>
        (RecordsService as any).ensureAttachmentIds(
          { metadata: { attachments: [{ attachmentId: 'bad id', fileId: 'file-1' }] } },
          ['attachments']
        )
      ).to.throw('Invalid attachment identity');
      expect(() =>
        (RecordsService as any).ensureAttachmentIds(
          {
            metadata: {
              attachments: [
                { attachmentId: 'same', fileId: 'file-1' },
                { attachmentId: 'same', fileId: 'file-2' },
              ],
            },
          },
          ['attachments']
        )
      ).to.throw('Duplicate attachment identity');
    });

    it('plans unresolved work before replacements and deletions', function () {
      const plan = (RecordsService as any).attachmentMutationPlan(
        { metadata: { attachments: [{ attachmentId: 'old', fileId: 'old-file' }] } },
        {
          metadata: {
            attachments: [
              { attachmentId: 'new', fileId: 'new-file', pending: true },
              { attachmentId: 'old', fileId: 'replacement-file' },
            ],
          },
        },
        ['attachments'],
        'record-1',
        'generation-1',
        [
          {
            attachmentId: 'retry',
            mutationFileId: 'retry-file',
            operation: 'finalize',
            mutationState: 'unknown',
            generation: 'retry-generation',
            attachmentField: 'attachments',
          },
        ]
      );

      expect(plan.map((item: any) => `${item.operation}:${item.fileId}`)).to.deep.equal([
        'finalize:retry-file',
        'finalize:new-file',
        'add:replacement-file',
        'delete:old-file',
      ]);
    });

    it('journals and executes add/delete attachment operations', async function () {
      const journal = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation: sinon.stub().resolves(true),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      const plan = [
        {
          field: 'attachments',
          attachmentId: 'a',
          fileId: 'new-file',
          operation: 'add',
          generation: 'g',
          entry: { fileId: 'new-file' },
        },
        {
          field: 'attachments',
          attachmentId: 'a',
          fileId: 'old-file',
          operation: 'delete',
          generation: 'g',
          entry: { fileId: 'old-file' },
        },
      ];

      await (RecordsService as any).prepareAttachmentJournal('record-1', plan);
      const result = await (RecordsService as any).executeAttachmentPlan('record-1', plan);

      expect(journal.prepareMutations.calledOnce).to.equal(true);
      expect(result.map((item: any) => item.status)).to.deep.equal(['completed', 'completed']);
      expect(mockDatastreamService.addDatastream.calledOnce).to.equal(true);
      expect(mockDatastreamService.removeDatastream.calledOnce).to.equal(true);
      expect(journal.markMutation.callCount).to.equal(4);
    });

    it('reports unknown attachment work and tracks incomplete references', async function () {
      const journal = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation: sinon.stub().rejects(new Error('journal unavailable')),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().rejects(new Error('upload failed'));
      const plan = [
        {
          field: 'attachments',
          attachmentId: 'a',
          fileId: 'file-1',
          operation: 'add',
          generation: 'g',
          entry: { fileId: 'file-1' },
        },
      ];

      const result = await (RecordsService as any).executeAttachmentPlan('record-1', plan);

      expect(result[0].status).to.equal('incomplete');
      expect(result[0].code).to.equal('attachment-generation-not-current');
      expect(mockSails.log.error.called).to.equal(true);
      expect(
        (RecordsService as any).incompleteAttachmentItems(
          [{ field: 'attachments', attachmentId: 'a', operation: 'add', status: 'completed' }],
          'reference-failed'
        )
      ).to.deep.equal([
        { field: 'attachments', attachmentId: 'a', operation: 'add', status: 'incomplete', code: 'reference-failed' },
      ]);
    });
  });

  describe('checkRedboxRunning', function () {
    it('should return true when storage plugin is configured', async function () {
      mockSails.config.storage = { serviceName: 'mongostorageservice' };

      const result = await RecordsService.checkRedboxRunning();

      expect(result).to.be.true;
    });
  });

  describe('bootstrapData', function () {
    it('should return without create when bootstrap directory is missing', async function () {
      const missingBootstrapPath = path.join(
        os.tmpdir(),
        `records-bootstrap-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      mockSails.config.bootstrap = { bootstrapDataPath: missingBootstrapPath };
      const createStub = sinon.stub(RecordsService, 'create');

      await RecordsService.bootstrapData();

      expect(createStub.called).to.be.false;
      expect(mockSails.log.verbose.called).to.be.true;
    });

    it('should create records from record-type named file arrays', async function () {
      const bootstrapPath = await fs.mkdtemp(path.join(os.tmpdir(), 'records-bootstrap-'));
      const recordsPath = path.join(bootstrapPath, 'records');
      await fs.mkdir(recordsPath, { recursive: true });
      await fs.writeFile(
        path.join(recordsPath, 'party.json'),
        JSON.stringify([{ title: 'Party one' }, { title: 'Party two' }])
      );
      mockSails.config.bootstrap = { bootstrapDataPath: bootstrapPath };

      mockRecord.findOne.onFirstCall().returns(createQueryObject(null));
      mockRecord.findOne.onSecondCall().returns(createQueryObject(null));
      const createStub = sinon.stub(RecordsService, 'create').resolves({ isSuccessful: () => true });
      (global as any).RecordTypesService.get = sinon.stub().returns(of({ name: 'party', hooks: {} }));
      try {
        await RecordsService.bootstrapData();

        expect(createStub.callCount).to.equal(2);
        const firstCreateArgs = createStub.firstCall.args;
        expect(firstCreateArgs[1].metadata.title).to.equal('Party one');
        expect(firstCreateArgs[1].redboxOid).to.equal('bootstrap-party-1');
        expect(firstCreateArgs[2].name).to.equal('party');
        expect(firstCreateArgs[7]).to.deep.include({ routeFamily: 'internal', operation: 'create' });
        expect(firstCreateArgs[7].validationBypass).to.deep.equal({
          mode: 'bypass',
          reason: 'trusted-data-migration',
          actor: { kind: 'service', id: 'RecordsService.bootstrapData' },
        });
      } finally {
        await fs.rm(bootstrapPath, { recursive: true, force: true });
      }
    });

    it('seeds in shadow and enforce schema modes through a direct durable internal bypass audit', async function () {
      mockSails.config.recordSchema = { enabled: true };
      mockSails.config.record.auditing.enabled = false;
      (global as any).RecordTypesService.get = sinon
        .stub()
        .returns(of({ name: 'party', hooks: {}, searchable: false }));
      (global as any).RecordValidationService.resolve.resolves({
        status: 'unresolved',
        shouldBlock: true,
        mode: 'enforce',
        diagnostics: [],
      });
      const resolveCreate = sinon.stub().rejects(new Error('structural schema resolution must be bypassed'));
      const validateResolvedArtifact = sinon.stub();
      mockSails.services.recordschemaservice = { resolveCreate, validateResolvedArtifact };

      for (const mode of ['shadow', 'enforce'] as const) {
        const bootstrapPath = await fs.mkdtemp(path.join(os.tmpdir(), `records-bootstrap-${mode}-`));
        const recordsPath = path.join(bootstrapPath, 'records');
        await fs.mkdir(recordsPath, { recursive: true });
        await fs.writeFile(path.join(recordsPath, 'party.json'), JSON.stringify([{ title: `${mode} seed` }]));
        mockSails.config.bootstrap = { bootstrapDataPath: bootstrapPath };
        mockSails.config.recordValidation = { mode };
        mockRecord.findOne.reset();
        mockRecord.findOne.returns(createQueryObject(null));
        mockStorageService.create.resetHistory();
        mockStorageService.createRecordAudit.resetHistory();

        try {
          await RecordsService.bootstrapData();

          expect(mockStorageService.create.calledOnce, mode).to.equal(true);
          expect((global as any).RecordValidationService.resolve.notCalled, mode).to.equal(true);
          expect(resolveCreate.notCalled, mode).to.equal(true);
          expect(validateResolvedArtifact.notCalled, mode).to.equal(true);
          expect(mockStorageService.createRecordAudit.calledOnce, mode).to.equal(true);
          const audit = mockStorageService.createRecordAudit.firstCall.args[0];
          expect(audit.action).to.equal('validation-bypassed');
          expect(audit.record.validationBypass).to.deep.include({
            reason: 'trusted-data-migration',
            operation: 'create',
          });
          expect(audit.record.validationBypass.actor).to.deep.equal({
            kind: 'service',
            id: 'RecordsService.bootstrapData',
          });
        } finally {
          await fs.rm(bootstrapPath, { recursive: true, force: true });
        }
      }
    });

    it('should skip existing records by redboxOid', async function () {
      const bootstrapPath = await fs.mkdtemp(path.join(os.tmpdir(), 'records-bootstrap-'));
      const recordsPath = path.join(bootstrapPath, 'records');
      await fs.mkdir(recordsPath, { recursive: true });
      await fs.writeFile(path.join(recordsPath, 'grant.json'), JSON.stringify([{ title: 'Grant one' }]));
      mockSails.config.bootstrap = { bootstrapDataPath: bootstrapPath };

      mockRecord.findOne.returns(createQueryObject({ redboxOid: 'bootstrap-grant-1' }));
      const createStub = sinon.stub(RecordsService, 'create');
      try {
        await RecordsService.bootstrapData();

        expect(createStub.called).to.be.false;
      } finally {
        await fs.rm(bootstrapPath, { recursive: true, force: true });
      }
    });
  });

  describe('delete', function () {
    beforeEach(function () {
      enableLifecycleStorage();
    });

    it('should delete record if user has access', async function () {
      const user = { username: 'admin' };
      const record = {
        metaMetadata: { brandId: 'brand-1' },
        metadata: {},
      };

      sinon.stub(RecordsService, 'getMeta').resolves(record);
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);

      const result = await RecordsService.delete('record-123', user);

      expect(mockStorageService.createTombstone.calledOnce).to.be.true;
      expect(mockStorageService.removeActiveRecord.calledOnce).to.be.true;
      expect(mockStorageService.updateTombstone.calledOnce).to.be.true;
      expect(mockStorageService.delete.notCalled).to.be.true;
      expect(mockStorageService.createTombstone.firstCall.args[3].precondition).to.deep.equal({
        requireRevision: true,
        expectedRevision: 1,
      });
      expect(mockStorageService.removeActiveRecord.firstCall.args[2].precondition).to.deep.equal({
        requireRevision: true,
        expectedRevision: 1,
      });
      expect(mockSearchService.remove.calledWith('record-123')).to.be.true;
      expect(result).to.have.property('success', true);

      (RecordsService.getMeta as any).restore();
      (RecordsService.hasEditAccess as any).restore();
    });

    it('does not reject malformed detached delete hooks before deleting the record', async function () {
      const result = await RecordsService.delete(
        'record-123',
        false,
        { metadata: {} },
        { hooks: { onDelete: { post: [{ function: '({ invalid: true })' }] } } },
        { username: 'admin' }
      );

      expect(result.success).to.equal(true);
      expect(mockStorageService.removeActiveRecord.calledWithMatch({ id: 'brand-1' }, 'record-123')).to.equal(true);
    });

    it('never throws malformed configuration from fire-and-forget post hooks', function () {
      expect(() =>
        RecordsService.triggerPostSaveTriggers(
          'record-123',
          { metadata: {} },
          { hooks: { onDelete: { post: [{ function: '({ invalid: true })' }] } } },
          'onDelete',
          { username: 'admin' }
        )
      ).not.to.throw();
    });
  });

  describe('W07 lifecycle concurrency', function () {
    beforeEach(function () {
      enableLifecycleStorage();
    });

    const lifecycleRecord = (revision = 7, brandId = 'brand-1') => ({
      redboxOid: 'record-123',
      revision,
      metadata: { title: 'Lifecycle record' },
      metaMetadata: { type: 'rdmp', form: 'default-form', brandId },
      authorization: { edit: ['user-1'], view: ['user-1'], editRoles: [], viewRoles: [] },
      workflow: { stage: 'draft' },
    });

    const publicContext = (
      operation: 'delete' | 'restore' | 'purge',
      expectedRevision?: number,
      resolution: 'direct' | 'client-manually-resolved' = 'direct'
    ) =>
      createRecordSaveContext({
        routeFamily: 'api',
        operation,
        concurrency: {
          entityTagSupplied: expectedRevision !== undefined,
          expectedRevision,
          resolution,
        },
      });

    const setMode = (mode: 'strict' | 'observe' | 'last-write-wins') => {
      mockStorageService.getCapabilities = sinon.stub().returns({
        recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
      });
      (global as any).RecordTypesService.get.returns(
        of({ name: 'rdmp', hooks: {}, searchable: false, concurrentModification: { mode } })
      );
    };

    it('requires strict lifecycle tags while tokenless observe and last-write-wins derive an authoritative CAS', async function () {
      mockStorageService.getMeta.resolves(lifecycleRecord());
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);

      setMode('strict');
      const strictMissing = await RecordsService.delete(
        'record-123',
        false,
        lifecycleRecord(),
        undefined,
        { username: 'user-1' },
        publicContext('delete')
      );
      expect(strictMissing.outcome).to.equal('not-saved');
      expect(strictMissing.problems[0].issues[0].code).to.equal('record-precondition-required');
      expect(mockStorageService.createTombstone.notCalled).to.equal(true);

      for (const mode of ['observe', 'last-write-wins'] as const) {
        mockStorageService.createTombstone.resetHistory();
        mockStorageService.removeActiveRecord.resetHistory();
        mockStorageService.updateTombstone.resetHistory();
        setMode(mode);
        const tokenless = await RecordsService.delete(
          'record-123',
          false,
          lifecycleRecord(),
          undefined,
          { username: 'user-1' },
          publicContext('delete')
        );
        expect(tokenless.outcome, mode).to.equal('saved');
        expect(mockStorageService.createTombstone.calledOnce, mode).to.equal(true);
        expect(mockStorageService.createTombstone.firstCall.args[3].precondition, mode).to.deep.equal({
          requireRevision: true,
          expectedRevision: 7,
        });
        expect(mockStorageService.removeActiveRecord.firstCall.args[2].precondition, mode).to.deep.equal({
          requireRevision: true,
          expectedRevision: 7,
        });
      }

      mockStorageService.createTombstone.resetHistory();
      setMode('last-write-wins');
      const staleExplicit = await RecordsService.delete(
        'record-123',
        false,
        lifecycleRecord(),
        undefined,
        { username: 'user-1' },
        publicContext('delete', 6)
      );
      expect(staleExplicit.outcome).to.equal('not-saved');
      expect(staleExplicit.problems[0].issues[0].code).to.equal('record-revision-stale');
      expect(mockStorageService.createTombstone.notCalled).to.equal(true);
    });

    it('allows exactly one winner in a delete/delete intent race', async function () {
      setMode('observe');
      mockStorageService.getMeta.resolves(lifecycleRecord());
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);
      let claimed = false;
      mockStorageService.createTombstone.callsFake(async (_brand: any, oid: string, tombstone: any) => {
        if (claimed) {
          return { oid, applicationState: 'not-applied', nonApplicationReason: 'lifecycle-conflict' };
        }
        claimed = true;
        return {
          success: true,
          oid,
          applicationState: 'applied',
          committedRevision: tombstone.revision,
          committedRecord: tombstone,
        };
      });

      const [first, second] = await Promise.all(
        [0, 1].map(() =>
          RecordsService.delete(
            'record-123',
            false,
            lifecycleRecord(),
            undefined,
            { username: 'user-1' },
            publicContext('delete', 7)
          )
        )
      );

      expect([first.outcome, second.outcome].sort()).to.deep.equal(['not-saved', 'saved']);
      const loser = [first, second].find(result => result.outcome === 'not-saved');
      expect(loser.problems[0].issues[0].code).to.equal('record-lifecycle-operation-conflict');
      expect(mockStorageService.removeActiveRecord.calledOnce).to.equal(true);
    });

    it('serializes incompatible restore/purge claims against the tombstone state and revision', async function () {
      setMode('observe');
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);
      const tombstone = {
        redboxOid: 'record-123',
        revision: 9,
        brandId: 'brand-1',
        lifecycleState: 'deleted',
        deletedRecordMetadata: lifecycleRecord(7),
      };
      mockStorageService.getTombstone.resolves(tombstone);
      let claimed = false;
      mockStorageService.updateTombstone.callsFake(async (_brand: any, oid: string, mutation: any) => {
        if (claimed) {
          return { oid, applicationState: 'not-applied', nonApplicationReason: 'lifecycle-conflict' };
        }
        claimed = true;
        return {
          success: true,
          oid,
          applicationState: 'applied',
          committedRevision: mutation.lifecycleOperation.targetRevision,
        };
      });

      const [restore, purge] = await Promise.all([
        RecordsService.restoreRecord(
          'record-123',
          { username: 'user-1' },
          { id: 'brand-1' },
          publicContext('restore', 9)
        ),
        RecordsService.destroyDeletedRecord(
          'record-123',
          { username: 'user-1' },
          { id: 'brand-1' },
          publicContext('purge', 9)
        ),
      ]);

      expect([restore.outcome, purge.outcome].sort()).to.deep.equal(['not-saved', 'saved']);
      expect(mockStorageService.createActiveRecordFromTombstone.calledOnce).to.equal(true);
      expect(mockDatastreamService.listDatastreams.notCalled).to.equal(true);
    });

    it('reloads and reauthorizes the winning state before projecting a lifecycle CAS loss', async function () {
      setMode('observe');
      const initial = lifecycleRecord(7);
      const accessLost = {
        ...lifecycleRecord(12),
        authorization: { edit: ['other-user'], view: ['other-user'], editRoles: [], viewRoles: [] },
      };
      mockStorageService.getMeta.onFirstCall().resolves(initial);
      mockStorageService.getMeta.onSecondCall().resolves(accessLost);
      mockStorageService.createTombstone.resolves({
        oid: 'record-123',
        applicationState: 'not-applied',
        nonApplicationReason: 'lifecycle-conflict',
      });
      const editAccess = sinon.stub(RecordsService, 'hasEditAccess');
      editAccess.onFirstCall().returns(true);
      editAccess.onSecondCall().returns(false);

      const result = await RecordsService.delete(
        'record-123',
        false,
        initial,
        undefined,
        { username: 'user-1' },
        publicContext('delete', 7)
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('record-validation-edit-unauthorized');
      expect(result.concurrency).to.equal(undefined);
      expect(result.metadata).to.equal(null);
      expect(mockStorageService.getMeta.calledTwice).to.equal(true);
      expect(mockStorageService.removeActiveRecord.notCalled).to.equal(true);
    });

    it('uses the final authoritative active reload for restore response metadata and indexing', async function () {
      setMode('observe');
      (global as any).RecordTypesService.get.returns(
        of({ name: 'rdmp', hooks: {}, searchable: true, concurrentModification: { mode: 'observe' } })
      );
      const tombstone = {
        redboxOid: 'record-123',
        revision: 9,
        brandId: 'brand-1',
        lifecycleState: 'deleted',
        deletedRecordMetadata: lifecycleRecord(7),
      };
      const finalActive = {
        ...lifecycleRecord(12),
        metadata: { title: 'Advanced immediately after restore' },
      };
      mockStorageService.getTombstone.resolves(tombstone);
      mockStorageService.getMeta.resolves(finalActive);
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);
      sinon.stub(RecordsService, 'hasViewAccess').returns(true);

      const result = await RecordsService.restoreRecord(
        'record-123',
        { username: 'user-1' },
        { id: 'brand-1' },
        publicContext('restore', 9)
      );

      expect(result.outcome).to.equal('saved');
      expect(result.concurrency?.revision).to.equal(12);
      expect(result.metadata).to.deep.equal(finalActive.metadata);
      expect(result.data).to.deep.equal(finalActive);
      expect(mockSearchService.index.calledOnceWithExactly('record-123', finalActive)).to.equal(true);
    });

    it('keeps missing, cross-brand, and access-denied lifecycle failures private', async function () {
      setMode('observe');
      const editAccess = sinon.stub(RecordsService, 'hasEditAccess').returns(true);
      mockStorageService.getMeta.rejects(new Error('not found'));
      const missing = await RecordsService.delete(
        'record-123',
        false,
        lifecycleRecord(),
        undefined,
        { username: 'user-1' },
        publicContext('delete', 7)
      );

      mockStorageService.getMeta.resolves(lifecycleRecord(7, 'brand-2'));
      const crossBrand = await RecordsService.delete(
        'record-123',
        false,
        lifecycleRecord(7, 'brand-1'),
        undefined,
        { username: 'user-1' },
        publicContext('delete', 7)
      );

      mockStorageService.getMeta.resolves(lifecycleRecord());
      editAccess.returns(false);
      const denied = await RecordsService.delete(
        'record-123',
        false,
        lifecycleRecord(),
        undefined,
        { username: 'other-user' },
        publicContext('delete', 7)
      );

      const codes = [missing, crossBrand, denied].map(result => result.problems[0].issues[0].code);
      expect(new Set(codes).size).to.equal(1);
      for (const result of [missing, crossBrand, denied]) {
        expect(result.outcome).to.equal('not-saved');
        expect(result.concurrency).to.equal(undefined);
      }
      expect(mockStorageService.createTombstone.notCalled).to.equal(true);
    });

    it('retains an ambiguous delete for recovery and returns a typed unknown outcome', async function () {
      setMode('observe');
      mockStorageService.getMeta.resolves(lifecycleRecord());
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);
      mockStorageService.removeActiveRecord.rejects(new Error('connection reset after dispatch'));

      const result = await RecordsService.delete(
        'record-123',
        false,
        lifecycleRecord(),
        undefined,
        { username: 'user-1' },
        publicContext('delete', 7)
      );

      expect(result.outcome).to.equal('unknown');
      expect(result.problems[0].issues[0].code).to.equal('record-lifecycle-unknown');
      expect(mockStorageService.updateTombstone.calledOnce).to.equal(true);
      expect(mockStorageService.updateTombstone.firstCall.args[2].lifecycleState).to.equal('recovery-required');
      expect(mockStorageService.removeTombstone.notCalled).to.equal(true);
    });

    it('preserves fresh resolution linkage in durable intent but omits request identifiers from tombstone reads', async function () {
      setMode('observe');
      mockStorageService.getMeta.resolves(lifecycleRecord());
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);
      const requestId = '11111111-1111-4111-8111-111111111111';
      const conflictRequestId = '22222222-2222-4222-8222-222222222222';
      const context = createRecordSaveContext({
        requestId,
        routeFamily: 'api',
        operation: 'delete',
        concurrency: {
          entityTagSupplied: true,
          expectedRevision: 7,
          resolution: 'client-manually-resolved',
          resolutionOfRequestId: conflictRequestId,
        },
      });

      const result = await RecordsService.delete(
        'record-123',
        false,
        lifecycleRecord(),
        undefined,
        { username: 'user-1' },
        context
      );
      expect(result.outcome).to.equal('saved');
      const durableIntent = mockStorageService.createTombstone.firstCall.args[2];
      expect(durableIntent.lifecycleOperation).to.include({
        requestId,
        resolutionOfRequestId: conflictRequestId,
        resolution: 'client-manually-resolved',
      });
      expect(durableIntent.lifecycleOperation.operationId).to.be.a('string').and.not.equal(requestId);

      mockStorageService.getTombstone.resolves({
        ...durableIntent,
        lifecycleState: 'deleted',
        revision: 9,
      });
      const read = await RecordsService.getDeletedRecordMeta('record-123', { id: 'brand-1' });
      expect(read.lifecycle).to.deep.include({ kind: 'delete', attempts: 1 });
      expect(JSON.stringify(read.lifecycle)).not.to.include(requestId);
      expect(JSON.stringify(read.lifecycle)).not.to.include(conflictRequestId);
      expect(JSON.stringify(read.lifecycle)).not.to.include(durableIntent.lifecycleOperation.operationId);
    });

    it('fails closed before dispatch when lifecycle CAS is unsupported', async function () {
      setMode('last-write-wins');
      mockStorageService.getMeta.resolves(lifecycleRecord());
      mockStorageService.getCapabilities.returns({
        recordConcurrency: {
          ...FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
          conditionalTombstoneCreate: false,
        },
      });

      const result = await RecordsService.delete(
        'record-123',
        false,
        lifecycleRecord(),
        undefined,
        { username: 'user-1' },
        publicContext('delete')
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('record-concurrency-capability-unavailable');
      expect(mockStorageService.createTombstone.notCalled).to.equal(true);
    });

    it('recovers a completed restore idempotently without creating another active record', async function () {
      const operation = {
        operationId: '33333333-3333-4333-8333-333333333333',
        kind: 'restore',
        requestId: '44444444-4444-4444-8444-444444444444',
        sourceRevision: 9,
        targetRevision: 10,
        startedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:01.000Z',
        attempts: 1,
        resolution: 'direct',
      };
      const tombstone = {
        redboxOid: 'record-123',
        revision: 10,
        brandId: 'brand-1',
        lifecycleState: 'restore-pending',
        lifecycleOperation: operation,
        deletedRecordMetadata: lifecycleRecord(7),
      };
      let present = true;
      mockStorageService.getTombstone.callsFake(async () => (present ? tombstone : null));
      mockStorageService.getMeta.resolves({
        ...lifecycleRecord(11),
        lifecycleOperationId: operation.operationId,
      });
      mockStorageService.removeTombstone.callsFake(async () => {
        present = false;
        return { success: true, oid: 'record-123', applicationState: 'applied' };
      });

      const first = await RecordsService.recoverLifecycleOperation(tombstone);
      const retry = await RecordsService.recoverLifecycleOperation(tombstone);

      expect(first).to.equal('completed');
      expect(retry).to.equal('cancelled');
      expect(mockStorageService.createActiveRecordFromTombstone.notCalled).to.equal(true);
      expect(mockStorageService.removeTombstone.calledOnce).to.equal(true);
    });

    it('never lets delete recovery remove an active record from a newer lineage', async function () {
      const operation = {
        operationId: '55555555-5555-4555-8555-555555555555',
        kind: 'delete',
        requestId: '66666666-6666-4666-8666-666666666666',
        sourceRevision: 7,
        targetRevision: 8,
        startedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:01.000Z',
        attempts: 1,
        resolution: 'direct',
      };
      const tombstone = {
        redboxOid: 'record-123',
        revision: 8,
        brandId: 'brand-1',
        lifecycleState: 'delete-pending',
        lifecycleOperation: operation,
        deletedRecordMetadata: lifecycleRecord(7),
      };
      mockStorageService.getTombstone.resolves(tombstone);
      mockStorageService.getMeta.resolves(lifecycleRecord(9));

      const recovered = await RecordsService.recoverLifecycleOperation(tombstone);

      expect(recovered).to.equal('cancelled');
      expect(mockStorageService.removeActiveRecord.notCalled).to.equal(true);
      expect(mockStorageService.removeTombstone.calledOnce).to.equal(true);
      expect(mockStorageService.removeTombstone.firstCall.args[2].lifecycle).to.deep.equal({
        expectedState: 'delete-pending',
        operationId: operation.operationId,
      });
    });

    it('retains recovery without lifecycle mutations when incarnation identity is unsafe', async function () {
      const operation = {
        operationId: '77777777-7777-4777-8777-777777777777',
        kind: 'delete',
        requestId: '88888888-8888-4888-8888-888888888888',
        sourceRevision: 7,
        targetRevision: 8,
        startedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:01.000Z',
        attempts: 1,
        resolution: 'direct',
      };
      const incarnationId = '99999999-9999-4999-8999-999999999999';
      const differentIncarnationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const baseTombstone = {
        redboxOid: 'record-123',
        revision: 8,
        incarnationId,
        brandId: 'brand-1',
        lifecycleState: 'delete-pending',
        lifecycleOperation: operation,
        deletedRecordMetadata: { ...lifecycleRecord(7), incarnationId },
      };

      const unsafeObservations = [
        { inputId: undefined, wrapperId: undefined, snapshotId: undefined, activeId: incarnationId },
        { inputId: incarnationId, wrapperId: incarnationId, snapshotId: incarnationId, activeId: undefined },
        {
          inputId: incarnationId,
          wrapperId: incarnationId,
          snapshotId: incarnationId,
          activeId: differentIncarnationId,
        },
        {
          inputId: differentIncarnationId,
          wrapperId: incarnationId,
          snapshotId: incarnationId,
          activeId: incarnationId,
        },
        {
          inputId: incarnationId,
          wrapperId: differentIncarnationId,
          snapshotId: incarnationId,
          activeId: incarnationId,
        },
        {
          inputId: incarnationId,
          wrapperId: incarnationId,
          snapshotId: differentIncarnationId,
          activeId: incarnationId,
        },
      ];

      for (const observation of unsafeObservations) {
        const input = { ...baseTombstone, incarnationId: observation.inputId };
        const reloaded = {
          ...baseTombstone,
          incarnationId: observation.wrapperId,
          deletedRecordMetadata: {
            ...baseTombstone.deletedRecordMetadata,
            incarnationId: observation.snapshotId,
          },
        };
        mockStorageService.getTombstone.resolves(structuredClone(reloaded));
        mockStorageService.getMeta.resolves({ ...lifecycleRecord(9), incarnationId: observation.activeId });
        mockStorageService.updateTombstone.resetHistory();

        const recovered = await RecordsService.recoverLifecycleOperation(input);

        expect(recovered).to.equal('retained');
        expect(mockStorageService.updateTombstone.calledOnce).to.equal(true);
        expect(mockStorageService.updateTombstone.firstCall.args[2]).to.deep.include({
          lifecycleState: 'recovery-required',
        });
        expect(mockStorageService.updateTombstone.firstCall.args[2].lifecycleOperation.errorCode).to.equal(
          'lifecycle-incarnation-inconsistent'
        );
        expect(mockStorageService.removeActiveRecord.notCalled).to.equal(true);
        expect(mockStorageService.removeTombstone.notCalled).to.equal(true);
        expect(mockStorageService.createActiveRecordFromTombstone.notCalled).to.equal(true);
      }
    });

    it('validates finalized-delete incarnation lineage before returning completed', async function () {
      const operation = {
        operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        kind: 'delete',
        requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        sourceRevision: 7,
        targetRevision: 8,
        startedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:01.000Z',
        attempts: 1,
        resolution: 'direct',
      };
      const incarnationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      const differentIncarnationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
      const finalized = {
        redboxOid: 'record-123',
        revision: 8,
        brandId: 'brand-1',
        lifecycleState: 'deleted',
        lifecycleOperation: operation,
        deletedRecordMetadata: lifecycleRecord(7),
      };

      for (const lineage of [
        { tombstoneId: undefined, activeId: incarnationId },
        { tombstoneId: incarnationId, activeId: undefined },
        { tombstoneId: incarnationId, activeId: differentIncarnationId },
      ]) {
        const tombstone = {
          ...finalized,
          incarnationId: lineage.tombstoneId,
          deletedRecordMetadata: { ...finalized.deletedRecordMetadata, incarnationId: lineage.tombstoneId },
        };
        mockStorageService.getTombstone.resolves(structuredClone(tombstone));
        mockStorageService.getMeta.resolves({ ...lifecycleRecord(9), incarnationId: lineage.activeId });
        mockStorageService.updateTombstone.resetHistory();

        const recovered = await RecordsService.recoverLifecycleOperation(tombstone);

        expect(recovered).to.equal('retained');
        expect(mockStorageService.updateTombstone.calledOnce).to.equal(true);
        expect(mockStorageService.updateTombstone.firstCall.args[2].lifecycleOperation.errorCode).to.equal(
          'lifecycle-incarnation-inconsistent'
        );
      }

      mockStorageService.getTombstone.resolves(structuredClone(finalized));
      mockStorageService.getMeta.resolves(null);
      mockStorageService.updateTombstone.resetHistory();

      expect(await RecordsService.recoverLifecycleOperation(finalized)).to.equal('completed');
      expect(mockStorageService.updateTombstone.notCalled).to.equal(true);
      expect(mockStorageService.removeActiveRecord.notCalled).to.equal(true);
      expect(mockStorageService.removeTombstone.notCalled).to.equal(true);
    });

    it('resumes an interruption after active removal but before tombstone finalization', async function () {
      setMode('observe');
      const active = lifecycleRecord(7);
      let tombstone: any;
      mockStorageService.getMeta.resolves(active);
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);
      mockStorageService.createTombstone.callsFake(async (_brand: any, oid: string, candidate: any) => {
        tombstone = structuredClone(candidate);
        return {
          success: true,
          oid,
          applicationState: 'applied',
          committedRevision: candidate.revision,
          committedRecord: candidate,
        };
      });
      mockStorageService.removeActiveRecord.resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 7,
        removedRecord: active,
      });
      mockStorageService.updateTombstone.onFirstCall().resolves({
        oid: 'record-123',
        applicationState: 'unknown',
      });

      const interrupted = await RecordsService.delete(
        'record-123',
        false,
        active,
        undefined,
        { username: 'user-1' },
        publicContext('delete', 7)
      );
      expect(interrupted.outcome).to.equal('saved-with-warnings');

      mockStorageService.getTombstone.resolves(tombstone);
      mockStorageService.getMeta.resolves(null);
      mockStorageService.updateTombstone.onSecondCall().callsFake(async (_brand: any, oid: string, mutation: any) => {
        tombstone = {
          ...tombstone,
          ...mutation,
          revision: mutation.lifecycleOperation.targetRevision,
        };
        return {
          success: true,
          oid,
          applicationState: 'applied',
          committedRevision: tombstone.revision,
          committedRecord: tombstone,
        };
      });

      const recovered = await RecordsService.recoverLifecycleOperation(tombstone);
      expect(recovered).to.equal('completed');
      expect(tombstone.lifecycleState).to.equal('deleted');
      expect(tombstone.revision).to.equal(9);
      expect(mockStorageService.removeActiveRecord.calledOnce).to.equal(true);
    });

    it('removes a purge tombstone only after every physical datastream is confirmed absent', async function () {
      setMode('observe');
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);
      const tombstone = {
        redboxOid: 'record-123',
        revision: 9,
        brandId: 'brand-1',
        lifecycleState: 'deleted',
        deletedRecordMetadata: lifecycleRecord(7),
      };
      mockStorageService.getTombstone.resolves(tombstone);
      mockDatastreamService.listDatastreams.onFirstCall().resolves([{ fileId: 'one' }, { fileId: 'two' }]);
      mockDatastreamService.listDatastreams.onSecondCall().resolves([]);

      const result = await RecordsService.destroyDeletedRecord(
        'record-123',
        { username: 'user-1' },
        { id: 'brand-1' },
        publicContext('purge', 9)
      );

      expect(result.outcome).to.equal('saved');
      expect(mockDatastreamService.removeDatastream.callCount).to.equal(2);
      expect(mockStorageService.removeTombstone.calledOnce).to.equal(true);
      expect(mockStorageService.removeTombstone.firstCall.args[2].lifecycle.expectedState).to.equal('purge-pending');
      expect(result.concurrency.revision).to.equal(undefined);
      expect(result.concurrency.entityTag).to.equal(undefined);
    });

    it('retains recoverable purge state for incomplete and unknown physical outcomes', async function () {
      setMode('observe');
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);
      const baseTombstone = {
        redboxOid: 'record-123',
        revision: 9,
        brandId: 'brand-1',
        lifecycleState: 'deleted',
        deletedRecordMetadata: lifecycleRecord(7),
      };

      for (const physical of ['incomplete', 'unknown'] as const) {
        mockStorageService.getTombstone.resolves(structuredClone(baseTombstone));
        mockStorageService.updateTombstone.resetHistory();
        mockStorageService.removeTombstone.resetHistory();
        mockDatastreamService.listDatastreams.reset();
        mockDatastreamService.removeDatastream.reset();
        mockDatastreamService.removeDatastream.resolves({ success: true });
        if (physical === 'incomplete') {
          mockDatastreamService.listDatastreams.onFirstCall().resolves([{ fileId: 'remaining' }]);
          mockDatastreamService.listDatastreams.onSecondCall().resolves([{ fileId: 'remaining' }]);
        } else {
          mockDatastreamService.listDatastreams.rejects(new Error('observation unavailable'));
        }

        const result = await RecordsService.destroyDeletedRecord(
          'record-123',
          { username: 'user-1' },
          { id: 'brand-1' },
          publicContext('purge', 9)
        );

        expect(result.outcome, physical).to.equal('saved-with-warnings');
        expect(mockStorageService.removeTombstone.notCalled, physical).to.equal(true);
        expect(mockStorageService.updateTombstone.calledTwice, physical).to.equal(true);
        expect(mockStorageService.updateTombstone.secondCall.args[2]).to.deep.include({
          lifecycleState: 'recovery-required',
        });
        expect(mockStorageService.updateTombstone.secondCall.args[2].lifecycleOperation.errorCode).to.equal(
          physical === 'unknown' ? 'physical-purge-unknown' : 'physical-purge-incomplete'
        );
      }
    });
  });

  describe('triggerPreSaveTriggers', function () {
    it('should handle undefined triggers', async function () {
      const recordType = { hooks: {} };
      const record = { metadata: { title: 'Test' } };

      const result = await RecordsService.triggerPreSaveTriggers('oid-1', record, recordType, 'onCreate', {});

      expect(result).to.deep.equal(record);
    });

    it('reuses the callable resolved during hook configuration validation', async function () {
      (global as any).hookExpressionEvaluations = 0;
      const recordType = {
        hooks: {
          onUpdate: {
            pre: [
              {
                function: `(() => {
                globalThis.hookExpressionEvaluations += 1;
                return (_oid, record) => record;
              })()`,
              },
            ],
          },
        },
      };
      try {
        (RecordsService as any).validateHookConfiguration(recordType, ['onUpdate']);
        await RecordsService.triggerPreSaveTriggers('record-123', { metadata: {} }, recordType, 'onUpdate', {});
        expect((global as any).hookExpressionEvaluations).to.equal(1);
      } finally {
        delete (global as any).hookExpressionEvaluations;
      }
    });
  });

  describe('triggerPostSaveSyncTriggers', function () {
    it('retains whitelisted legacy fields mutated on the isolated hook response', async function () {
      const record = { metadata: { title: 'Test' }, callerOwned: true };
      const originalRecord = structuredClone(record);
      const recordType = {
        hooks: {
          onCreate: {
            postSync: [
              {
                function: `(_oid, hookRecord, _options, _user, response) => {
                response.workspaceOid = 'workspace-1';
                response.workspaceData = { linked: true };
                response.oid = 'tampered';
                return { ...hookRecord, hookOnly: true };
              }`,
              },
            ],
          },
        },
      };

      const result = await RecordsService.triggerPostSaveSyncTriggers(
        'record-123',
        record,
        recordType,
        'onCreate',
        {},
        { oid: 'record-123', success: true }
      );

      expect(result.workspaceOid).to.equal('workspace-1');
      expect(result.workspaceData).to.deep.equal({ linked: true });
      expect(result.oid).to.equal('record-123');
      expect(record).to.deep.equal(originalRecord);
    });

    it('preserves standalone transition pre/postSync/post ordering and response projection', async function () {
      const events: string[] = [];
      (globalThis as any).__effectTransitionEvents = events;
      const recordType = {
        hooks: {
          onTransitionWorkflow: {
            pre: [
              { function: '(_oid, record) => { globalThis.__effectTransitionEvents.push("pre"); return record; }' },
            ],
            postSync: [
              {
                function: '(_oid, record) => { globalThis.__effectTransitionEvents.push("postSync"); return record; }',
              },
            ],
            post: [{ function: '() => { globalThis.__effectTransitionEvents.push("post"); }' }],
          },
        },
      };

      try {
        const transitioned = await RecordsService.triggerPreSaveTransitionWorkflowTriggers(
          'record-123',
          { metadata: {} },
          recordType,
          { name: 'published' },
          { username: 'user-1' }
        );
        const response = await RecordsService.triggerPostSaveTransitionWorkflowTriggers(
          'record-123',
          transitioned,
          recordType,
          { name: 'published' },
          { username: 'user-1' },
          { oid: 'record-123', success: true }
        );
        await new Promise(resolve => setImmediate(resolve));

        expect(response.oid).to.equal('record-123');
        expect(events).to.deep.equal(['pre', 'postSync', 'post']);
      } finally {
        delete (globalThis as any).__effectTransitionEvents;
      }
    });

    it('dispatches standalone transition post hooks after a postSync soft-failure response', async function () {
      const events: string[] = [];
      (globalThis as any).__softTransitionEvents = events;
      const recordType = {
        hooks: {
          onTransitionWorkflow: {
            postSync: [
              {
                options: { returnType: 'response' },
                function:
                  '() => { globalThis.__softTransitionEvents.push("postSync"); return { success: false, message: "soft failure" }; }',
              },
            ],
            post: [{ function: '() => { globalThis.__softTransitionEvents.push("post"); }' }],
          },
        },
      };

      try {
        const response = await RecordsService.triggerPostSaveTransitionWorkflowTriggers(
          'record-123',
          { metadata: {} },
          recordType,
          { name: 'published' },
          { username: 'user-1' },
          { oid: 'record-123', success: true }
        );
        await new Promise(resolve => setImmediate(resolve));

        expect(response.success).to.equal(false);
        expect(events).to.deep.equal(['postSync', 'post']);
      } finally {
        delete (globalThis as any).__softTransitionEvents;
      }
    });
  });

  describe('updateMeta save pipeline', function () {
    it('derives and executes attachment additions from replacement metadata', async function () {
      const journal = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation: sinon.stub().resolves(true),
        rebindOid: sinon.stub().resolves(),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
      });
      mockStorageService.getMeta.resolves({
        redboxOid: 'record-123',
        metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
        metadata: { attachments: [] },
      });
      (global as any).FormsService.getFormByName.returns(
        of({
          name: 'default-form',
          configuration: { attachmentFields: ['attachments'] },
        })
      );
      (global as any).RecordTypesService.get.returns(of({ name: 'rdmp', hooks: {}, searchable: false }));

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        {
          metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
          metadata: { attachments: [] },
          authorization: {},
        },
        { username: 'user-1' },
        true,
        true,
        {},
        {
          metadata: { attachments: [{ attachmentId: 'attachment-1', fileId: 'file-1', pending: true }] },
          mode: 'replace',
        }
      );

      expect(result.wasPersisted()).to.equal(true);
      expect(journal.prepareMutations.calledOnce).to.equal(true);
      expect(mockDatastreamService.addDatastream.calledOnce).to.equal(true);
      expect(mockStorageService.updateMeta.callCount).to.equal(2);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata.attachments[0].pending).to.equal(true);
      expect(mockStorageService.updateMeta.secondCall.args[2].metadata.attachments[0].pending).to.equal(false);
    });

    it('keeps add and delete journal identities separate for attachment replacements', async function () {
      const preparedRows: any[] = [];
      const journal = {
        prepareMutations: sinon.stub().callsFake(async (rows: any[]) => preparedRows.push(...rows)),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation: sinon.stub().resolves(true),
        rebindOid: sinon.stub().resolves(),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
      });
      mockStorageService.getMeta.resolves({
        redboxOid: 'record-123',
        metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
        metadata: { attachments: [{ attachmentId: 'attachment-1', fileId: 'old-file', pending: false }] },
      });
      (global as any).FormsService.getFormByName.returns(
        of({
          name: 'default-form',
          configuration: { attachmentFields: ['attachments'] },
        })
      );
      (global as any).RecordTypesService.get.returns(of({ name: 'rdmp', hooks: {}, searchable: false }));

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        {
          metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
          metadata: { attachments: [{ attachmentId: 'attachment-1', fileId: 'old-file' }] },
          authorization: {},
        },
        { username: 'user-1' },
        true,
        true,
        {},
        {
          metadata: { attachments: [{ attachmentId: 'attachment-1', fileId: 'new-file' }] },
          mode: 'replace',
        }
      );

      expect(result.wasPersisted()).to.equal(true);
      expect(preparedRows).to.have.length(2);
      expect(preparedRows.map(row => row.operation)).to.deep.equal(['add', 'delete']);
      expect(preparedRows.map(row => row.fileId)).to.deep.equal(['new-file', 'old-file']);
      expect(preparedRows[0].storageKey).to.not.equal(preparedRows[1].storageKey);
      expect(journal.markMutation.callCount).to.equal(4);
      expect(journal.markMutation.getCall(0).args[5]).to.equal('new-file');
      expect(journal.markMutation.getCall(2).args[5]).to.equal('old-file');
      expect(mockDatastreamService.addDatastream.calledOnce).to.equal(true);
      expect(mockDatastreamService.removeDatastream.calledOnce).to.equal(true);
    });

    it('reconciles attachments against the independently loaded storage snapshot', async function () {
      const journal = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation: sinon.stub().resolves(true),
        rebindOid: sinon.stub().resolves(),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
      });
      const replacement = { attachmentId: 'attachment-1', fileId: 'new-file', pending: true };
      mockStorageService.getMeta.resolves({
        redboxOid: 'record-123',
        metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
        metadata: {
          attachments: [{ attachmentId: 'attachment-1', fileId: 'old-file', pending: false }],
        },
      });
      (global as any).FormsService.getFormByName.returns(
        of({
          name: 'default-form',
          configuration: { attachmentFields: ['attachments'] },
        })
      );
      (global as any).RecordTypesService.get.returns(of({ name: 'rdmp', hooks: {}, searchable: false }));

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        {
          redboxOid: 'record-123',
          metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
          // Deliberately stale caller "original": it already contains the
          // replacement and therefore cannot be attachment authority.
          metadata: { attachments: [replacement] },
          authorization: {},
        },
        { username: 'user-1' },
        false,
        false,
        {},
        { metadata: { attachments: [replacement] }, mode: 'replace' }
      );

      expect(result.wasPersisted()).to.equal(true);
      expect(mockDatastreamService.removeDatastream.calledOnce).to.equal(true);
      expect(mockDatastreamService.addDatastream.calledOnce).to.equal(true);
      expect(journal.prepareMutations.firstCall.args[0].map((item: any) => item.operation).sort()).to.deep.equal([
        'delete',
        'finalize',
      ]);
    });
  });

  describe('record concurrency save pipeline', function () {
    const requestId = '11111111-1111-4111-8111-111111111111';
    const resolutionOfRequestId = '22222222-2222-4222-8222-222222222222';
    const record = (revision = 4, title = 'Original', canEdit = true) => ({
      redboxOid: 'record-123',
      revision,
      metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
      metadata: { title },
      workflow: { stage: 'draft' },
      authorization: {
        edit: canEdit ? ['user-1'] : [],
        view: [],
        editRoles: [],
        viewRoles: [],
      },
    });
    const allowValidation = () => ({
      status: 'resolved',
      shouldBlock: false,
      mode: 'shadow',
      formName: 'default-form',
      effectiveGroups: [],
      resolved: {},
      blockingErrors: [],
      advisoryErrors: [],
      advisoryGroups: [],
      diagnostics: [],
    });
    const installMode = (mode: 'strict' | 'observe' | 'last-write-wins', hooks: Record<string, unknown> = {}) => {
      mockStorageService.getCapabilities = sinon.stub().returns({
        recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
      });
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks,
          searchable: false,
          concurrentModification: { mode },
        })
      );
    };
    const update = (
      candidate: any,
      concurrency: Record<string, unknown>,
      triggerPostSaveTriggers = false,
      saveRequestId = requestId
    ) =>
      RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        candidate,
        { username: 'user-1' },
        false,
        triggerPostSaveTriggers,
        {},
        undefined,
        createRecordSaveContext({
          requestId: saveRequestId,
          routeFamily: 'browser',
          operation: 'update',
          concurrency: { entityTagSupplied: false, ...concurrency },
        })
      );

    it('enforces strict missing while observe and last-write-wins accept tokenless writes', async function () {
      const validator = (global as any).RecordValidationService.resolve as sinon.SinonStub;

      installMode('strict');
      mockStorageService.getMeta.resolves(record());
      const strictResult = await update(record(4, 'Strict edit'), {});
      expect(strictResult.outcome).to.equal('not-saved');
      expect(strictResult.problems[0].issues[0].code).to.equal('record-precondition-required');
      expect(strictResult.concurrency).to.include({ mode: 'strict', currentRevision: 4 });
      expect(validator.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);

      for (const mode of ['observe', 'last-write-wins'] as const) {
        validator.resetHistory();
        mockStorageService.getMeta.reset();
        mockStorageService.updateMeta.reset();
        installMode(mode);
        mockStorageService.getMeta.onFirstCall().resolves(record());
        mockStorageService.getMeta.onSecondCall().resolves(record(5, `${mode} edit`));
        mockStorageService.updateMeta.resolves({
          success: true,
          oid: 'record-123',
          applicationState: 'applied',
          committedRevision: 5,
          committedRecord: record(5, `${mode} edit`),
        });

        const result = await update(record(4, `${mode} edit`), {});
        expect(result.outcome, mode).to.equal('saved');
        expect(result.concurrency, mode).to.include({ mode, revision: 5, currentRevision: 5 });
        expect(mockStorageService.updateMeta.firstCall.args[4]).to.deep.include({
          precondition: { requireRevision: false },
          requestId,
          resolution: 'direct',
        });
      }
    });

    it('orders authorization before revision disclosure and all candidate work', async function () {
      installMode('strict');
      mockStorageService.getMeta.resolves(record(9, 'Private', false));
      const journal = {
        findUnresolvedByOid: sinon.stub(),
        prepareMutations: sinon.stub(),
        markMutation: sinon.stub(),
      };
      mockSails.services.attachmentmetadataservice = journal;

      const result = await update(record(3, 'Unauthorized', false), { expectedRevision: 3 });

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].kind).to.equal('authorization');
      expect(result.concurrency).to.equal(undefined);
      expect(JSON.stringify(result)).not.to.contain('Private');
      expect((global as any).RecordTypesService.get.notCalled).to.equal(true);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(journal.findUnresolvedByOid.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('rejects stale revisions and form drift before validation or attachment planning', async function () {
      const journal = {
        findUnresolvedByOid: sinon.stub(),
        prepareMutations: sinon.stub(),
        markMutation: sinon.stub(),
      };
      mockSails.services.attachmentmetadataservice = journal;
      installMode('strict');
      mockStorageService.getMeta.resolves(record());
      mockDatastreamService.addDatastream = sinon.stub().resolves();

      const staleCandidate = {
        ...record(4, 'Stale'),
        redboxOid: 'different-record',
        metadata: {
          attachments: [{ attachmentId: 'attachment-1', fileId: 'staged-1', pending: true }],
        },
      };
      const issuedFingerprint = await RecordsService.getRecordFormFingerprint(record(), { name: 'rdmp' });
      const stale = await update(staleCandidate, {
        expectedRevision: 3,
        formFingerprint: issuedFingerprint!,
      });
      expect(stale.problems[0].issues[0].code).to.equal('record-revision-stale');
      expect(stale.concurrency).to.include({ expectedRevision: 3, currentRevision: 4 });
      expect(stale.concurrency?.formFingerprint).to.equal(issuedFingerprint);

      const fingerprint = await update(record(4, 'Form drift'), {
        expectedRevision: 4,
        formFingerprint: `sha256:${'0'.repeat(64)}`,
      });
      expect(fingerprint.problems[0].issues[0].code).to.equal('form-definition-changed');
      expect(fingerprint.concurrency?.formFingerprint).to.match(/^sha256:[0-9a-f]{64}$/);
      expect(fingerprint.concurrency?.formFingerprint).not.to.equal(`sha256:${'0'.repeat(64)}`);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(journal.findUnresolvedByOid.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect(mockDatastreamService.addDatastream.notCalled).to.equal(true);
      expect(JSON.stringify(fingerprint)).not.to.contain('attachmentFields');
    });

    it('accepts the fingerprint a generated form issued and resolves the form authoritatively', async function () {
      installMode('strict');
      const stored = record();
      mockStorageService.getMeta.resolves(stored);
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 5,
        committedRecord: record(5, 'Fingerprinted edit'),
      });
      const recordType = { name: 'rdmp', hooks: {}, searchable: false, concurrentModification: { mode: 'strict' } };

      // What the browser form route now emits for this record.
      const deliveredForm = {
        id: 'default-form-id',
        name: 'default-form',
        branding: 'brand-1',
        configuration: { componentDefinitions: [] },
      };
      (global as any).FormsService.getFormByName.returns(of(deliveredForm));
      const issued = await RecordsService.getRecordFormFingerprint(stored, recordType, undefined, deliveredForm);
      expect(issued).to.match(/^sha256:[0-9a-f]{64}$/);

      // Save recomputation resolves the same authoritative form identity and
      // contract again, producing exactly the value issued at delivery.
      (global as any).FormsService.getFormByName.resetHistory();
      const result = await update(record(4, 'Fingerprinted edit'), {
        expectedRevision: 4,
        formFingerprint: issued,
      });

      expect(result.outcome).to.equal('saved');
      expect(result.concurrency?.formFingerprint).to.equal(issued);
      expect((global as any).FormsService.getFormByName.getCall(0).args.slice(0, 3)).to.deep.equal([
        'default-form',
        true,
        'brand-1',
      ]);
    });

    it('refuses to fingerprint a delivered form outside the authoritative stored form identity', async function () {
      const stored = record();
      const fingerprint = await RecordsService.getRecordFormFingerprint(stored, { name: 'rdmp' }, undefined, {
        id: 'other-id',
        name: 'other-form',
        branding: 'brand-1',
        configuration: {},
      });

      expect(fingerprint).to.equal(undefined);
      expect((global as any).FormsService.getFormByName.notCalled).to.equal(true);
    });

    it('binds target workflow mappings while keeping one fingerprint stable across a transition', async function () {
      installMode('strict');
      const stored = record();
      const recordType = { name: 'rdmp', hooks: {}, searchable: false };
      (global as any).FormsService.getFormByName.callsFake((name: string) =>
        of({ id: `${name}-id`, name, branding: 'brand-1', configuration: { name } })
      );

      const current = await RecordsService.getRecordFormFingerprint(stored, recordType);
      const target = await RecordsService.getRecordFormFingerprint(stored, recordType, {
        name: 'published',
        config: { form: 'published-form' },
      });

      expect(current).to.match(/^sha256:[0-9a-f]{64}$/);
      expect(target).to.equal(current);
      expect((global as any).FormsService.getFormByName.alwaysCalledWith('default-form', true, 'brand-1')).to.equal(
        true
      );

      (global as any).WorkflowStepsService.getAllForRecordType.returns(
        of([
          { name: 'draft', starting: true, config: { form: 'default-form' } },
          { name: 'published', config: { form: 'changed-published-form' } },
        ])
      );
      const drifted = await RecordsService.getRecordFormFingerprint(stored, recordType);
      expect(drifted).not.to.equal(current);
    });

    it('uses the loaded revision at a deterministic final-CAS race and runs no post-persistence work', async function () {
      installMode('strict');
      const stored = { ...record(4), metadata: { attachments: [] } };
      const losingCandidate = {
        ...record(4, 'Losing edit'),
        metadata: {
          attachments: [{ attachmentId: 'attachment-1', fileId: 'staged-1', pending: true }],
        },
      };
      (global as any).FormsService.getFormByName.returns(
        of({
          name: 'default-form',
          configuration: { attachmentFields: ['attachments'] },
        })
      );
      const journal = {
        findUnresolvedByOid: sinon.stub().resolves([]),
        prepareMutations: sinon.stub().resolves(),
        markMutation: sinon.stub().resolves(true),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.getMeta.onFirstCall().resolves(stored);
      mockStorageService.getMeta.onSecondCall().resolves(record(5, 'Winner'));
      let releaseValidation!: () => void;
      let validationReached!: () => void;
      const barrier = new Promise<void>(resolve => {
        releaseValidation = resolve;
      });
      const reached = new Promise<void>(resolve => {
        validationReached = resolve;
      });
      (global as any).RecordValidationService.resolve.callsFake(async () => {
        validationReached();
        await barrier;
        return allowValidation();
      });
      mockStorageService.updateMeta.callsFake(async (...args: any[]) => {
        expect(args[4].precondition).to.deep.equal({ requireRevision: true, expectedRevision: 4 });
        return {
          success: false,
          oid: 'record-123',
          applicationState: 'not-applied',
          nonApplicationReason: 'stale-revision',
        };
      });

      const pending = update(losingCandidate, { expectedRevision: 4 }, true);
      await reached;
      releaseValidation();
      const result = await pending;

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('record-revision-stale');
      expect(result.concurrency).to.include({ expectedRevision: 4, currentRevision: 5 });
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
      expect(journal.prepareMutations.calledOnce).to.equal(true);
      expect(
        journal.markMutation.calledWith('record-123', 'attachment-1', requestId, 'cancelled', 'primary-not-applied')
      ).to.equal(true);
      expect(mockDatastreamService.addDatastream.notCalled).to.equal(true);
      expect(mockDatastreamService.removeDatastream.notCalled).to.equal(true);
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(mockQueueService.now.notCalled).to.equal(true);
    });

    it('drops revision diagnostics when edit access is lost at the final-CAS race', async function () {
      installMode('strict');
      mockStorageService.getMeta.onFirstCall().resolves(record(4));
      mockStorageService.getMeta.onSecondCall().resolves(record(5, 'Private winner', false));
      mockStorageService.updateMeta.resolves({
        success: false,
        oid: 'record-123',
        applicationState: 'not-applied',
        nonApplicationReason: 'stale-revision',
      });

      const result = await update(record(4, 'Losing edit'), { expectedRevision: 4 });

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].kind).to.equal('authorization');
      expect(result.concurrency).to.equal(undefined);
      expect(JSON.stringify(result)).not.to.contain('Private winner');
      expect(JSON.stringify(result)).not.to.contain('revision":5');
    });

    it('passes request linkage without treating the request ID as an idempotency key', async function () {
      installMode('observe');
      mockStorageService.getMeta.resolves(record(5, 'Committed'));
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 5,
        committedRecord: record(5, 'Committed'),
      });
      const concurrency = {
        resolution: 'client-auto-merged',
        resolutionOfRequestId,
      };

      const first = await update(record(4, 'First'), concurrency);
      const second = await update(record(4, 'Second'), concurrency);

      expect(first.requestId).to.equal(requestId);
      expect(second.requestId).to.equal(requestId);
      expect(mockStorageService.updateMeta.callCount).to.equal(2);
      for (const call of mockStorageService.updateMeta.getCalls()) {
        expect(call.args[4]).to.deep.include({ requestId, resolution: 'client-auto-merged' });
      }
      expect(second.concurrency).to.include({
        resolution: 'client-auto-merged',
        resolutionOfRequestId,
      });
    });

    it('keeps completed attachment facts and stops post-sync after attachment-reference CAS loss', async function () {
      (globalThis as any).__concurrencyPostSyncRan = false;
      installMode('strict', {
        onUpdate: {
          postSync: [{ function: '() => { globalThis.__concurrencyPostSyncRan = true; return {}; }' }],
        },
      });
      const stored = {
        ...record(4),
        metadata: { attachments: [] },
      };
      const candidate = {
        ...record(4),
        metadata: {
          attachments: [{ attachmentId: 'attachment-1', fileId: 'staged-1', pending: true }],
        },
      };
      (global as any).FormsService.getFormByName.returns(
        of({
          id: 'form-1',
          name: 'default-form',
          branding: 'brand-1',
          configuration: { attachmentFields: ['attachments'] },
        })
      );
      const journal = {
        findUnresolvedByOid: sinon.stub().resolves([]),
        prepareMutations: sinon.stub().resolves(),
        markMutation: sinon.stub().resolves(true),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.getMeta.onFirstCall().resolves(stored);
      mockStorageService.getMeta.onSecondCall().resolves({ ...candidate, revision: 6 });
      mockStorageService.updateMeta.onFirstCall().resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 5,
        committedRecord: { ...candidate, revision: 5 },
      });
      mockStorageService.updateMeta.onSecondCall().resolves({
        success: false,
        oid: 'record-123',
        applicationState: 'not-applied',
        nonApplicationReason: 'stale-revision',
      });

      const result = await update(candidate, { expectedRevision: 4 }, true);

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.oid).to.equal('record-123');
      expect(result.completion.attachments.items[0]).to.include({
        field: 'attachments',
        attachmentId: 'attachment-1',
        operation: 'finalize',
        status: 'completed',
      });
      expect(
        result.problems.some(
          (problem: any) => problem.kind === 'conflict' && problem.issues[0]?.code === 'record-revision-stale'
        )
      ).to.equal(true);
      expect(result.concurrency).to.include({ revision: 6, currentRevision: 6 });
      expect(mockStorageService.updateMeta.secondCall.args[4].precondition).to.deep.equal({
        requireRevision: true,
        expectedRevision: 5,
      });
      expect((globalThis as any).__concurrencyPostSyncRan).to.equal(false);
      expect(mockStorageService.updateMeta.callCount).to.equal(2);
      delete (globalThis as any).__concurrencyPostSyncRan;
    });

    it('holds completed physical work when attachment-reference persistence is unknown', async function () {
      installMode('strict');
      const stored = { ...record(4), metadata: { attachments: [] } };
      const candidate = {
        ...record(4),
        metadata: {
          attachments: [{ attachmentId: 'attachment-1', fileId: 'staged-1', pending: true }],
        },
      };
      (global as any).FormsService.getFormByName.returns(
        of({
          name: 'default-form',
          configuration: { attachmentFields: ['attachments'] },
        })
      );
      const journal = {
        findUnresolvedByOid: sinon.stub().resolves([]),
        prepareMutations: sinon.stub().resolves(),
        markMutation: sinon.stub().resolves(true),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.getMeta.onFirstCall().resolves(stored);
      mockStorageService.getMeta.onSecondCall().resolves({ ...candidate, revision: 5 });
      mockStorageService.updateMeta.onFirstCall().resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 5,
        committedRecord: { ...candidate, revision: 5 },
      });
      mockStorageService.updateMeta.onSecondCall().resolves({
        success: false,
        oid: 'record-123',
        applicationState: 'unknown',
      });

      const result = await update(candidate, { expectedRevision: 4 });

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.completion.attachments.items[0]).to.include({ status: 'completed' });
      expect(
        journal.markMutation.calledWith(
          'record-123',
          'attachment-1',
          requestId,
          'unknown',
          'attachment-reference-finalization-failed'
        )
      ).to.equal(true);
      expect(
        journal.markMutation.neverCalledWith(
          'record-123',
          'attachment-1',
          requestId,
          'incomplete',
          'attachment-reference-finalization-failed'
        )
      ).to.equal(true);
    });

    it('chains post-sync from the primary revision and reports a later CAS loss as a warning', async function () {
      (globalThis as any).__concurrencyDetachedPostRan = false;
      installMode('strict', {
        onUpdate: {
          postSync: [
            {
              function: '(_oid, value) => ({ ...value, metadata: { title: "post-sync" } })',
            },
          ],
          post: [
            {
              function: '() => { globalThis.__concurrencyDetachedPostRan = true; }',
            },
          ],
        },
      });
      mockStorageService.getMeta.onFirstCall().resolves(record(4));
      mockStorageService.getMeta.onSecondCall().resolves(record(6, 'Intervening winner'));
      mockStorageService.updateMeta.onFirstCall().resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 5,
        committedRecord: record(5, 'Primary'),
      });
      mockStorageService.updateMeta.onSecondCall().resolves({
        success: false,
        oid: 'record-123',
        applicationState: 'not-applied',
        nonApplicationReason: 'stale-revision',
      });

      const result = await update(record(4, 'Primary'), { expectedRevision: 4 }, true);

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(
        result.problems.some(
          (problem: any) => problem.kind === 'conflict' && problem.issues[0]?.code === 'record-revision-stale'
        )
      ).to.equal(true);
      expect(mockStorageService.updateMeta.secondCall.args[4].precondition).to.deep.equal({
        requireRevision: true,
        expectedRevision: 5,
      });
      expect(result.concurrency).to.include({ revision: 6, currentRevision: 6 });
      expect((globalThis as any).__concurrencyDetachedPostRan).to.equal(false);
      delete (globalThis as any).__concurrencyDetachedPostRan;
    });

    it('holds prepared attachments on an unknown primary result and performs no physical work', async function () {
      installMode('strict');
      const stored = { ...record(4), metadata: { attachments: [] } };
      const candidate = {
        ...record(4),
        metadata: {
          attachments: [{ attachmentId: 'attachment-1', fileId: 'staged-1', pending: true }],
        },
      };
      (global as any).FormsService.getFormByName.returns(
        of({
          name: 'default-form',
          configuration: { attachmentFields: ['attachments'] },
        })
      );
      const journal = {
        findUnresolvedByOid: sinon.stub().resolves([]),
        prepareMutations: sinon.stub().resolves(),
        markMutation: sinon.stub().resolves(true),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.getMeta.resolves(stored);
      mockStorageService.updateMeta.rejects(new Error('/private/provider/path?token=secret'));

      const result = await update(candidate, { expectedRevision: 4 });

      expect(result.outcome).to.equal('unknown');
      expect(journal.prepareMutations.calledOnce).to.equal(true);
      expect(
        journal.markMutation.calledWith(
          'record-123',
          'attachment-1',
          requestId,
          'unknown',
          'primary-persistence-unknown'
        )
      ).to.equal(true);
      expect(mockDatastreamService.addDatastream.notCalled).to.equal(true);
      expect(mockDatastreamService.removeDatastream.notCalled).to.equal(true);
      expect(JSON.stringify(result)).not.to.contain('private/provider');
      expect(JSON.stringify(result)).not.to.contain('secret');
    });

    it('retains a stable staged upload across a conflict and finalizes it under a new generation', async function () {
      const retryRequestId = '33333333-3333-4333-8333-333333333333';
      installMode('strict');
      const initial = { ...record(4), metadata: { attachments: [] } };
      const winner = { ...record(5, 'Winner'), metadata: { attachments: [] } };
      const candidate = {
        ...record(4, 'Retried edit'),
        metadata: {
          attachments: [{ attachmentId: 'attachment-1', fileId: 'stable-staged-file', pending: true }],
        },
      };
      (global as any).FormsService.getFormByName.returns(
        of({
          name: 'default-form',
          configuration: { attachmentFields: ['attachments'] },
        })
      );
      const journal = {
        findUnresolvedByOid: sinon.stub().resolves([]),
        prepareMutations: sinon.stub().resolves(),
        markMutation: sinon.stub().resolves(true),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.getMeta.onCall(0).resolves(initial);
      mockStorageService.getMeta.onCall(1).resolves(winner);
      mockStorageService.getMeta.onCall(2).resolves(winner);
      mockStorageService.getMeta.onCall(3).resolves({ ...candidate, revision: 7 });
      mockStorageService.updateMeta.onCall(0).resolves({
        success: false,
        oid: 'record-123',
        applicationState: 'not-applied',
        nonApplicationReason: 'stale-revision',
      });
      mockStorageService.updateMeta.onCall(1).resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 6,
        committedRecord: { ...candidate, revision: 6 },
      });
      mockStorageService.updateMeta.onCall(2).resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 7,
        committedRecord: { ...candidate, revision: 7 },
      });

      const conflicted = await update(candidate, { expectedRevision: 4 });
      expect(conflicted.outcome).to.equal('not-saved');
      expect(mockDatastreamService.addDatastream.notCalled).to.equal(true);

      const saved = await update(
        candidate,
        {
          expectedRevision: 5,
          resolution: 'client-manually-resolved',
          resolutionOfRequestId: requestId,
        },
        false,
        retryRequestId
      );

      expect(saved.outcome).to.equal('saved');
      expect(saved.concurrency).to.include({
        revision: 7,
        resolution: 'client-manually-resolved',
        resolutionOfRequestId: requestId,
      });
      expect(journal.prepareMutations.callCount).to.equal(2);
      expect(journal.prepareMutations.firstCall.args[0][0]).to.include({
        fileId: 'stable-staged-file',
        generation: requestId,
      });
      expect(journal.prepareMutations.secondCall.args[0][0]).to.include({
        fileId: 'stable-staged-file',
        generation: retryRequestId,
      });
      expect(mockDatastreamService.addDatastream.calledOnce).to.equal(true);
      expect(mockDatastreamService.addDatastream.firstCall.args[1].fileId).to.equal('stable-staged-file');
      expect(mockStorageService.updateMeta.thirdCall.args[4].precondition).to.deep.equal({
        requireRevision: true,
        expectedRevision: 6,
      });
    });

    it('adopts an incomplete staged intent only after the retry primary CAS commits', async function () {
      const retryRequestId = '44444444-4444-4444-8444-444444444444';
      installMode('strict');
      const pendingAttachment = {
        attachmentId: 'attachment-1',
        fileId: 'stable-staged-file',
        pending: true,
      };
      const stored = {
        ...record(5),
        metadata: { attachments: [pendingAttachment] },
      };
      (global as any).FormsService.getFormByName.returns(
        of({
          name: 'default-form',
          configuration: { attachmentFields: ['attachments'] },
        })
      );
      const journal = {
        findUnresolvedByOid: sinon.stub().resolves([
          {
            oid: 'record-123',
            attachmentId: 'attachment-1',
            attachmentField: 'attachments',
            mutationFileId: 'stable-staged-file',
            operation: 'finalize',
            generation: 'older-generation',
            mutationState: 'incomplete',
          },
        ]),
        prepareMutations: sinon.stub().resolves(),
        markMutation: sinon.stub().resolves(true),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.getMeta.onFirstCall().resolves(stored);
      mockStorageService.getMeta.onSecondCall().resolves({ ...stored, revision: 7 });
      mockStorageService.updateMeta.onFirstCall().resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 6,
        committedRecord: { ...stored, revision: 6 },
      });
      mockStorageService.updateMeta.onSecondCall().resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
        committedRevision: 7,
        committedRecord: { ...stored, revision: 7 },
      });

      const result = await update(
        stored,
        {
          expectedRevision: 5,
          resolution: 'client-manually-resolved',
          resolutionOfRequestId: requestId,
        },
        false,
        retryRequestId
      );

      expect(result.outcome).to.equal('saved');
      expect(journal.prepareMutations.firstCall.args[0][0]).to.include({
        fileId: 'stable-staged-file',
        generation: retryRequestId,
      });
      const supersedeCall = journal.markMutation
        .getCalls()
        .find((call: sinon.SinonSpyCall) => call.args[2] === 'older-generation' && call.args[3] === 'cancelled');
      const pendingCall = journal.markMutation
        .getCalls()
        .find((call: sinon.SinonSpyCall) => call.args[2] === retryRequestId && call.args[3] === 'pending');
      expect(supersedeCall).not.to.equal(undefined);
      expect(pendingCall).not.to.equal(undefined);
      expect(mockStorageService.updateMeta.firstCall.calledBefore(supersedeCall!)).to.equal(true);
      expect(supersedeCall!.calledBefore(pendingCall!)).to.equal(true);
      expect(mockDatastreamService.addDatastream.calledOnce).to.equal(true);
    });

    it('cleans only expired abandoned staging and keeps logs free of blob identifiers and provider errors', async function () {
      const claims = [
        {
          oid: 'active-record',
          attachmentId: 'active-attachment',
          fileId: 'active-file',
          generation: 'old-1',
          token: 'cleanup-1',
        },
        {
          oid: 'retry-record',
          attachmentId: 'retry-attachment',
          fileId: 'retry-file',
          generation: 'old-2',
          token: 'cleanup-2',
        },
        {
          oid: 'abandoned-record',
          attachmentId: 'abandoned-attachment',
          fileId: 'abandoned-file',
          generation: 'old-3',
          token: 'cleanup-3',
        },
        {
          oid: 'failed-record',
          attachmentId: 'failed-attachment',
          fileId: 'private-provider-token',
          generation: 'old-4',
          token: 'cleanup-4',
        },
      ];
      const journal = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        claimExpiredStagingCleanup: sinon.stub().resolves(claims),
        beginStagingCleanup: sinon.stub().resolves(true),
        authorizeStagingCleanup: sinon.stub().resolves(true),
        releaseStagingCleanup: sinon.stub().resolves(true),
        completeStagingCleanup: sinon.stub().resolves(true),
        recoverStagingCleanup: sinon.stub().resolves('retained'),
        findUnresolvedByStagingFileId: sinon
          .stub()
          .callsFake(async (fileId: string) =>
            fileId === 'retry-file'
              ? [{ mutationFileId: 'retry-file', generation: 'new-generation', mutationState: 'prepared' }]
              : []
          ),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockSails.config.record.attachments = { stagingExpiryMs: 60_000 };
      mockStorageService.getMeta.callsFake(async (oid: string) =>
        oid === 'active-record'
          ? {
              metadata: {
                nested: [{ attachmentId: 'active-attachment', fileId: 'active-file', pending: true }],
              },
              metaMetadata: { type: 'rdmp' },
            }
          : null
      );
      mockDatastreamService.removeStagedDatastream = sinon.stub().callsFake(async (fileId: string) => {
        if (fileId === 'private-provider-token') {
          throw new Error('/private/provider/path?token=secret');
        }
      });

      const result = await RecordsService.cleanupAbandonedAttachmentStaging(new Date('2026-08-23T12:00:00.000Z'));

      expect(result).to.deep.equal({ claimed: 4, removed: 1, retained: 2, failed: 1 });
      expect(journal.claimExpiredStagingCleanup.calledOnceWithExactly('2026-08-23T11:59:00.000Z', 100)).to.equal(true);
      expect(
        mockDatastreamService.removeStagedDatastream.getCalls().map((call: sinon.SinonSpyCall) => call.args[0])
      ).to.deep.equal(['abandoned-file', 'private-provider-token']);
      expect(journal.completeStagingCleanup.calledOnceWithExactly(claims[2])).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
      expect(journal.releaseStagingCleanup.calledWith(claims[0], 'attachment-cleanup-reference-active')).to.equal(true);
      expect(journal.releaseStagingCleanup.calledWith(claims[1], 'attachment-cleanup-reference-active')).to.equal(true);
      expect(journal.releaseStagingCleanup.calledWith(claims[3])).to.equal(false);
      const abandonedScan = journal.findUnresolvedByStagingFileId
        .getCalls()
        .find((call: sinon.SinonSpyCall) => call.args[0] === 'abandoned-file')!;
      expect(journal.beginStagingCleanup.getCall(2).calledBefore(abandonedScan)).to.equal(true);
      expect(abandonedScan.calledBefore(journal.authorizeStagingCleanup.firstCall)).to.equal(true);
      expect(
        journal.authorizeStagingCleanup.firstCall.calledBefore(mockDatastreamService.removeStagedDatastream.firstCall)
      ).to.equal(true);
      const cleanupLogs = JSON.stringify([
        ...mockSails.log.info.getCalls().map((call: sinon.SinonSpyCall) => call.args),
        ...mockSails.log.warn.getCalls().map((call: sinon.SinonSpyCall) => call.args),
      ]);
      expect(cleanupLogs).not.to.contain('private-provider-token');
      expect(cleanupLogs).not.to.contain('/private/provider/path');
      expect(cleanupLogs).not.to.contain('token=secret');
    });

    it('retains staging when storage returns a non-null malformed record snapshot', async function () {
      const claim = {
        oid: 'malformed-record',
        attachmentId: 'attachment-1',
        fileId: 'staged-file',
        generation: 'old-generation',
        token: 'cleanup-malformed',
      };
      const journal = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        claimExpiredStagingCleanup: sinon.stub().resolves([claim]),
        beginStagingCleanup: sinon.stub().resolves(true),
        authorizeStagingCleanup: sinon.stub().resolves(true),
        releaseStagingCleanup: sinon.stub().resolves(true),
        completeStagingCleanup: sinon.stub().resolves(true),
        recoverStagingCleanup: sinon.stub().resolves('retained'),
        findUnresolvedByStagingFileId: sinon.stub().resolves([]),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockStorageService.getMeta.resolves({ metadata: { partial: true } });
      mockDatastreamService.removeStagedDatastream = sinon.stub().resolves();

      const result = await RecordsService.cleanupAbandonedAttachmentStaging(new Date('2026-08-23T12:00:00.000Z'));

      expect(result).to.deep.equal({ claimed: 1, removed: 0, retained: 1, failed: 0 });
      expect(
        journal.releaseStagingCleanup.calledOnceWithExactly(claim, 'attachment-cleanup-record-state-unknown')
      ).to.equal(true);
      expect(journal.findUnresolvedByStagingFileId.calledOnce).to.equal(true);
      expect(mockDatastreamService.removeStagedDatastream.notCalled).to.equal(true);
    });
  });

  describe('create save pipeline', function () {
    it('accepts the starting form fingerprint when a create transitions to its target step', async function () {
      mockStorageService.getCapabilities = sinon.stub().returns({
        recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
      });
      const recordType = {
        name: 'rdmp',
        hooks: {},
        searchable: false,
        concurrentModification: { mode: 'strict' },
      };
      const issued = await RecordsService.getRecordFormFingerprint(
        {
          metaMetadata: { brandId: 'brand-1', type: 'rdmp', form: 'default-form' },
          workflow: { stage: 'draft' },
        },
        recordType
      );
      const context = createRecordSaveContext({
        routeFamily: 'browser',
        operation: 'create',
        targetStep: 'published',
        concurrency: { entityTagSupplied: false, formFingerprint: issued },
      });

      const result = await RecordsService.create(
        { id: 'brand-1' },
        {
          metadata: { title: 'Create with transition' },
          authorization: { edit: ['user-1'], view: ['user-1'], editRoles: [], viewRoles: [] },
        },
        recordType,
        { username: 'user-1' },
        true,
        false,
        'published',
        context
      );

      expect(result.wasPersisted()).to.equal(true);
      expect(result.outcome).to.be.oneOf(['saved', 'saved-with-warnings']);
      expect(result.problems.flatMap((problem: any) => problem.issues).map((issue: any) => issue.code)).not.to.include(
        'form-definition-changed'
      );
      expect(result.concurrency?.formFingerprint).to.equal(issued);
      expect(mockStorageService.create.calledOnce).to.equal(true);
    });

    it('generates a historical hyphenless OID for a configured create before storage', async function () {
      mockStorageService.create.resolves({
        success: true,
        oid: 'adapter-create-oid',
        applicationState: 'applied',
      });

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Generated OID' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        false,
        false
      );

      const persisted = mockStorageService.create.firstCall.args[1];
      expect(result.outcome).to.equal('saved');
      expect(persisted.redboxOid).to.match(/^[0-9a-f]{32}$/);
      expect(result.oid).to.equal(persisted.redboxOid);
    });

    it('generates a historical hyphenless OID for a bootstrap-safe create before storage', async function () {
      mockStorageService.create.resolves({
        success: true,
        oid: 'adapter-bootstrap-oid',
        applicationState: 'applied',
      });

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Generated bootstrap OID' } },
        {},
        { username: 'bootstrap-service' },
        false,
        false
      );

      const persisted = mockStorageService.create.firstCall.args[1];
      expect(result.outcome).to.equal('saved');
      expect(persisted.redboxOid).to.match(/^[0-9a-f]{32}$/);
      expect(result.oid).to.equal(persisted.redboxOid);
    });

    it('keeps the preselected create OID authoritative for attachments, reload, index, audit, and response', async function () {
      const createOid = 'authoritative-create-123';
      const journal = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation: sinon.stub().resolves(true),
        rebindOid: sinon.stub().resolves(),
      };
      mockSails.services.attachmentmetadataservice = journal;
      mockDatastreamService.addDatastream = sinon.stub().resolves();
      mockDatastreamService.removeDatastream = sinon.stub().resolves();
      mockStorageService.create.resolves({
        success: true,
        oid: 'wrong-adapter-create-oid',
        applicationState: 'applied',
      });
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'wrong-adapter-update-oid',
        applicationState: 'applied',
      });
      mockStorageService.getMeta.resolves({
        redboxOid: createOid,
        metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
        metadata: { attachments: [{ attachmentId: 'attachment-1', fileId: 'file-1', pending: false }] },
      });
      (global as any).FormsService.getForm.resolves({
        name: 'default-form',
        configuration: { attachmentFields: ['attachments'] },
      });
      (global as any).FormsService.getFormByName.returns(
        of({ name: 'default-form', configuration: { attachmentFields: ['attachments'] } })
      );

      const result = await RecordsService.create(
        { id: 'brand-1' },
        {
          redboxOid: createOid,
          metadata: { attachments: [{ attachmentId: 'attachment-1', fileId: 'file-1', pending: true }] },
        },
        { name: 'rdmp', hooks: {}, searchable: true },
        { username: 'user-1' }
      );
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));

      expect(result.wasPersisted()).to.equal(true);
      expect(result.oid).to.equal(createOid);
      expect(journal.prepareMutations.calledBefore(mockStorageService.create)).to.equal(true);
      expect(journal.prepareMutations.firstCall.args[0][0].oid).to.equal(createOid);
      expect(mockStorageService.create.calledBefore(mockDatastreamService.addDatastream)).to.equal(true);
      expect(journal.rebindOid.notCalled).to.equal(true);
      expect(mockDatastreamService.addDatastream.firstCall.args[0]).to.equal(createOid);
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
      expect(mockStorageService.updateMeta.firstCall.args[1]).to.equal(createOid);
      expect(mockStorageService.getMeta.calledWith(createOid)).to.equal(true);
      expect(mockSearchService.index.calledWith(createOid)).to.equal(true);
      expect(mockQueueService.now.firstCall.args[1].redboxOid).to.equal(createOid);
    });

    it('ignores wrong and blank adapter OIDs on the bootstrap-safe create path', async function () {
      const createOid = 'bootstrap-authoritative-oid';
      mockSearchService.index.resolves(true);
      mockStorageService.getMeta.callsFake(async (oid: string) => ({
        redboxOid: oid,
        metadata: { title: 'Bootstrap record' },
        metaMetadata: { type: 'bootstrap-record' },
      }));
      for (const adapterOid of ['wrong-bootstrap-adapter-oid', '']) {
        mockStorageService.create.resetHistory();
        mockSearchService.index.resetHistory();
        mockQueueService.now.resetHistory();
        mockStorageService.create.resolves({
          success: true,
          oid: adapterOid,
          applicationState: 'applied',
          message: 'created',
          data: { compatibility: 'preserved' },
          metadata: { projection: 'preserved' },
          totalItems: 1,
          items: [{ compatibility: 'preserved' }],
        });

        const result = await RecordsService.create(
          { id: 'brand-1' },
          { redboxOid: createOid, metadata: { title: 'Bootstrap record' } },
          {},
          { username: 'bootstrap-service' },
          false,
          false
        );

        expect(result.outcome, JSON.stringify({ adapterOid })).to.equal('saved');
        expect(result.oid, JSON.stringify({ adapterOid })).to.equal(createOid);
        expect(result.message, JSON.stringify({ adapterOid })).to.equal('created');
        expect(result.data, JSON.stringify({ adapterOid })).to.deep.equal({ compatibility: 'preserved' });
        expect(result.metadata, JSON.stringify({ adapterOid })).to.deep.equal({ projection: 'preserved' });
        expect(result.totalItems, JSON.stringify({ adapterOid })).to.equal(1);
        expect(result.items, JSON.stringify({ adapterOid })).to.deep.equal([{ compatibility: 'preserved' }]);
        expect(mockStorageService.create.firstCall.args[1].redboxOid, JSON.stringify({ adapterOid })).to.equal(
          createOid
        );
        expect(
          mockSearchService.index.calledWithExactly(
            createOid,
            sinon.match({ redboxOid: createOid, metadata: { title: 'Bootstrap record' } })
          ),
          JSON.stringify({ adapterOid })
        ).to.equal(true);
        expect(mockQueueService.now.firstCall.args[1].redboxOid, JSON.stringify({ adapterOid })).to.equal(createOid);
      }
    });

    it('waits for bootstrap-safe index acceptance before returning the successful response', async function () {
      const createOid = 'bootstrap-awaited-index';
      mockStorageService.create.resolves({
        success: true,
        oid: createOid,
        applicationState: 'applied',
        message: 'created',
      });
      mockStorageService.getMeta.resolves({
        redboxOid: createOid,
        metadata: { title: 'Bootstrap record' },
        metaMetadata: { type: 'bootstrap-record' },
      });
      sinon.stub(RecordsService, 'auditRecord').resolves();
      let resolveAcceptance!: (accepted: boolean) => void;
      const acceptance = new Promise<boolean>(resolve => {
        resolveAcceptance = resolve;
      });
      let signalIndexCalled!: () => void;
      const indexCalled = new Promise<void>(resolve => {
        signalIndexCalled = resolve;
      });
      mockSearchService.index.callsFake(() => {
        signalIndexCalled();
        return acceptance;
      });

      let returned = false;
      const resultPromise = RecordsService.create(
        { id: 'brand-1' },
        { redboxOid: createOid, metadata: { title: 'Bootstrap record' } },
        {},
        { username: 'bootstrap-service' },
        false,
        false
      ).then((result: any) => {
        returned = true;
        return result;
      });

      await indexCalled;
      await Promise.resolve();
      expect(returned).to.equal(false);
      resolveAcceptance(true);
      const result = await resultPromise;

      expect(result.outcome).to.equal('saved');
      expect(result.message).to.equal('created');
    });

    it('reports bounded bootstrap-safe indexing warnings for false, rejection, and unavailability', async function () {
      const createOid = 'bootstrap-index-warning';
      mockStorageService.create.resolves({
        success: true,
        oid: createOid,
        applicationState: 'applied',
        message: 'created',
      });
      mockStorageService.getMeta.resolves({
        redboxOid: createOid,
        metadata: { title: 'Bootstrap record' },
        metaMetadata: { type: 'bootstrap-record' },
      });
      sinon.stub(RecordsService, 'auditRecord').resolves();
      const scenarios = [
        { name: 'false acceptance', configure: () => mockSearchService.index.resolves(false), called: true },
        {
          name: 'rejection',
          configure: () => mockSearchService.index.rejects(new Error('private index failure')),
          called: true,
        },
        {
          name: 'unavailable service',
          configure: () => {
            RecordsService.searchService = undefined;
          },
          called: false,
        },
      ];

      for (const scenario of scenarios) {
        mockStorageService.create.resetHistory();
        mockStorageService.getMeta.resetHistory();
        mockSearchService.index.resetHistory();
        RecordsService.searchService = mockSearchService;
        scenario.configure();

        const result = await RecordsService.create(
          { id: 'brand-1' },
          { redboxOid: createOid, metadata: { title: 'Bootstrap record' } },
          {},
          { username: 'bootstrap-service' },
          false,
          false
        );

        expect(result.wasPersisted(), scenario.name).to.equal(true);
        expect(result.outcome, scenario.name).to.equal('saved-with-warnings');
        expect(result.message, scenario.name).to.equal('created');
        expect(result.problems, scenario.name).to.deep.equal([
          {
            kind: 'processing',
            phase: 'post-save',
            issues: [{ code: 'record-index-failed', message: '@record-save-record-index-failed' }],
          },
        ]);
        expect(mockSearchService.index.called, scenario.name).to.equal(scenario.called);
      }
      RecordsService.searchService = mockSearchService;
      expect(JSON.stringify(mockSails.log.warn.args)).not.to.contain('private index failure');
    });
  });

  describe('create save outcomes', function () {
    it('returns a typed not-saved result for a storage rejection', async function () {
      mockStorageService.create.resolves({ success: false, oid: 'new-record-123', applicationState: 'not-applied' });

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: {} },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        false,
        false
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('save-not-applied');
    });

    it('returns an unknown result when storage cannot confirm a configured create', async function () {
      mockStorageService.create.resolves({ success: false, oid: 'new-record-123' });

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: {} },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        false,
        false
      );

      expect(result.outcome).to.equal('unknown');
      expect(result.problems[0].issues[0].code).to.equal('save-unknown');
    });

    it('converts malformed create hooks into a pre-save problem', async function () {
      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: {} },
        { name: 'rdmp', hooks: { onCreate: { pre: [{ function: '({ invalid: true })' }] } }, searchable: false },
        { username: 'user-1' },
        false,
        false
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('invalid-hook-configuration');
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('stops before persistence when the attachment journal cannot be prepared', async function () {
      const markMutation = sinon.stub().resolves(true);
      mockSails.services.attachmentmetadataservice = {
        prepareMutations: sinon.stub().rejects(new Error('journal unavailable')),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation,
      };
      (global as any).FormsService.getForm.resolves({
        name: 'default-form',
        configuration: { attachmentFields: ['attachments'] },
      });
      (global as any).FormsService.getFormByName.returns(
        of({ name: 'default-form', configuration: { attachmentFields: ['attachments'] } })
      );

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { attachments: [{ fileId: 'file-1' }] } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        false,
        false
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('attachment-journal-failed');
      expect(mockStorageService.create.notCalled).to.equal(true);
      expect(markMutation.calledOnce).to.equal(true);
    });
  });

  describe('updateMeta save outcomes', function () {
    const updateRecord = () => ({
      metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
      metadata: {},
      authorization: {},
    });

    beforeEach(function () {
      mockStorageService.getMeta.resolves({
        redboxOid: 'record-123',
        ...updateRecord(),
        revision: 1,
      });
      (global as any).FormsService.getFormByName.returns(
        of({ name: 'default-form', configuration: { attachmentFields: [] } })
      );
      (global as any).RecordTypesService.get.returns(of({ name: 'rdmp', hooks: {}, searchable: false }));
    });

    it('returns not-saved when update persistence is explicitly rejected', async function () {
      mockStorageService.updateMeta.resolves({ success: false, applicationState: 'not-applied' });
      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        updateRecord(),
        { username: 'user-1' },
        false,
        false
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('save-not-applied');
    });

    it('returns unknown when update persistence is ambiguous', async function () {
      mockStorageService.updateMeta.resolves({ success: false });
      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        updateRecord(),
        { username: 'user-1' },
        false,
        false
      );

      expect(result.outcome).to.equal('unknown');
      expect(result.problems[0].issues[0].code).to.equal('save-unknown');
    });

    it('returns a pre-save problem when update journal reconciliation cannot be read', async function () {
      mockSails.services.attachmentmetadataservice = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().rejects(new Error('journal read failed')),
      };
      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        updateRecord(),
        { username: 'user-1' },
        false,
        false
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('attachment-journal-failed');
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('reports a warning when physical attachment work fails after metadata commits', async function () {
      mockSails.services.attachmentmetadataservice = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation: sinon.stub().resolves(true),
      };
      mockDatastreamService.addDatastream = sinon.stub().rejects(new Error('upload failed'));
      (global as any).FormsService.getFormByName.returns(
        of({ name: 'default-form', configuration: { attachmentFields: ['attachments'] } })
      );
      mockStorageService.getMeta.resolves({
        redboxOid: 'record-123',
        metadata: { attachments: [{ attachmentId: 'a', fileId: 'new-file', pending: false }] },
      });

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        { ...updateRecord(), metadata: { attachments: [{ attachmentId: 'a', fileId: 'old-file' }] } },
        { username: 'user-1' },
        false,
        false,
        {},
        {
          metadata: { attachments: [{ attachmentId: 'a', fileId: 'new-file' }] },
          mode: 'replace',
        }
      );

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.problems[0].issues[0].code).to.equal('attachment-finalization-failed');
      expect(result.completion.attachments.status).to.equal('unknown');
    });
  });

  describe('authoritative record validation integration', function () {
    const baseRecord = (title = 'Original') => ({
      redboxOid: 'record-123',
      metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
      metadata: { title },
      workflow: { stage: 'draft' },
      authorization: { edit: ['user-1'], view: [], editRoles: [], viewRoles: [] },
    });

    const allowResult = (
      overrides: Partial<Omit<UnresolvedRecordValidationResult, 'status' | 'shouldBlock'>> = {}
    ): UnresolvedRecordValidationResult => ({
      status: 'unresolved',
      shouldBlock: false,
      mode: 'shadow',
      diagnostics: [],
      ...overrides,
    });

    const resolvedResult = (
      overrides: Partial<Omit<ResolvedRecordValidationResult, 'status'>> = {}
    ): ResolvedRecordValidationResult =>
      buildResolvedRecordValidationResult(
        {
          candidate: {
            metadata: {},
            metaMetadata: {
              brandId: 'brand-1',
              type: 'rdmp',
              form: 'default-form',
            },
          },
          writeKind: 'create',
          actor: { authenticated: true, roles: [] },
        },
        overrides
      );

    const blockingResult = (
      overrides: Partial<Omit<ResolvedRecordValidationResult, 'status'>> = {}
    ): ResolvedRecordValidationResult =>
      resolvedResult({
        shouldBlock: true,
        mode: 'enforce',
        blockingErrors: [{ message: '@validator-required', field: 'title', class: 'RequiredValidator' }],
        ...overrides,
      });

    const installAuthoritativeStorage = (initialRecord?: any) => {
      let committedRecord = initialRecord === undefined ? undefined : structuredClone(initialRecord);
      const storageIdentity = initialRecord
        ? {
            ...(initialRecord.id !== undefined ? { id: initialRecord.id } : {}),
            ...(initialRecord._id !== undefined ? { _id: initialRecord._id } : {}),
          }
        : {};
      const commit = (oid: string, candidate: any) => {
        committedRecord = {
          ...structuredClone(candidate),
          redboxOid: oid,
          ...storageIdentity,
        };
      };
      mockStorageService.getMeta.callsFake(async () =>
        committedRecord === undefined ? null : structuredClone(committedRecord)
      );
      mockStorageService.create.callsFake(async (_brand: unknown, candidate: any) => {
        const oid = String(candidate.redboxOid);
        commit(oid, candidate);
        return { success: true, oid, applicationState: 'applied' };
      });
      mockStorageService.updateMeta.callsFake(async (_brand: unknown, oid: string, candidate: any) => {
        commit(oid, candidate);
        return { success: true, oid, applicationState: 'applied' };
      });
      return { commit };
    };

    const resolvedAllowResult = (
      candidate: RecordValidationCandidate,
      overrides: Partial<Omit<ResolvedRecordValidationResult, 'status' | 'transformedCandidate'>> = {}
    ): ResolvedRecordValidationResult =>
      resolvedResult({
        transformedCandidate: candidate,
        ...overrides,
      });

    const createSchemaResolution = (
      kind: 'resolved' | 'partial',
      enforcement: 'shadow' | 'enforce' = 'shadow',
      portal = 'portal',
      branding = 'brand-1'
    ) => ({
      kind,
      document: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `/${encodeURIComponent(branding)}/${encodeURIComponent(portal)}/api/records/schemas/${'a'.repeat(64)}`,
        type: 'object',
      },
      digest: 'a'.repeat(64),
      grant: {},
      metadata: {
        schemaKind: 'create',
        contractFormat: 'redbox-record-contract/1',
        completeness: kind === 'partial' ? 'partial' : 'complete',
        byteLength: 128,
        etag: `"sha256:${'a'.repeat(64)}"`,
        context: {
          brand: branding,
          portal,
          kind: 'create',
          recordType: 'rdmp',
          workflowStep: 'draft',
          form: 'default-form',
          operation: 'publish',
          unknownProperties: 'allow',
          enforcement,
        },
      },
    });

    const updateSchemaResolution = (
      enforcement: 'shadow' | 'enforce' = 'enforce',
      unknownProperties: 'allow' | 'declared' = 'allow',
      operation = 'publish'
    ) => ({
      kind: 'resolved' as const,
      document: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `/brand-1/portal/api/records/schemas/${'b'.repeat(64)}`,
        type: 'object',
        ...(unknownProperties === 'declared' ? { additionalProperties: false } : {}),
      },
      digest: 'b'.repeat(64),
      grant: {},
      metadata: {
        schemaKind: 'update' as const,
        contractFormat: 'redbox-record-contract/1' as const,
        completeness: 'complete' as const,
        byteLength: 128,
        etag: `"sha256:${'b'.repeat(64)}"`,
        context: {
          brand: 'brand-1',
          portal: 'portal',
          kind: 'update' as const,
          recordType: 'rdmp',
          workflowStep: 'draft',
          form: 'default-form',
          operation,
          unknownProperties,
          enforcement,
        },
      },
    });

    const enableRecordSchema = () => {
      mockSails.config.recordSchema = { enabled: 'true' };
      mockSails.config.auth = { ...mockSails.config.auth, defaultPortal: 'portal' };
    };

    const enableInternalRecordMutationStorage = () => {
      mockStorageService.getCapabilities = sinon.stub().returns({
        recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
      });
    };

    const disabledRecordSchemaArtifacts = {
      documentMarker: 'private-disabled-schema-document-marker',
      digest: 'd'.repeat(64),
      immutableUrl: `/brand-1/portal/api/records/schemas/${'d'.repeat(64)}`,
      contractFormat: 'private-disabled-schema-contract-marker',
      completeness: 'private-disabled-schema-completeness-marker',
      enforcement: 'private-disabled-schema-enforcement-marker',
      grantMarker: 'private-disabled-schema-grant-marker',
      authorizationContextMarker: 'private-disabled-schema-authorization-context-marker',
    } as const;

    type RecordSchemaStorageSpies = {
      [Method in RecordSchemaStorageCapabilityMethod]: sinon.SinonStub<
        Parameters<NonNullable<StorageService[Method]>>,
        ReturnType<NonNullable<StorageService[Method]>>
      >;
    };

    const recordSchemaStorageSpies = (): RecordSchemaStorageSpies => ({
      putRecordSchemaArtifact: sinon.stub<
        Parameters<NonNullable<StorageService['putRecordSchemaArtifact']>>,
        ReturnType<NonNullable<StorageService['putRecordSchemaArtifact']>>
      >(),
      getRecordSchemaArtifact: sinon.stub<
        Parameters<NonNullable<StorageService['getRecordSchemaArtifact']>>,
        ReturnType<NonNullable<StorageService['getRecordSchemaArtifact']>>
      >(),
      listRecordSchemaArtifacts: sinon.stub<
        Parameters<NonNullable<StorageService['listRecordSchemaArtifacts']>>,
        ReturnType<NonNullable<StorageService['listRecordSchemaArtifacts']>>
      >(),
      touchRecordSchemaArtifact: sinon.stub<
        Parameters<NonNullable<StorageService['touchRecordSchemaArtifact']>>,
        ReturnType<NonNullable<StorageService['touchRecordSchemaArtifact']>>
      >(),
      putRecordSchemaReference: sinon.stub<
        Parameters<NonNullable<StorageService['putRecordSchemaReference']>>,
        ReturnType<NonNullable<StorageService['putRecordSchemaReference']>>
      >(),
      listRecordSchemaGrants: sinon.stub<
        Parameters<NonNullable<StorageService['listRecordSchemaGrants']>>,
        ReturnType<NonNullable<StorageService['listRecordSchemaGrants']>>
      >(),
      listRecordSchemaReferences: sinon.stub<
        Parameters<NonNullable<StorageService['listRecordSchemaReferences']>>,
        ReturnType<NonNullable<StorageService['listRecordSchemaReferences']>>
      >(),
      deleteRecordSchemaArtifactIfUnreferenced: sinon.stub<
        Parameters<NonNullable<StorageService['deleteRecordSchemaArtifactIfUnreferenced']>>,
        ReturnType<NonNullable<StorageService['deleteRecordSchemaArtifactIfUnreferenced']>>
      >(),
    });

    const installDisabledRecordSchemaHarness = () => {
      const disabledResolution = {
        kind: 'resolved',
        document: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          privateMarker: disabledRecordSchemaArtifacts.documentMarker,
        },
        digest: disabledRecordSchemaArtifacts.digest,
        immutableUrl: disabledRecordSchemaArtifacts.immutableUrl,
        grant: {
          privateGrantData: disabledRecordSchemaArtifacts.grantMarker,
          authorizationContext: disabledRecordSchemaArtifacts.authorizationContextMarker,
        },
        metadata: {
          schemaKind: 'update',
          contractFormat: disabledRecordSchemaArtifacts.contractFormat,
          completeness: disabledRecordSchemaArtifacts.completeness,
          enforcement: disabledRecordSchemaArtifacts.enforcement,
        },
      };
      const schemaService = {
        resolveCreate: sinon.stub().resolves(disabledResolution),
        resolveUpdate: sinon.stub().resolves(disabledResolution),
        validateResolvedArtifact: sinon.stub().returns({
          kind: 'validated',
          valid: true,
          issues: [],
          truncated: false,
        }),
        persistSaveUsageReference: sinon.stub(),
      };
      const schemaStorage = recordSchemaStorageSpies();
      mockSails.config.recordSchema = { enabled: false };
      mockSails.services.recordschemaservice = schemaService;
      Object.assign(mockStorageService, schemaStorage);
      return { schemaService, schemaStorage };
    };

    const expectNoDisabledRecordSchemaDataPersisted = (candidate: unknown): void => {
      assertUnknownRecord(candidate);
      const persisted = JSON.stringify(candidate);
      expect(persisted).not.to.include(disabledRecordSchemaArtifacts.documentMarker);
      expect(persisted).not.to.include(disabledRecordSchemaArtifacts.digest);
      expect(persisted).not.to.include(disabledRecordSchemaArtifacts.immutableUrl);
      expect(persisted).not.to.include(disabledRecordSchemaArtifacts.contractFormat);
      expect(persisted).not.to.include(disabledRecordSchemaArtifacts.completeness);
      expect(persisted).not.to.include(disabledRecordSchemaArtifacts.enforcement);
      expect(persisted).not.to.include(disabledRecordSchemaArtifacts.grantMarker);
      expect(persisted).not.to.include(disabledRecordSchemaArtifacts.authorizationContextMarker);
      expect(persisted).not.to.include('"schemaOutcome"');
    };

    const expectDisabledRecordSchemaInert = (harness: ReturnType<typeof installDisabledRecordSchemaHarness>): void => {
      expect(harness.schemaService.resolveCreate.notCalled).to.equal(true);
      expect(harness.schemaService.resolveUpdate.notCalled).to.equal(true);
      expect(harness.schemaService.validateResolvedArtifact.notCalled).to.equal(true);
      expect(harness.schemaService.persistSaveUsageReference.notCalled).to.equal(true);
      for (const capability of RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS) {
        expect(harness.schemaStorage[capability].notCalled, capability).to.equal(true);
      }
    };

    const recordedSchemaUsageResult = (
      request: PersistRecordSchemaSaveUsageRequest
    ): Extract<PersistRecordSchemaSaveUsageResult, { readonly kind: 'recorded' }> => ({
      kind: 'recorded',
      reference: {
        digest: request.digest,
        referenceKey: `save:${createHash('sha256')
          .update(
            serializeRedboxCanonicalJsonV1({
              digest: request.digest,
              brand: request.brand,
              portal: request.portal,
              schemaKind: request.schemaKind,
              recordType: request.recordType,
              operation: request.operation,
              oid: request.oid,
              kind: 'save',
              saveIdentity: request.saveIdentity,
            }),
            'utf8'
          )
          .digest('hex')}`,
      },
    });

    const recordedSchemaUsage = (): sinon.SinonStub<
      [request: PersistRecordSchemaSaveUsageRequest],
      Promise<PersistRecordSchemaSaveUsageResult>
    > =>
      sinon
        .stub<[request: PersistRecordSchemaSaveUsageRequest], Promise<PersistRecordSchemaSaveUsageResult>>()
        .callsFake(async request => recordedSchemaUsageResult(request));

    const recordSchemaContext = (options: Parameters<typeof createRecordSaveContext>[0] = {}): RecordSaveContext =>
      createRecordSaveContext({ portal: 'portal', ...options });

    const richHtmlForm = (name = 'default-form'): FormConfigFrame => ({
      name,
      type: 'rdmp',
      componentDefinitions: [
        {
          name: 'description',
          component: { class: 'RichTextEditorComponent' },
          model: { class: 'RichTextEditorModel' },
        },
      ],
    });

    const businessValidationForm = (): FormConfigFrame => ({
      name: 'default-form',
      type: 'rdmp',
      componentDefinitions: [
        {
          name: 'title',
          component: {
            class: 'SimpleInputComponent',
            config: { type: 'text' },
          },
          model: {
            class: 'SimpleInputModel',
            config: { validators: [{ class: 'required' }] },
          },
        },
        {
          name: 'score',
          component: {
            class: 'SimpleInputComponent',
            config: { type: 'number' },
          },
          model: {
            class: 'SimpleInputModel',
            config: { validators: [{ class: 'min', config: { min: 10 } }] },
          },
        },
        {
          name: 'approval',
          component: {
            class: 'SimpleInputComponent',
            config: { type: 'text' },
          },
          model: {
            class: 'SimpleInputModel',
            config: {
              validators: [
                {
                  class: 'jsonata-expression',
                  config: { expression: '$ = "approved"' },
                },
              ],
            },
          },
        },
      ],
    });

    const successfulStorageResponse = (): StorageServiceResponse => {
      const response = new StorageServiceResponse();
      response.success = true;
      return response;
    };

    const installGeneratedSchemaValidationPipeline = () => {
      const form = businessValidationForm();
      mockSails.config.recordSchema = { ...recordSchema, enabled: true };
      mockSails.config.recordValidation = {
        mode: 'enforce',
        timeoutMs: 5_000,
        allowedRequestParameters: [],
      };
      mockSails.config.validators = {
        definitions: formValidatorsSharedDefinitions,
      };
      mockSails.config.reusableFormDefinitions = {};

      const validationDependencies: Partial<RecordValidationServiceDependencies> = {
        loadRecordType: async () => ({
          id: 'record-type-1',
          name: 'rdmp',
          recordValidation: { mode: 'enforce' },
        }),
        loadStartingWorkflowStep: async () => ({
          name: 'draft',
          starting: true,
          config: { form: 'default-form' },
        }),
        loadWorkflowStep: async (_recordType, step) => ({
          name: step,
          config: { form: 'default-form' },
        }),
        loadWorkflowSteps: async () => [],
        loadForm: async (formName, brand) => {
          const loadedForm: FormAttributes = {
            id: `form-${formName}`,
            name: formName,
            branding: brand,
            configuration: form,
          };
          return loadedForm;
        },
      };
      const validationService = new RecordValidationServices.RecordValidation(validationDependencies);
      const businessValidation = sinon.spy(validationService, 'resolve');
      mockSails.services.recordvalidationservice = validationService;

      const formRecord: FormAttributes = {
        id: 'form-default-form',
        name: 'default-form',
        branding: 'brand-1',
        configuration: form,
      };
      mockFormsService.getForm.resolves(formRecord);
      mockFormsService.getFormByName.returns(of(formRecord));

      const registry = new RecordContractContributorRegistry(
        createCoreRecordContractContributors().map(contributor => ({
          contributor,
          source: 'core' as const,
        }))
      );
      const schemaStorage = {
        putRecordSchemaArtifact: sinon.stub().callsFake(async () => successfulStorageResponse()),
        putRecordSchemaReference: sinon.stub().callsFake(async () => successfulStorageResponse()),
      };
      const schemaService = new RecordSchemaServices.RecordSchema({
        getConfig: () => ({ ...recordSchema, enabled: true }),
        getStorageProvider: () => schemaStorage,
        getContributorRegistry: () => registry,
        resolveContractContext: async request => {
          if (request.kind !== 'create') throw new Error('Expected a create contract context.');
          return {
            publicContext: {
              brand: request.brand,
              portal: request.portal,
              kind: 'create',
              recordType: request.recordType,
              workflowStep: request.targetStep ?? 'draft',
              form: 'default-form',
              operation: request.operation ?? 'strict-all',
              unknownProperties: 'allow',
              enforcement: 'enforce',
            },
            resolution: {
              sourceFormFingerprint: 'c'.repeat(64),
              sourceForm: form,
              reusableFormDefinitions: {},
              actor: request.actor,
              formMode: 'edit',
              contextVariables: {},
            },
          };
        },
        buildContractFormConfig: async () => ({
          ok: true,
          effectiveForm: form,
        }),
      });
      const resolveCreate = sinon.spy(schemaService, 'resolveCreate');
      const validateResolvedArtifact = sinon.spy(schemaService, 'validateResolvedArtifact');
      const persistSaveUsageReference = sinon.spy(schemaService, 'persistSaveUsageReference');
      mockSails.services.recordschemaservice = schemaService;

      return {
        businessValidation,
        persistSaveUsageReference,
        resolveCreate,
        schemaService,
        schemaStorage,
        validateResolvedArtifact,
      };
    };

    const installRichHtmlValidation = (
      mode: 'shadow' | 'enforce',
      htmlSanitizationMode: 'sanitize' | 'reject' = 'sanitize',
      executeValidators?: NonNullable<RecordValidationServiceDependencies['executeValidators']>,
      collectTransformations?: NonNullable<RecordValidationServiceDependencies['collectTransformations']>
    ) => {
      mockSails.config.recordValidation = { mode, timeoutMs: 5_000, allowedRequestParameters: [] };
      mockSails.config.record.form = { htmlSanitizationMode, returnMetadataOnSave: true };
      mockSails.config.dompurify = {
        profiles: {
          html: { USE_PROFILES: { html: true } },
          svg: { USE_PROFILES: { svg: true } },
        },
        defaultProfile: 'html',
      };
      mockSails.config.validators = { definitions: formValidatorsSharedDefinitions };
      mockSails.config.reusableFormDefinitions = {};
      (global as any).DomSanitizerService = new DomSanitizerServices.DomSanitizer();
      const dependencies: Partial<RecordValidationServiceDependencies> = {
        loadRecordType: async () => ({ id: 'record-type-1', name: 'rdmp', recordValidation: { mode } }),
        loadStartingWorkflowStep: async () => ({
          name: 'draft',
          starting: true,
          config: { form: 'default-form' },
        }),
        loadWorkflowStep: async (_recordType, step) => ({ name: step, config: { form: `${step}-form` } }),
        loadWorkflowSteps: async () => [],
        loadForm: async (formName, brand) =>
          ({
            id: `form-${formName}`,
            name: formName,
            branding: brand,
            configuration: richHtmlForm(formName),
          }) as FormAttributes,
        ...(executeValidators
          ? {
              collectTransformations: async (form, checkDeadline) =>
                collectTransformations
                  ? await collectTransformations(form, checkDeadline)
                  : (
                      await new ValidatorFormConfigVisitor(mockSails.log).startWithResult({
                        form,
                        transformationOnly: true,
                        checkDeadline,
                      })
                    ).transformations,
              executeValidators,
            }
          : {}),
      };
      const validationService = new RecordValidationServices.RecordValidation(dependencies);
      const resolve = sinon.spy(validationService, 'resolve');
      mockSails.services.recordvalidationservice = validationService;
      (global as any).FormsService.getForm.resolves({
        name: 'default-form',
        configuration: richHtmlForm(),
      });
      (global as any).FormsService.getFormByName.callsFake((formName: string) =>
        of({
          name: formName,
          configuration: richHtmlForm(formName),
        })
      );
      return { resolve };
    };

    it('rejects a public create with a missing or malformed authoritative record type', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const preHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      for (const recordType of [{}, { name: '../malformed-type' }]) {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Caller type is not authority' }, metaMetadata: { type: 'rdmp' } },
          recordType,
          { username: 'user-1' },
          true,
          true,
          undefined,
          createRecordSaveContext({ routeFamily: 'browser', operation: 'create' })
        );

        expect(result.outcome).to.equal('not-saved');
        expect(result.problems[0].issues[0].code).to.equal('record-validation-form-resolution-failed');
      }
      expect(preHook.notCalled).to.equal(true);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('keeps tokenless browser creates compatible unless the record type opts into strict form binding', async function () {
      const candidate = {
        metadata: { title: 'Compatibility create' },
        authorization: { edit: ['user-1'], view: ['user-1'], editRoles: [], viewRoles: [] },
      };
      const context = createRecordSaveContext({
        routeFamily: 'browser',
        operation: 'create',
        concurrency: { entityTagSupplied: false },
      });
      mockStorageService.getCapabilities = sinon.stub().returns({
        recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
      });

      for (const mode of ['last-write-wins', 'observe'] as const) {
        mockStorageService.create.resetHistory();
        (global as any).RecordValidationService.resolve.resetHistory();
        const result = await RecordsService.create(
          { id: 'brand-1' },
          candidate,
          { name: 'rdmp', hooks: {}, searchable: false, concurrentModification: { mode } },
          { username: 'user-1' },
          true,
          false,
          undefined,
          context
        );

        expect(mockStorageService.create.calledOnce, mode).to.equal(true);
        expect(
          result.problems.flatMap((problem: any) => problem.issues).map((issue: any) => issue.code),
          mode
        ).not.to.include('form-definition-changed');
      }

      mockStorageService.create.resetHistory();
      (global as any).RecordValidationService.resolve.resetHistory();
      const strict = await RecordsService.create(
        { id: 'brand-1' },
        candidate,
        { name: 'rdmp', hooks: {}, searchable: false, concurrentModification: { mode: 'strict' } },
        { username: 'user-1' },
        true,
        false,
        undefined,
        context
      );

      expect(strict.outcome).to.equal('not-saved');
      expect(strict.problems[0].issues[0].code).to.equal('form-definition-changed');
      expect(strict.concurrency?.formFingerprint).to.match(/^sha256:[0-9a-f]{64}$/);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('validates the final pre-hook create candidate before attachment preparation or storage', async function () {
      const journal = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation: sinon.stub().resolves(true),
        rebindOid: sinon.stub().resolves(),
      };
      mockSails.services.attachmentmetadataservice = journal;
      (global as any).FormsService.getForm.resolves({
        name: 'default-form',
        configuration: { attachmentFields: ['attachments'] },
      });
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.callsFake(async (request: any) => {
        expect(request.candidate.metadata.title).to.equal('Mutated by pre-hook');
        expect(request.writeKind).to.equal('create');
        return blockingResult();
      });

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Original', attachments: [{ fileId: 'file-secret', pending: true }] } },
        {
          name: 'rdmp',
          hooks: {
            onCreate: {
              pre: [
                {
                  function:
                    '(_oid, record) => ({ ...record, metadata: { ...record.metadata, title: "Mutated by pre-hook" } })',
                },
              ],
            },
          },
          searchable: false,
        },
        { username: 'user-1' }
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0]).to.deep.include({ kind: 'validation', phase: 'pre-save' });
      expect(result.problems[0].issues[0].code).to.equal('record-validation-failed');
      expect(journal.prepareMutations.notCalled).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
      expect(mockDatastreamService.addDatastream?.notCalled ?? true).to.equal(true);
    });

    it('runs create structural validation on the normalized operation and raw metadata in the exact save order', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'shadow' };
      const rawMetadata = { title: 'Raw title', nested: { count: 1 } };
      const callerRecord = {
        metadata: structuredClone(rawMetadata),
        authorization: { edit: ['user-1'], view: ['user-1'], editRoles: [], viewRoles: [] },
      };
      const resolution = createSchemaResolution('resolved', 'shadow', 'tenant-portal', 'default');
      resolution.document['x-private-test-marker'] = 'private-schema-document-marker';
      resolution.grant = {
        privateGrantData: 'private-grant-marker',
        authorizationContext: { subject: 'private-authorization-context-marker' },
      };
      const resolveCreate = sinon.stub().resolves(resolution);
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      const persistSaveUsageReference = recordedSchemaUsage();
      mockSails.services.recordschemaservice = {
        resolveCreate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };
      const authorize = sinon.spy(RecordsService, 'hasPublicEditAuthorization');
      const transitionMetadata = sinon.spy(RecordsService as any, 'transitionWorkflowStepMetadata');
      const initializeMetadata = sinon.spy(RecordsService as any, 'initRecordMetaMetadata');
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');
      const businessValidation = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      businessValidation.resolves(allowResult());

      const result = await RecordsService.create(
        { id: 'brand-1', name: 'default' },
        callerRecord,
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1', roles: [{ name: 'Researcher' }, { name: 'Publisher' }] },
        true,
        false,
        undefined,
        recordSchemaContext({
          routeFamily: 'api',
          operation: 'create',
          portal: '  tenant-portal  ',
          validationOperation: '  publish  ',
        })
      );

      expect(result.outcome).to.equal('saved');
      expect(
        resolveCreate.calledOnceWithExactly({
          brand: 'brand-1',
          branding: 'default',
          portal: 'tenant-portal',
          recordType: 'rdmp',
          operation: 'publish',
          targetStep: undefined,
          actor: { authenticated: true, roles: ['Researcher', 'Publisher'] },
        })
      ).to.equal(true);
      expect(validateResolvedArtifact.calledOnce).to.equal(true);
      expect(validateResolvedArtifact.firstCall.args[0]).to.deep.include({
        digest: 'a'.repeat(64),
        schemaKind: 'create',
        input: rawMetadata,
      });
      expect(validateResolvedArtifact.firstCall.args[0].document).to.equal(resolution.document);
      expect(callerRecord.metadata).to.deep.equal(rawMetadata);
      expect(authorize.calledBefore(resolveCreate)).to.equal(true);
      expect(resolveCreate.calledBefore(validateResolvedArtifact)).to.equal(true);
      expect(validateResolvedArtifact.calledBefore(transitionMetadata)).to.equal(true);
      expect(transitionMetadata.calledBefore((global as any).FormsService.getForm)).to.equal(true);
      expect((global as any).FormsService.getForm.calledBefore(initializeMetadata)).to.equal(true);
      expect(initializeMetadata.calledBefore(preSaveHook)).to.equal(true);
      expect(preSaveHook.calledBefore(businessValidation)).to.equal(true);
      expect(businessValidation.calledBefore(mockStorageService.create)).to.equal(true);
      expect(mockStorageService.create.calledBefore(persistSaveUsageReference)).to.equal(true);
      expect(
        persistSaveUsageReference.calledOnceWithExactly({
          digest: 'a'.repeat(64),
          brand: 'default',
          portal: 'tenant-portal',
          schemaKind: 'create',
          recordType: 'rdmp',
          oid: result.oid,
          operation: 'publish',
          saveIdentity: result.requestId,
        })
      ).to.equal(true);
      expect(result.schemaOutcome).to.deep.equal({
        digest: 'a'.repeat(64),
        immutableUrl: `/default/tenant-portal/api/records/schemas/${'a'.repeat(64)}`,
        completeness: 'complete',
        enforcement: 'shadow',
      });
      const storageCandidates = [
        ...mockStorageService.create.getCalls().map(call => call.args[1]),
        ...mockStorageService.updateMeta.getCalls().map(call => call.args[2]),
      ];
      expect(storageCandidates).to.have.length.greaterThan(0);
      for (const candidate of storageCandidates) {
        const persisted = JSON.stringify(candidate);
        expect(persisted).not.to.include('private-schema-document-marker');
        expect(persisted).not.to.include('private-grant-marker');
        expect(persisted).not.to.include('private-authorization-context-marker');
        expect(persisted).not.to.include('"schemaOutcome"');
        expect(persisted).not.to.include('"immutableUrl"');
        expect(persisted).not.to.include('"completeness"');
        expect(persisted).not.to.include('"enforcement"');
        expect(persisted).not.to.include('a'.repeat(64));
      }
      expect(persistSaveUsageReference.firstCall.args[0]).to.have.all.keys(
        'digest',
        'brand',
        'portal',
        'schemaKind',
        'recordType',
        'oid',
        'operation',
        'saveIdentity'
      );
      expect(JSON.stringify(result.problems)).not.to.include(result.schemaOutcome?.digest);
    });

    it('keeps a confirmed create saved-with-warnings when its schema usage reference cannot be persisted', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const resolveCreate = sinon.stub().resolves(createSchemaResolution('resolved', 'enforce'));
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      const persistSaveUsageReference = sinon.stub().callsFake((request: PersistRecordSchemaSaveUsageRequest) => ({
        kind: 'write-failed',
        stage: 'save-reference',
        failureKind: 'storage-unavailable',
        code: 'record-schema.storage-unavailable',
        retryable: true,
        reference: recordedSchemaUsageResult(request).reference,
      }));
      mockSails.services.recordschemaservice = {
        resolveCreate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };
      mockSails.log.error.throws(new Error('diagnostic sink unavailable'));
      mockRecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));

      const result = await RecordsService.create(
        { id: 'brand-1' },
        {
          metadata: { title: 'Persisted before usage failure' },
          authorization: { edit: ['user-1'], view: ['user-1'], editRoles: [], viewRoles: [] },
        },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        false,
        false,
        undefined,
        recordSchemaContext({ routeFamily: 'api', operation: 'create', validationOperation: 'publish' })
      );

      expect(mockStorageService.create.calledOnce).to.equal(true);
      expect(persistSaveUsageReference.calledOnce).to.equal(true);
      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.wasPersisted()).to.equal(true);
      expect(result.schemaOutcome).to.deep.equal({
        digest: 'a'.repeat(64),
        immutableUrl: `/brand-1/portal/api/records/schemas/${'a'.repeat(64)}`,
        completeness: 'complete',
        enforcement: 'enforce',
      });
      expect(result.problems).to.deep.equal([
        {
          kind: 'system',
          phase: 'post-save',
          issues: [
            {
              code: 'record-schema-save-usage-failed',
              message: '@record-schema-save-usage-failed',
            },
          ],
        },
      ]);
      expect(mockSails.log.error.lastCall.args[1]).to.deep.equal({
        event: 'record_schema_save_usage_persistence_failed',
        schema_kind: 'create',
        result: 'write-failed',
        code: 'record-schema.storage-unavailable',
      });
      expect(JSON.stringify(mockSails.log.error.lastCall.args)).not.to.include('Persisted before usage failure');
      expect(JSON.stringify(mockSails.log.error.lastCall.args)).not.to.include('a'.repeat(64));
    });

    it('normalizes a mismatched schema usage reference after persistence', async function () {
      enableRecordSchema();
      const persistSaveUsageReference = sinon.stub().callsFake((request: PersistRecordSchemaSaveUsageRequest) => ({
        kind: 'recorded',
        reference: {
          ...recordedSchemaUsageResult(request).reference,
          digest: 'b'.repeat(64),
        },
      }));
      mockSails.services.recordschemaservice = {
        resolveCreate: sinon.stub().resolves(createSchemaResolution('resolved', 'enforce')),
        validateResolvedArtifact: sinon.stub().returns({
          kind: 'validated',
          valid: true,
          issues: [],
          truncated: false,
        }),
        persistSaveUsageReference,
      };
      mockRecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Persist despite mismatched usage reference' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        false,
        false,
        undefined,
        recordSchemaContext()
      );

      expect(mockStorageService.create.calledOnce).to.equal(true);
      expect(persistSaveUsageReference.calledOnce).to.equal(true);
      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.wasPersisted()).to.equal(true);
      expect(result.problems[0]).to.deep.include({ kind: 'system', phase: 'post-save' });
      expect(mockSails.log.error.lastCall.args[1]).to.deep.equal({
        event: 'record_schema_save_usage_persistence_failed',
        schema_kind: 'create',
        result: 'unavailable',
        code: 'record-schema.storage-unavailable',
      });
    });

    it('keeps required, range, and custom validator summaries annotation-only in a generated schema artifact', async function () {
      const { schemaService } = installGeneratedSchemaValidationPipeline();
      const resolution = await schemaService.resolveCreate({
        brand: 'brand-1',
        portal: 'portal',
        recordType: 'rdmp',
        actor: { authenticated: true, roles: [] },
      });
      expect(resolution.kind).to.equal('resolved');
      if (resolution.kind !== 'resolved') throw new Error('Expected a generated create schema artifact.');

      expect(resolution.document).not.to.have.property('required');
      expect(resolution.document.properties?.score).not.to.have.property('minimum');
      expect(resolution.document['x-redbox-validation']).to.deep.include.members([
        {
          code: 'form.required',
          pointers: ['/title'],
          groups: [],
          operations: [],
          blocking: true,
        },
        {
          code: 'form.min',
          pointers: ['/score'],
          groups: [],
          operations: [],
          blocking: true,
        },
        {
          code: 'form.custom',
          pointers: ['/approval'],
          groups: [],
          operations: [],
          blocking: true,
        },
      ]);
      expect(
        schemaService.validateResolvedArtifact({
          document: resolution.document,
          digest: resolution.digest,
          schemaKind: 'create',
          input: { title: '', score: 9, approval: 'rejected' },
        })
      ).to.deep.equal({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
    });

    it('runs the create business validator once after schema validation and configured pre-save hooks', async function () {
      const { businessValidation, persistSaveUsageReference, resolveCreate, schemaStorage, validateResolvedArtifact } =
        installGeneratedSchemaValidationPipeline();
      const recordType = {
        name: 'rdmp',
        hooks: {
          onCreate: {
            pre: [
              {
                function:
                  '(_oid, record) => ({ ...record, metadata: { ...record.metadata, runBeforeValidatorCount: (record.metadata.runBeforeValidatorCount ?? 0) + 1 } })',
              },
            ],
          },
        },
        searchable: false,
      };
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');
      const cases: readonly {
        name: string;
        metadata: Readonly<Record<string, unknown>>;
        expectedOutcome: 'saved' | 'not-saved';
        expectedClasses: readonly string[];
      }[] = [
        {
          name: 'business-valid',
          metadata: { title: 'Approved', score: 10, approval: 'approved' },
          expectedOutcome: 'saved',
          expectedClasses: [],
        },
        {
          name: 'business-invalid',
          metadata: { title: '', score: 9, approval: 'rejected' },
          expectedOutcome: 'not-saved',
          expectedClasses: ['required', 'min', 'jsonata-expression'],
        },
      ];

      for (const testCase of cases) {
        resolveCreate.resetHistory();
        validateResolvedArtifact.resetHistory();
        preSaveHook.resetHistory();
        businessValidation.resetHistory();
        persistSaveUsageReference.resetHistory();
        schemaStorage.putRecordSchemaReference.resetHistory();
        mockStorageService.create.resetHistory();
        const callerRecord = {
          metadata: structuredClone(testCase.metadata),
          authorization: { edit: ['user-1'], view: ['user-1'], editRoles: [], viewRoles: [] },
        };

        const result = await RecordsService.create(
          { id: 'brand-1' },
          callerRecord,
          recordType,
          { username: 'user-1' },
          true,
          false,
          undefined,
          recordSchemaContext({ routeFamily: 'api', operation: 'create' })
        );

        expect(result.outcome, testCase.name).to.equal(testCase.expectedOutcome);
        expect(resolveCreate.calledOnce, testCase.name).to.equal(true);
        expect(validateResolvedArtifact.calledOnce, testCase.name).to.equal(true);
        expect(validateResolvedArtifact.firstCall.args[0], testCase.name).to.deep.include({ input: testCase.metadata });
        expect(preSaveHook.calledOnce, testCase.name).to.equal(true);
        expect(businessValidation.calledOnce, testCase.name).to.equal(true);
        expect(resolveCreate.calledBefore(validateResolvedArtifact), testCase.name).to.equal(true);
        expect(validateResolvedArtifact.calledBefore(preSaveHook), testCase.name).to.equal(true);
        expect(preSaveHook.calledBefore(businessValidation), testCase.name).to.equal(true);
        const validationRequest: RecordValidationRequest = businessValidation.firstCall.args[0];
        expect(validationRequest.candidate.metadata, testCase.name).to.deep.include({
          ...testCase.metadata,
          runBeforeValidatorCount: 1,
        });
        expect(callerRecord.metadata, testCase.name).to.deep.equal(testCase.metadata);
        const validationResult: RecordValidationResult = await businessValidation.firstCall.returnValue;
        expect(validationResult.status, testCase.name).to.equal('resolved');
        if (validationResult.status !== 'resolved') {
          throw new Error(`Expected resolved business validation for ${testCase.name}.`);
        }
        expect(validationResult.shouldBlock, testCase.name).to.equal(testCase.expectedOutcome === 'not-saved');
        expect(
          validationResult.blockingErrors.map(issue => issue.class),
          testCase.name
        ).to.deep.equal(testCase.expectedClasses);

        if (testCase.expectedOutcome === 'saved') {
          expect(mockStorageService.create.calledOnce, testCase.name).to.equal(true);
          expect(businessValidation.calledBefore(mockStorageService.create), testCase.name).to.equal(true);
          expect(persistSaveUsageReference.calledOnce, testCase.name).to.equal(true);
          expect(result.schemaOutcome?.digest, testCase.name).to.match(/^[0-9a-f]{64}$/);
          expect(result.schemaOutcome, testCase.name).to.deep.include({
            completeness: 'complete',
            enforcement: 'enforce',
          });
          expect(schemaStorage.putRecordSchemaReference.calledTwice, testCase.name).to.equal(true);
          expect(schemaStorage.putRecordSchemaReference.secondCall.firstArg, testCase.name).to.deep.include({
            kind: 'save',
            schemaKind: 'create',
            oid: result.oid,
          });
        } else {
          expect(mockStorageService.create.notCalled, testCase.name).to.equal(true);
          expect(persistSaveUsageReference.notCalled, testCase.name).to.equal(true);
          expect(schemaStorage.putRecordSchemaReference.calledOnce, testCase.name).to.equal(true);
          expect(schemaStorage.putRecordSchemaReference.firstCall.firstArg.kind, testCase.name).to.equal('grant');
          expect(result.schemaOutcome, testCase.name).to.equal(undefined);
          expect(result.problems[0]).to.deep.include({ kind: 'validation', phase: 'pre-save' });
          expect(result.problems[0]).not.to.have.property('source');
          expect(
            result.problems[0].issues.map((issue: RecordSaveIssue) => issue.code),
            testCase.name
          ).to.deep.equal(testCase.expectedClasses.map(() => 'record-validation-failed'));
          expect(
            result.problems[0].issues.map((issue: RecordSaveIssue) => issue.class),
            testCase.name
          ).to.deep.equal(testCase.expectedClasses);
        }
      }
    });

    it('runs update and transition business validation once after raw-delta validation, merge, and hooks', async function () {
      enableRecordSchema();
      const resolveUpdate = sinon.stub().resolves(updateSchemaResolution('enforce'));
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      const persistSaveUsageReference = recordedSchemaUsage();
      mockSails.services.recordschemaservice = {
        resolveUpdate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };
      const recordType = {
        name: 'rdmp',
        hooks: {
          onUpdate: {
            pre: [
              {
                function:
                  '(_oid, record) => ({ ...record, metadata: { ...record.metadata, updateRunBeforeValidatorCount: (record.metadata.updateRunBeforeValidatorCount ?? 0) + 1 } })',
              },
            ],
          },
          onTransitionWorkflow: {
            pre: [
              {
                function:
                  '(_oid, record) => ({ ...record, metadata: { ...record.metadata, transitionRunBeforeValidatorCount: (record.metadata.transitionRunBeforeValidatorCount ?? 0) + 1 } })',
              },
            ],
          },
        },
        searchable: false,
      };
      (global as any).RecordTypesService.get.returns(of(recordType));
      const authorize = sinon.spy(RecordsService, 'hasPublicEditAuthorization');
      const applySubmission = sinon.spy(RecordsService, 'applySubmittedMetadata');
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');
      const transitionPreSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTransitionWorkflowTriggers');
      const businessValidation = mockRecordValidationService.resolve;
      const paths = [
        {
          name: 'api-update',
          routeFamily: 'api' as const,
          operation: 'update' as const,
          targetStep: undefined,
          expectedHookModes: ['onUpdate'],
          expectedHookMetadata: { updateRunBeforeValidatorCount: 1 },
        },
        {
          name: 'browser-update',
          routeFamily: 'browser' as const,
          operation: 'update' as const,
          targetStep: undefined,
          expectedHookModes: ['onUpdate'],
          expectedHookMetadata: { updateRunBeforeValidatorCount: 1 },
        },
        {
          name: 'api-transition',
          routeFamily: 'api' as const,
          operation: 'transition' as const,
          targetStep: 'submitted',
          expectedHookModes: ['onTransitionWorkflow', 'onUpdate'],
          expectedHookMetadata: {
            transitionRunBeforeValidatorCount: 1,
            updateRunBeforeValidatorCount: 1,
          },
        },
      ] as const;
      const cases = [
        {
          name: 'business-valid',
          metadata: { title: 'Approved', score: 10, approval: 'approved' },
          expectedOutcome: 'saved',
        },
        {
          name: 'business-invalid',
          metadata: { title: '', score: 9, approval: 'rejected' },
          expectedOutcome: 'not-saved',
        },
      ] as const;

      for (const path of paths) {
        for (const testCase of cases) {
          const stored = {
            ...baseRecord('Stored'),
            metadata: {
              title: 'Stored',
              score: 12,
              approval: 'approved',
              retained: 'keep',
            },
          };
          const rawDelta = structuredClone(testCase.metadata);
          mockStorageService.getMeta.resolves(structuredClone(stored));
          resolveUpdate.resetHistory();
          validateResolvedArtifact.resetHistory();
          authorize.resetHistory();
          applySubmission.resetHistory();
          preSaveHook.resetHistory();
          transitionPreSaveHook.resetHistory();
          businessValidation.resetHistory();
          persistSaveUsageReference.resetHistory();
          mockStorageService.updateMeta.resetHistory();
          businessValidation.callsFake(async (request: RecordValidationRequest): Promise<RecordValidationResult> => {
            const invalid = request.candidate.metadata.approval !== 'approved';
            return invalid
              ? blockingResult({
                  transformedCandidate: request.candidate,
                  blockingErrors: [
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
                  ],
                })
              : resolvedAllowResult(request.candidate, { mode: 'enforce' });
          });

          const result = await RecordsService.updateMeta(
            { id: 'brand-1' },
            'record-123',
            structuredClone(stored),
            { username: 'user-1' },
            true,
            false,
            path.targetStep ? { name: path.targetStep } : {},
            { metadata: rawDelta, mode: 'merge' },
            recordSchemaContext({
              routeFamily: path.routeFamily,
              operation: path.operation,
              ...(path.targetStep ? { targetStep: path.targetStep } : {}),
            })
          );

          const label = `${path.name}/${testCase.name}`;
          expect(result.outcome, label).to.equal(testCase.expectedOutcome);
          expect(validateResolvedArtifact.calledOnce, label).to.equal(true);
          expect(validateResolvedArtifact.firstCall.args[0].input, label).to.deep.equal(testCase.metadata);
          expect(
            preSaveHook.getCalls().map(call => call.args[3]),
            label
          ).to.deep.equal(path.expectedHookModes);
          expect(transitionPreSaveHook.callCount, label).to.equal(path.operation === 'transition' ? 1 : 0);
          expect(businessValidation.calledOnce, label).to.equal(true);
          expect(authorize.calledBefore(resolveUpdate), label).to.equal(true);
          expect(resolveUpdate.calledBefore(validateResolvedArtifact), label).to.equal(true);
          expect(validateResolvedArtifact.calledBefore(applySubmission), label).to.equal(true);
          expect(applySubmission.calledBefore(preSaveHook), label).to.equal(true);
          expect(validateResolvedArtifact.calledBefore(preSaveHook), label).to.equal(true);
          if (path.operation === 'transition') {
            expect(validateResolvedArtifact.calledBefore(transitionPreSaveHook), label).to.equal(true);
          }
          expect(preSaveHook.calledBefore(businessValidation), label).to.equal(true);
          const validationRequest: RecordValidationRequest = businessValidation.firstCall.args[0];
          expect(validationRequest.writeKind, label).to.equal(path.operation);
          expect(validationRequest.candidate.metadata, label).to.deep.include({
            retained: 'keep',
            ...testCase.metadata,
            ...path.expectedHookMetadata,
          });
          expect(rawDelta, label).to.deep.equal(testCase.metadata);
          expect(stored.metadata, label).to.deep.equal({
            title: 'Stored',
            score: 12,
            approval: 'approved',
            retained: 'keep',
          });

          if (testCase.expectedOutcome === 'saved') {
            expect(mockStorageService.updateMeta.calledOnce, label).to.equal(true);
            expect(businessValidation.calledBefore(mockStorageService.updateMeta), label).to.equal(true);
            expect(persistSaveUsageReference.calledOnce, label).to.equal(true);
            expect(mockStorageService.updateMeta.calledBefore(persistSaveUsageReference), label).to.equal(true);
          } else {
            expect(mockStorageService.updateMeta.notCalled, label).to.equal(true);
            expect(persistSaveUsageReference.notCalled, label).to.equal(true);
            expect(result.problems[0]).to.deep.include({ kind: 'validation', phase: 'pre-save' });
            expect(result.problems[0]).not.to.have.property('source');
            expect(
              result.problems[0].issues.map((issue: RecordSaveIssue) => issue.code),
              label
            ).to.deep.equal(['record-validation-failed', 'record-validation-failed', 'record-validation-failed']);
          }
        }
      }
    });

    it('authorizes public no-ACL harvest creates from workflow roles in disabled, shadow, and enforce modes', async function () {
      const harvesterRole = { id: 'role-harvester', name: 'Harvester' };
      (global as any).RolesService.getRole.callsFake((_brand: unknown, roleName: string) =>
        roleName === harvesterRole.name ? harvesterRole : null
      );
      (global as any).WorkflowStepsService.getFirst.returns(
        of({
          name: 'draft',
          config: {
            form: 'default-form',
            addJsonLdContext: false,
            authorization: { viewRoles: ['Harvester'], editRoles: ['Harvester'] },
          },
        })
      );
      const resolveCreate = sinon.stub();
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      const persistSaveUsageReference = recordedSchemaUsage();
      mockSails.services.recordschemaservice = {
        resolveCreate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };

      for (const mode of ['disabled', 'shadow', 'enforce'] as const) {
        mockSails.config.recordSchema = { enabled: mode !== 'disabled' };
        mockSails.config.recordValidation = { mode: mode === 'disabled' ? 'shadow' : mode };
        resolveCreate.resetHistory();
        if (mode !== 'disabled') {
          resolveCreate.resolves(createSchemaResolution('resolved', mode));
        }
        validateResolvedArtifact.resetHistory();
        (global as any).RecordValidationService.resolve.resetHistory();
        (global as any).RecordValidationService.resolve.resolves(
          allowResult({ mode: mode === 'disabled' ? 'shadow' : mode })
        );
        mockStorageService.create.resetHistory();

        const rawMetadata = { title: `Harvest ${mode}`, nested: { retained: true } };
        const harvestRequest = {
          harvestId: `harvest-${mode}`,
          metadata: structuredClone(rawMetadata),
        };
        const result = await RecordsService.create(
          { id: 'brand-1' },
          harvestRequest,
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'harvester', roles: [harvesterRole] },
          false,
          false,
          undefined,
          recordSchemaContext({ routeFamily: 'api', operation: 'create' })
        );

        expect(result.outcome, mode).to.equal('saved');
        expect(harvestRequest, mode).to.deep.equal({
          harvestId: `harvest-${mode}`,
          metadata: rawMetadata,
        });
        expect(mockStorageService.create.calledOnce, mode).to.equal(true);
        expect(mockStorageService.create.firstCall.args[1].authorization, mode).to.deep.include({
          viewRoles: ['Harvester'],
          editRoles: ['Harvester'],
        });
        expect(resolveCreate.called, mode).to.equal(mode !== 'disabled');
        expect(validateResolvedArtifact.called, mode).to.equal(mode !== 'disabled');
      }
    });

    it('rejects unauthorized public no-ACL harvest creates before schema resolution in every mode', async function () {
      const harvesterRole = { id: 'role-harvester', name: 'Harvester' };
      (global as any).RolesService.getRole.callsFake((_brand: unknown, roleName: string) =>
        roleName === harvesterRole.name ? harvesterRole : null
      );
      (global as any).WorkflowStepsService.getFirst.returns(
        of({
          name: 'draft',
          config: {
            form: 'default-form',
            addJsonLdContext: false,
            authorization: { viewRoles: ['Harvester'], editRoles: ['Harvester'] },
          },
        })
      );
      const resolveCreate = sinon.stub();
      const validateResolvedArtifact = sinon.stub();
      mockSails.services.recordschemaservice = { resolveCreate, validateResolvedArtifact };

      for (const mode of ['disabled', 'shadow', 'enforce'] as const) {
        mockSails.config.recordSchema = { enabled: mode !== 'disabled' };
        mockSails.config.recordValidation = { mode: mode === 'disabled' ? 'shadow' : mode };
        resolveCreate.resetHistory();
        if (mode !== 'disabled') {
          resolveCreate.resolves(createSchemaResolution('resolved', mode));
        }
        validateResolvedArtifact.resetHistory();
        (global as any).RecordValidationService.resolve.resetHistory();
        mockStorageService.create.resetHistory();

        const harvestRequest = {
          harvestId: `unauthorized-${mode}`,
          metadata: { title: `Unauthorized harvest ${mode}` },
        };
        const result = await RecordsService.create(
          { id: 'brand-1' },
          harvestRequest,
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'researcher', roles: [{ id: 'role-researcher', name: 'Researcher' }] },
          false,
          false,
          undefined,
          recordSchemaContext({ routeFamily: 'api', operation: 'create' })
        );

        expect(result.outcome, mode).to.equal('not-saved');
        expect(result.problems[0].issues[0].code, mode).to.equal('record-validation-edit-unauthorized');
        expect(resolveCreate.notCalled, mode).to.equal(true);
        expect(validateResolvedArtifact.notCalled, mode).to.equal(true);
        expect((global as any).RecordValidationService.resolve.notCalled, mode).to.equal(true);
        expect(mockStorageService.create.notCalled, mode).to.equal(true);
        expect(harvestRequest, mode).to.deep.equal({
          harvestId: `unauthorized-${mode}`,
          metadata: { title: `Unauthorized harvest ${mode}` },
        });
      }
    });

    for (const testCase of [
      { name: 'missing', record: {}, expectedInput: undefined },
      { name: 'null', record: { metadata: null }, expectedInput: null },
    ] as const) {
      it(`rejects ${testCase.name} raw create metadata instead of validating normalized empty metadata`, async function () {
        enableRecordSchema();
        const resolveCreate = sinon.stub().resolves(createSchemaResolution('resolved', 'enforce'));
        const validateResolvedArtifact = sinon.stub().callsFake((request: unknown) => {
          assertUnknownRecord(request);
          const input = request.input;
          const valid = input !== null && typeof input === 'object' && !Array.isArray(input);
          return {
            kind: 'validated',
            valid,
            issues: valid ? [] : [{ code: 'record-schema.type', pointer: '' }],
            truncated: false,
          };
        });
        mockSails.services.recordschemaservice = { resolveCreate, validateResolvedArtifact };

        const result = await RecordsService.create(
          { id: 'brand-1' },
          testCase.record,
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'user-1' },
          false,
          false,
          undefined,
          recordSchemaContext()
        );

        expect(result.outcome).to.equal('not-saved');
        expect(result.problems[0]).to.deep.include({
          kind: 'validation',
          source: 'schema',
          phase: 'schema',
        });
        expect(result.problems[0].issues).to.deep.equal([
          {
            code: 'record-schema.type',
            message: '@record-schema.type',
            pointer: '',
          },
        ]);
        expect(validateResolvedArtifact.firstCall.args[0].input).to.equal(testCase.expectedInput);
        expect(mockStorageService.create.notCalled).to.equal(true);
      });
    }

    it('continues with advisory schema issues in shadow and stops before defaults or side effects in enforce', async function () {
      enableRecordSchema();
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: false,
        issues: [{ code: 'record-schema.type', pointer: '/title', expected: { type: 'string' } }],
        truncated: false,
      });
      const resolveCreate = sinon.stub();
      const persistSaveUsageReference = recordedSchemaUsage();
      mockSails.services.recordschemaservice = {
        resolveCreate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      for (const mode of ['shadow', 'enforce'] as const) {
        resolveCreate.reset();
        resolveCreate.resolves(createSchemaResolution('resolved', mode));
        validateResolvedArtifact.resetHistory();
        preSaveHook.resetHistory();
        (global as any).FormsService.getForm.resetHistory();
        (global as any).RecordValidationService.resolve.resetHistory();
        (global as any).RecordValidationService.resolve.resolves(allowResult({ mode }));
        mockStorageService.create.resetHistory();

        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 42 } },
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'user-1' },
          true,
          false,
          undefined,
          recordSchemaContext()
        );

        expect(result.outcome, mode).to.equal(mode === 'shadow' ? 'saved-with-warnings' : 'not-saved');
        expect(result.problems).to.have.length(1);
        expect(result.problems[0]).to.deep.include({
          kind: 'validation',
          source: 'schema',
          phase: 'schema',
        });
        expect(result.problems[0].issues).to.deep.equal([
          {
            message: '@record-schema.type',
            code: 'record-schema.type',
            pointer: '/title',
            expected: { type: 'string' },
          },
        ]);
        expect(preSaveHook.called, mode).to.equal(mode === 'shadow');
        expect((global as any).RecordValidationService.resolve.called, mode).to.equal(mode === 'shadow');
        expect(mockStorageService.create.called, mode).to.equal(mode === 'shadow');
        if (mode === 'enforce') {
          expect((global as any).FormsService.getForm.notCalled).to.equal(true);
        }
      }
    });

    it('marks truncated schema diagnostics within the configured issue limit in shadow and enforce', async function () {
      enableRecordSchema();
      mockSails.config.recordSchema.limits = { maxDiagnostics: 2 };
      const resolveCreate = sinon.stub();
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: false,
        issues: [
          { code: 'record-schema.type', pointer: '/title', expected: { type: 'string' } },
          { code: 'record-schema.required', pointer: '/description' },
        ],
        truncated: true,
      });
      mockSails.services.recordschemaservice = { resolveCreate, validateResolvedArtifact };

      for (const mode of ['shadow', 'enforce'] as const) {
        resolveCreate.reset();
        resolveCreate.resolves(createSchemaResolution('resolved', mode));
        (global as any).RecordValidationService.resolve.resetHistory();
        (global as any).RecordValidationService.resolve.resolves(allowResult({ mode }));
        mockStorageService.create.resetHistory();

        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 42 } },
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'user-1' },
          false,
          false,
          undefined,
          recordSchemaContext()
        );

        expect(result.outcome, mode).to.equal(mode === 'shadow' ? 'saved-with-warnings' : 'not-saved');
        expect(result.problems[0].issues, mode).to.deep.equal([
          {
            code: 'record-schema.type',
            message: '@record-schema.type',
            pointer: '/title',
            expected: { type: 'string' },
          },
          {
            code: 'record-schema.limit-diagnostics',
            message: '@record-schema.limit-diagnostics',
            pointer: '',
          },
        ]);
        expect(result.problems[0].issues).to.have.length.at.most(mockSails.config.recordSchema.limits.maxDiagnostics);
        expect(mockStorageService.create.called, mode).to.equal(mode === 'shadow');
      }
    });

    it('validates a partial create artifact without treating completeness as a save warning', async function () {
      enableRecordSchema();
      const resolveCreate = sinon.stub().resolves(createSchemaResolution('partial', 'enforce'));
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      const persistSaveUsageReference = recordedSchemaUsage();
      mockSails.services.recordschemaservice = {
        resolveCreate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };
      (global as any).RecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Partial but valid' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        false,
        false,
        undefined,
        recordSchemaContext()
      );

      expect(result.outcome).to.equal('saved');
      expect(result.problems).to.deep.equal([]);
      expect(validateResolvedArtifact.calledOnce).to.equal(true);
      expect(mockStorageService.create.calledOnce).to.equal(true);
      expect(
        persistSaveUsageReference.calledOnceWithExactly({
          digest: 'a'.repeat(64),
          brand: 'brand-1',
          portal: 'portal',
          schemaKind: 'create',
          recordType: 'rdmp',
          oid: result.oid,
          operation: 'publish',
          saveIdentity: result.requestId,
        })
      ).to.equal(true);
      expect(result.schemaOutcome).to.deep.equal({
        digest: 'a'.repeat(64),
        immutableUrl: `/brand-1/portal/api/records/schemas/${'a'.repeat(64)}`,
        completeness: 'partial',
        enforcement: 'enforce',
      });
    });

    it('applies the existing rollout precedence to unavailable create schemas using the normalized operation', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = {
        mode: 'enforce',
        operations: { publish: { mode: 'enforce' } },
      };
      const resolveCreate = sinon.stub().resolves({
        kind: 'unavailable',
        stage: 'configuration',
        code: 'record-schema.unavailable',
      });
      const validateResolvedArtifact = sinon.stub();
      mockSails.services.recordschemaservice = { resolveCreate, validateResolvedArtifact };
      const context = recordSchemaContext({ validationOperation: '  publish  ' });
      const recordType = {
        name: 'rdmp',
        hooks: {},
        searchable: false,
        recordValidation: {
          mode: 'enforce',
          operations: { publish: { mode: 'shadow' } },
        },
      };

      const shadowResult = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Shadow unavailable' } },
        recordType,
        { username: 'user-1' },
        false,
        false,
        undefined,
        context
      );

      expect(shadowResult.outcome).to.equal('saved-with-warnings');
      expect(shadowResult.problems[0]).to.deep.include({
        kind: 'system',
        source: 'schema',
        phase: 'schema',
      });
      expect(shadowResult.problems[0].issues[0]).to.deep.equal({
        code: 'record-schema.unavailable',
        message: '@record-schema.unavailable',
      });
      expect(resolveCreate.firstCall.args[0].operation).to.equal('publish');
      expect(validateResolvedArtifact.notCalled).to.equal(true);

      resolveCreate.resetHistory();
      mockStorageService.create.resetHistory();
      recordType.recordValidation.operations.publish.mode = 'enforce';
      const enforceResult = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Enforce unavailable' } },
        recordType,
        { username: 'user-1' },
        false,
        false,
        undefined,
        context
      );

      expect(enforceResult.outcome).to.equal('not-saved');
      expect(enforceResult.problems[0].issues[0].code).to.equal('record-schema.unavailable');
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('rejects schema operation authorization failures in both rollout modes before create side effects', async function () {
      enableRecordSchema();
      const resolveCreate = sinon.stub().resolves({
        kind: 'context-failed',
        failureKind: 'forbidden',
        diagnosticCodes: ['record-validation-operation-role-unauthorized'],
      });
      const validateResolvedArtifact = sinon.stub();
      mockSails.services.recordschemaservice = { resolveCreate, validateResolvedArtifact };
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      for (const mode of ['shadow', 'enforce'] as const) {
        mockSails.config.recordValidation = { mode };
        resolveCreate.resetHistory();
        preSaveHook.resetHistory();
        (global as any).RecordValidationService.resolve.resetHistory();
        mockStorageService.create.resetHistory();

        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Unauthorized operation' } },
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'user-1', roles: [{ name: 'Researcher' }] },
          true,
          false,
          undefined,
          recordSchemaContext({ validationOperation: 'publish' })
        );

        expect(result.outcome, mode).to.equal('not-saved');
        expect(result.problems[0]).to.deep.include({ kind: 'authorization', phase: 'pre-save' });
        expect(result.problems[0].issues[0].code).to.equal('record-validation-operation-unauthorized');
        expect(validateResolvedArtifact.notCalled).to.equal(true);
        expect(preSaveHook.notCalled).to.equal(true);
        expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
        expect(mockStorageService.create.notCalled).to.equal(true);
      }
    });

    it('leaves the non-schema create chain unchanged while record schemas are disabled', async function () {
      const schemaHarness = installDisabledRecordSchemaHarness();
      const authorize = sinon.spy(RecordsService, 'hasPublicEditAuthorization');
      const transitionMetadata = sinon.spy(RecordsService as any, 'transitionWorkflowStepMetadata');
      const initializeMetadata = sinon.spy(RecordsService as any, 'initRecordMetaMetadata');
      const transitionAuthorization = sinon.spy(RecordsService, 'hasTransitionRoleAuthorization');
      const transitionHook = sinon.spy(RecordsService, 'triggerPreSaveTransitionWorkflowTriggers');
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');
      const businessValidation = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      businessValidation.resolves(allowResult());

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Schema disabled' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        true,
        false,
        'published'
      );

      expect(result.outcome).to.equal('saved');
      expect(result.success).to.equal(true);
      expect(result.problems).to.deep.equal([]);
      expect(result.schemaOutcome).to.equal(undefined);
      expectDisabledRecordSchemaInert(schemaHarness);
      expectNoDisabledRecordSchemaDataPersisted(mockStorageService.create.firstCall.args[1]);
      expect(transitionMetadata.calledBefore((global as any).FormsService.getForm)).to.equal(true);
      expect((global as any).FormsService.getForm.calledBefore(initializeMetadata)).to.equal(true);
      expect(initializeMetadata.calledBefore(authorize)).to.equal(true);
      expect(authorize.calledBefore(transitionAuthorization)).to.equal(true);
      expect(transitionAuthorization.calledBefore(transitionHook)).to.equal(true);
      expect(transitionHook.calledBefore(preSaveHook)).to.equal(true);
      expect(initializeMetadata.calledBefore(preSaveHook)).to.equal(true);
      expect(preSaveHook.calledBefore(businessValidation)).to.equal(true);
      expect(businessValidation.calledBefore(mockStorageService.create)).to.equal(true);
    });

    it('preserves baseline update outputs and legacy structural validation while record schemas are disabled', async function () {
      const schemaHarness = installDisabledRecordSchemaHarness();
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'keep' } };
      const rawDelta = { title: 'Updated' };
      mockStorageService.getMeta.resolves(stored);
      const legacyStructuralValidation = sinon.spy(RecordsService, 'validateUpdateMetadataStructure');
      mockRecordValidationService.resolve.resolves(allowResult());

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        true,
        false,
        {},
        { metadata: rawDelta, mode: 'merge' },
        recordSchemaContext({ routeFamily: 'api', operation: 'update' })
      );

      expect(result.outcome).to.equal('saved');
      expect(result.success).to.equal(true);
      expect(result.problems).to.deep.equal([]);
      expect(result.schemaOutcome).to.equal(undefined);
      expect(result.oid).to.equal('record-123');
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata).to.deep.equal({
        title: 'Updated',
        retained: 'keep',
      });
      expectNoDisabledRecordSchemaDataPersisted(mockStorageService.updateMeta.firstCall.args[2]);
      expect(legacyStructuralValidation.calledOnceWithExactly(rawDelta)).to.equal(true);
      expect(rawDelta).to.deep.equal({ title: 'Updated' });
      expectDisabledRecordSchemaInert(schemaHarness);
    });

    it('preserves baseline transition outputs and workflow semantics while record schemas are disabled', async function () {
      const schemaHarness = installDisabledRecordSchemaHarness();
      const stored = baseRecord();
      const rawDelta = { title: 'Published' };
      mockStorageService.getMeta.resolves(stored);
      const transitionHook = sinon.spy(RecordsService, 'triggerPreSaveTransitionWorkflowTriggers');
      const legacyStructuralValidation = sinon.spy(RecordsService, 'validateUpdateMetadataStructure');
      mockRecordValidationService.resolve.resolves(allowResult());

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1', roles: [{ name: 'Publisher' }] },
        true,
        false,
        { name: 'published' },
        { metadata: rawDelta, mode: 'merge' },
        recordSchemaContext({
          routeFamily: 'api',
          operation: 'transition',
          targetStep: 'published',
        })
      );

      expect(result.outcome).to.equal('saved');
      expect(result.success).to.equal(true);
      expect(result.problems).to.deep.equal([]);
      expect(result.schemaOutcome).to.equal(undefined);
      expect(result.oid).to.equal('record-123');
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
      expect(mockStorageService.updateMeta.firstCall.args[2]).to.deep.include({
        metadata: { title: 'Published' },
        workflow: { stage: 'published' },
      });
      expect(mockStorageService.updateMeta.firstCall.args[2].metaMetadata).to.include({
        type: 'rdmp',
        form: 'published-form',
        brandId: 'brand-1',
      });
      expectNoDisabledRecordSchemaDataPersisted(mockStorageService.updateMeta.firstCall.args[2]);
      expect(legacyStructuralValidation.calledOnceWithExactly(rawDelta)).to.equal(true);
      expect(transitionHook.calledOnce).to.equal(true);
      expect(rawDelta).to.deep.equal({ title: 'Published' });
      expectDisabledRecordSchemaInert(schemaHarness);
    });

    it('preserves baseline browser merge and array replacement while record schemas are disabled', async function () {
      const schemaHarness = installDisabledRecordSchemaHarness();
      const stored = {
        ...baseRecord(),
        metadata: {
          retained: 'keep',
          nested: { retained: true, values: [{ id: 'stored-nested' }] },
          values: [{ id: 'stored' }],
        },
      };
      const rawDelta = {
        nested: { incoming: true, values: [{ id: 'incoming-nested' }] },
        values: [{ id: 'incoming' }],
      };
      const baselineMetadata = {
        retained: 'keep',
        nested: {
          retained: true,
          incoming: true,
          values: [{ id: 'incoming-nested' }],
        },
        values: [{ id: 'incoming' }],
      };
      mockStorageService.getMeta.resolves(stored);
      const legacyStructuralValidation = sinon.spy(RecordsService, 'validateUpdateMetadataStructure');
      mockRecordValidationService.resolve.resolves(allowResult());

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        true,
        false,
        {},
        { metadata: rawDelta, mode: 'merge', arrayMergeMode: 'replace' },
        recordSchemaContext({ routeFamily: 'browser', operation: 'update' })
      );

      expect(result.outcome).to.equal('saved');
      expect(result.success).to.equal(true);
      expect(result.problems).to.deep.equal([]);
      expect(result.schemaOutcome).to.equal(undefined);
      expect(result.oid).to.equal('record-123');
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata).to.deep.equal(baselineMetadata);
      expectNoDisabledRecordSchemaDataPersisted(mockStorageService.updateMeta.firstCall.args[2]);
      expect(legacyStructuralValidation.calledOnceWithExactly(rawDelta)).to.equal(true);
      expect(rawDelta).to.deep.equal({
        nested: { incoming: true, values: [{ id: 'incoming-nested' }] },
        values: [{ id: 'incoming' }],
      });
      expectDisabledRecordSchemaInert(schemaHarness);
    });

    it('preserves disabled-schema legacy update rejection without schema or persistence side effects', async function () {
      const schemaHarness = installDisabledRecordSchemaHarness();
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'keep' } };
      const requestedRecord = structuredClone(stored);
      const rawDelta = { title: '' };
      const form: FormConfigFrame = {
        name: 'default-form',
        type: 'rdmp',
        componentDefinitions: [
          {
            name: 'title',
            component: {
              class: 'SimpleInputComponent',
              config: { type: 'text' },
            },
            model: {
              class: 'SimpleInputModel',
              config: { validators: [{ class: 'required' }] },
            },
          },
        ],
      };
      mockSails.config.recordValidation = {
        mode: 'enforce',
        timeoutMs: 5_000,
        allowedRequestParameters: [],
      };
      mockSails.config.validators = { definitions: formValidatorsSharedDefinitions };
      mockSails.config.reusableFormDefinitions = {};
      const validationService = new RecordValidationServices.RecordValidation({
        loadRecordType: async () => ({
          id: 'record-type-1',
          name: 'rdmp',
          recordValidation: { mode: 'enforce' },
        }),
        loadStartingWorkflowStep: async () => ({
          name: 'draft',
          starting: true,
          config: { form: 'default-form' },
        }),
        loadWorkflowStep: async (_recordType, step) => ({
          name: step,
          config: { form: 'default-form' },
        }),
        loadWorkflowSteps: async () => [],
        loadForm: async (formName, brand) => ({
          id: `form-${formName}`,
          name: formName,
          branding: brand,
          configuration: form,
        }),
      });
      const businessValidation = sinon.spy(validationService, 'resolve');
      mockSails.services.recordvalidationservice = validationService;
      const formRecord: FormAttributes = {
        id: 'form-default-form',
        name: 'default-form',
        branding: 'brand-1',
        configuration: form,
      };
      mockFormsService.getForm.resolves(formRecord);
      mockFormsService.getFormByName.returns(of(formRecord));
      mockStorageService.getMeta.resolves(stored);
      const legacyStructuralValidation = sinon.spy(RecordsService, 'validateUpdateMetadataStructure');
      const applySubmission = sinon.spy(RecordsService, 'applySubmittedMetadata');

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        requestedRecord,
        { username: 'user-1' },
        true,
        false,
        {},
        { metadata: rawDelta, mode: 'merge' },
        recordSchemaContext({ routeFamily: 'api', operation: 'update' })
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.success).to.equal(false);
      expect(result.problems).to.have.length(1);
      expect(result.problems[0]).to.deep.include({ kind: 'validation', phase: 'pre-save' });
      expect(result.problems[0].issues[0]).to.deep.include({
        code: 'record-validation-failed',
        field: 'title',
        pointer: '/title',
        class: 'required',
      });
      expect(result.schemaOutcome).to.equal(undefined);
      expect(legacyStructuralValidation.calledOnceWithExactly(rawDelta)).to.equal(true);
      expect(applySubmission.calledOnce).to.equal(true);
      expect(businessValidation.calledOnce).to.equal(true);
      const validationResult = await businessValidation.firstCall.returnValue;
      expect(validationResult.status).to.equal('resolved');
      if (validationResult.status !== 'resolved') throw new Error('Expected resolved legacy validation result.');
      expect(validationResult.shouldBlock).to.equal(true);
      expect(validationResult.blockingErrors.map(issue => issue.class)).to.deep.equal(['required']);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(mockQueueService.now.notCalled).to.equal(true);
      expect(requestedRecord).to.deep.equal(stored);
      expect(rawDelta).to.deep.equal({ title: '' });
      expectDisabledRecordSchemaInert(schemaHarness);
    });

    it('preserves schema-disabled hook failure precedence over transition authorization', async function () {
      mockSails.config.recordSchema = { enabled: false };
      const workflowStepsService = Reflect.get(globalThis, 'WorkflowStepsService') as {
        get: sinon.SinonStub;
      };
      workflowStepsService.get.returns(
        of({
          name: 'published',
          config: {
            form: 'published-form',
            workflow: { stage: 'published' },
            authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
          },
        })
      );
      const transitionAuthorization = sinon.spy(RecordsService, 'hasTransitionRoleAuthorization');

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Baseline precedence' } },
        {
          name: 'rdmp',
          hooks: { onCreate: { pre: [{ function: '({ invalid: true })' }] } },
          searchable: false,
        },
        { username: 'user-1', roles: [{ name: 'Researcher' }] },
        true,
        false,
        'published'
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('invalid-hook-configuration');
      expect(transitionAuthorization.notCalled).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('exposes current attachmentFields to create hooks and normalizes the final workflow form', async function () {
      (globalThis as any).__createHookAttachmentFields = undefined;
      (global as any).FormsService.getForm.resolves({
        name: 'default-form',
        configuration: { attachmentFields: ['beforeHookAttachment'] },
      });
      (global as any).FormsService.getFormByName.callsFake((formName: string) =>
        of({
          name: formName,
          configuration: {
            attachmentFields: formName === 'after-hook-form' ? ['afterHookAttachment'] : ['beforeHookAttachment'],
          },
        })
      );
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.callsFake(async (request: any) => {
        expect(request.candidate.metaMetadata.form).to.equal('default-form');
        expect(request.candidate.metaMetadata.attachmentFields).to.deep.equal(['beforeHookAttachment']);
        return allowResult();
      });

      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Attachment visibility' } },
          {
            name: 'rdmp',
            hooks: {
              onCreate: {
                pre: [
                  {
                    function:
                      '(_oid, record) => { globalThis.__createHookAttachmentFields = [...record.metaMetadata.attachmentFields]; return { ...record, metaMetadata: { ...record.metaMetadata, form: "after-hook-form" } }; }',
                  },
                ],
              },
            },
            searchable: false,
          },
          { username: 'user-1' }
        );

        expect(result.outcome).to.equal('saved');
        expect((globalThis as any).__createHookAttachmentFields).to.deep.equal(['beforeHookAttachment']);
        expect(mockStorageService.create.firstCall.args[1].metaMetadata).to.deep.include({
          form: 'default-form',
          attachmentFields: ['beforeHookAttachment'],
        });
      } finally {
        delete (globalThis as any).__createHookAttachmentFields;
      }
    });

    it('uses the requested target workflow and form for targeted create while preserving validationOperation', async function () {
      (global as any).WorkflowStepsService.get.returns(
        of({
          name: 'published',
          config: {
            form: 'published-form',
            workflow: { stage: 'published', stageLabel: 'Published' },
            authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
          },
        })
      );
      let formResolutionCandidate: any;
      (global as any).FormsService.getForm.callsFake(async (...args: any[]) => {
        formResolutionCandidate = structuredClone(args[4]);
        return { name: 'published-form', configuration: { attachmentFields: [] } };
      });
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.callsFake(async (request: any) => {
        expect(request.candidate.metadata.transitionHookSawStage).to.equal('published');
        return allowResult();
      });
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Targeted' } },
        {
          name: 'rdmp',
          hooks: {
            onTransitionWorkflow: {
              pre: [
                {
                  function:
                    '(_oid, record) => ({ ...record, workflow: { ...record.workflow, hookMarker: "create-preserved" }, metadata: { ...record.metadata, transitionHookSawStage: record.workflow.stage } })',
                },
              ],
            },
          },
          searchable: false,
        },
        { username: 'publisher', roles: [{ name: 'Publisher' }] },
        true,
        true,
        'published',
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationOperation: 'publish',
          validationRequestParameters: { locale: 'en-AU' },
          validationRuntimeContext: { source: 'targeted-create-test' },
        })
      );

      expect(result.outcome).to.equal('saved');
      expect((global as any).FormsService.getForm.firstCall.args[1]).to.equal('published-form');
      expect(formResolutionCandidate.workflow.stage).to.equal('published');
      expect(formResolutionCandidate.metaMetadata.form).to.equal('published-form');
      const request = resolve.firstCall.args[0];
      expect(request.writeKind).to.equal('create');
      expect(request.validationOperation).to.equal('publish');
      expect(request.targetStep).to.equal('published');
      expect(request.candidate.metaMetadata.form).to.equal('published-form');
      expect(request.candidate.workflow.stage).to.equal('published');
      expect(request.candidate.workflow.hookMarker).to.equal('create-preserved');
      expect(request.requestParameters).to.deep.equal({ locale: 'en-AU' });
      expect(request.runtimeContext).to.deep.equal({
        source: 'targeted-create-test',
        routeFamily: 'internal',
        writeKind: 'create',
        saveOperation: 'create',
      });
      expect(request.phase).to.equal('pre-save');
      expect(mockStorageService.create.firstCall.args[1].workflow.hookMarker).to.equal('create-preserved');
    });

    it('rejects malformed and unresolved targeted creates before hooks, form loading, validation, or storage', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const preHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');
      const recordType = {
        name: 'rdmp',
        hooks: {
          onCreate: { pre: [{ function: '(_oid, record) => record' }] },
          onTransitionWorkflow: { pre: [{ function: '(_oid, record) => record' }] },
        },
        recordValidation: { mode: 'enforce' },
        searchable: false,
      };
      (global as any).WorkflowStepsService.get.returns(of(undefined));

      for (const targetStep of ['../malformed', 'missing-step']) {
        mockStorageService.create.resetHistory();
        (global as any).FormsService.getForm.resetHistory();
        (global as any).RecordValidationService.resolve.resetHistory();
        preHook.resetHistory();

        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Target must resolve' } },
          recordType,
          { username: 'user-1' },
          true,
          true,
          targetStep,
          createRecordSaveContext({
            routeFamily: 'api',
            operation: 'transition',
            targetStep,
          })
        );

        expect(result.outcome).to.equal('not-saved');
        expect(result.problems[0]).to.deep.include({ kind: 'system', phase: 'pre-save' });
        expect(result.problems[0].issues[0].code).to.equal('record-validation-form-resolution-failed');
        expect(preHook.notCalled).to.equal(true);
        expect((global as any).FormsService.getForm.notCalled).to.equal(true);
        expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
        expect(mockStorageService.create.notCalled).to.equal(true);
      }

      expect((global as any).WorkflowStepsService.get.calledOnce).to.equal(true);
      const targetLog = mockSails.log.warn
        .getCalls()
        .map((call: sinon.SinonSpyCall) => call.args[1])
        .find(
          (details: any) =>
            details?.event === 'record_validation_workflow_target_rejected' &&
            details?.diagnostic_code === 'record-validation-workflow-step-not-found'
        );
      expect(targetLog).to.deep.include({ mode: 'enforce', operation: 'transition', record_type: 'rdmp' });
    });

    it('normalizes deleted, blank, and malformed pre-create form references before validation and persistence', async function () {
      const mutations = [
        'delete record.metaMetadata.form; return record;',
        'record.metaMetadata.form = ""; return record;',
        'record.metaMetadata.form = "../malformed-form"; return record;',
      ];
      for (const mutation of mutations) {
        mockStorageService.create.resetHistory();
        (global as any).RecordValidationService.resolve.resetHistory();
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Normalized create form' } },
          {
            name: 'rdmp',
            hooks: { onCreate: { pre: [{ function: `(_oid, record) => { ${mutation} }` }] } },
            searchable: false,
          },
          { username: 'user-1' },
          true,
          false
        );

        expect(result.outcome).to.equal('saved');
        expect((global as any).RecordValidationService.resolve.firstCall.args[0].candidate.metaMetadata.form).to.equal(
          'default-form'
        );
        expect(mockStorageService.create.firstCall.args[1].metaMetadata.form).to.equal('default-form');
      }
    });

    it('requires normal object edit authorization on public create, update, and transition boundaries', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const publicCreateContext = createRecordSaveContext({ routeFamily: 'api', operation: 'create' });
      const deniedCreate = await RecordsService.create(
        { id: 'brand-1' },
        {
          metadata: { title: 'Denied public create' },
          authorization: { edit: ['different-user'], view: [], editRoles: [], viewRoles: [] },
        },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        true,
        true,
        undefined,
        publicCreateContext
      );
      expect(deniedCreate.outcome).to.equal('not-saved');
      expect(deniedCreate.problems[0].issues[0].code).to.equal('record-validation-edit-unauthorized');
      expect(mockStorageService.create.notCalled).to.equal(true);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);

      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const deniedUpdate = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        baseRecord('Denied update'),
        { username: 'different-user' },
        true,
        true,
        {},
        undefined,
        createRecordSaveContext({ routeFamily: 'api', operation: 'update' })
      );
      expect(deniedUpdate.problems[0].issues[0].code).to.equal('record-validation-edit-unauthorized');
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);

      const nextStep = {
        name: 'published',
        config: { form: 'published-form', authorization: { transitionRoles: [] } },
      };
      const deniedTransition = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        baseRecord('Denied transition'),
        { username: 'different-user' },
        true,
        true,
        nextStep,
        undefined,
        createRecordSaveContext({ routeFamily: 'api', operation: 'transition' })
      );
      expect(deniedTransition.problems[0].issues[0].code).to.equal('record-validation-edit-unauthorized');
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
    });

    it('rejects a stored record from another brand before type lookup, hooks, validation, or persistence', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const stored = {
        ...baseRecord(),
        metaMetadata: { ...baseRecord().metaMetadata, brandId: 'brand-2' },
      };
      mockStorageService.getMeta.resolves(stored);
      const preHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        true,
        true,
        {},
        undefined,
        createRecordSaveContext({ routeFamily: 'api', operation: 'update' })
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('record-validation-authority-context-divergence');
      expect((global as any).RecordTypesService.get.notCalled).to.equal(true);
      expect(preHook.notCalled).to.equal(true);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('rejects a conflicting public update OID before hooks, validation, or storage', async function () {
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const preHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        { ...baseRecord('Conflicting identity'), redboxOid: 'different-record' },
        { username: 'user-1' },
        true,
        false
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('record-validation-authority-context-divergence');
      expect(preHook.notCalled).to.equal(true);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('keeps create identity separate from caller and adapter storage IDs through hooks', async function () {
      (globalThis as any).__createIdentityFacts = undefined;
      mockStorageService.create.resolves({
        success: true,
        oid: 'conflicting-adapter-oid',
        id: 'waterline-adapter-id',
        _id: 'mongo-adapter-id',
        applicationState: 'applied',
      });
      mockStorageService.getMeta.resolves({
        redboxOid: 'explicit-create-oid',
        id: 'waterline-adapter-id',
        _id: 'mongo-adapter-id',
        metadata: { title: 'Explicit' },
        metaMetadata: { type: 'rdmp' },
      });
      const recordType = {
        name: 'rdmp',
        searchable: false,
        hooks: {
          onCreate: {
            postSync: [
              {
                function: `(_oid, record, _options, _user, response) => {
                globalThis.__createIdentityFacts = {
                  oid: _oid,
                  recordOid: record.redboxOid,
                  recordId: record.id,
                  recordMongoId: record._id,
                  responseOid: response.oid,
                  responseId: response.id,
                  responseMongoId: response._id,
                };
                return record;
              }`,
              },
            ],
          },
        },
      };

      try {
        const created = await RecordsService.create(
          { id: 'brand-1' },
          {
            redboxOid: 'explicit-create-oid',
            id: 'waterline-caller-id',
            _id: 'mongo-caller-id',
            metadata: { title: 'Explicit' },
          },
          recordType,
          { username: 'user-1' },
          false,
          true
        );

        expect(created.outcome).to.equal('saved');
        expect(created.oid).to.equal('explicit-create-oid');
        expect(mockStorageService.create.firstCall.args[1]).to.deep.include({
          redboxOid: 'explicit-create-oid',
        });
        expect(mockStorageService.create.firstCall.args[1]).not.to.have.property('id');
        expect(mockStorageService.create.firstCall.args[1]).not.to.have.property('_id');
        expect(mockStorageService.updateMeta.firstCall.args[1]).to.equal('explicit-create-oid');
        expect(mockStorageService.updateMeta.firstCall.args[2]).not.to.have.property('id');
        expect(mockStorageService.updateMeta.firstCall.args[2]).not.to.have.property('_id');
        expect(mockStorageService.getMeta.calledWith('explicit-create-oid')).to.equal(true);
        expect((globalThis as any).__createIdentityFacts).to.deep.equal({
          oid: 'explicit-create-oid',
          recordOid: 'explicit-create-oid',
          recordId: 'waterline-caller-id',
          recordMongoId: 'mongo-caller-id',
          responseOid: 'explicit-create-oid',
          responseId: 'waterline-adapter-id',
          responseMongoId: 'mongo-adapter-id',
        });
      } finally {
        delete (globalThis as any).__createIdentityFacts;
      }
    });

    it('binds an omitted pre-create hook OID back to the preselected public identity for every downstream effect', async function () {
      (globalThis as any).__configuredCreateOids = [];
      mockStorageService.create.resolves({
        success: true,
        oid: 'redirecting-adapter-oid',
        applicationState: 'applied',
      });
      mockStorageService.getMeta.resolves({
        redboxOid: 'route-create-oid',
        metadata: { title: 'Committed route record' },
        metaMetadata: { type: 'rdmp' },
      });
      const recordType = {
        name: 'rdmp',
        searchable: true,
        hooks: {
          onCreate: {
            pre: [
              {
                function: `(_oid, record) => {
                globalThis.__configuredCreateOids.push(['pre', _oid, record.redboxOid]);
                const { redboxOid: _discarded, ...replacement } = record;
                return replacement;
              }`,
              },
            ],
            postSync: [
              {
                function: `(_oid, record, _options, _user, response) => {
                globalThis.__configuredCreateOids.push(['postSync', _oid, record.redboxOid, response.oid]);
                return record;
              }`,
              },
            ],
            post: [
              {
                function: `(_oid, record) => {
                globalThis.__configuredCreateOids.push(['post', _oid, record.redboxOid]);
              }`,
              },
            ],
          },
        },
      };

      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { redboxOid: 'route-create-oid', metadata: { title: 'Route record' } },
          recordType,
          { username: 'user-1' },
          true,
          true
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));

        expect(result.outcome).to.equal('saved');
        expect(result.oid).to.equal('route-create-oid');
        expect(mockStorageService.create.firstCall.args[1].redboxOid).to.equal('route-create-oid');
        expect(mockStorageService.updateMeta.firstCall.args[1]).to.equal('route-create-oid');
        expect(mockStorageService.updateMeta.firstCall.args[2].redboxOid).to.equal('route-create-oid');
        expect(mockStorageService.getMeta.calledWith('route-create-oid')).to.equal(true);
        expect(mockSearchService.index.calledWith('route-create-oid', sinon.match.object)).to.equal(true);
        expect(mockQueueService.now.firstCall.args[1].redboxOid).to.equal('route-create-oid');
        expect((globalThis as any).__configuredCreateOids).to.deep.equal([
          ['pre', 'route-create-oid', 'route-create-oid'],
          ['postSync', 'route-create-oid', 'route-create-oid', 'route-create-oid'],
          ['post', 'route-create-oid', 'route-create-oid'],
        ]);
      } finally {
        delete (globalThis as any).__configuredCreateOids;
      }
    });

    it('rejects configured pre-create hook identity divergence before validation or downstream effects', async function () {
      (globalThis as any).__configuredCreatePreOid = undefined;
      const attachmentJournal = { prepareMutations: sinon.stub() };
      mockSails.services.attachmentmetadataservice = attachmentJournal;
      const recordType = {
        name: 'rdmp',
        searchable: true,
        hooks: {
          onCreate: {
            pre: [
              {
                function: `(_oid, record) => {
                globalThis.__configuredCreatePreOid = _oid;
                return { ...record, redboxOid: 'hook-redirect-oid' };
              }`,
              },
            ],
          },
        },
      };

      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { redboxOid: 'route-create-oid', metadata: { title: 'Route record' } },
          recordType,
          { username: 'user-1' },
          true,
          true
        );

        expect(result.outcome).to.equal('not-saved');
        expect(result.problems[0].issues[0].code).to.equal('record-validation-authority-context-divergence');
        expect((globalThis as any).__configuredCreatePreOid).to.equal('route-create-oid');
        expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
        expect(attachmentJournal.prepareMutations.notCalled).to.equal(true);
        expect(mockStorageService.create.notCalled).to.equal(true);
        expect(mockStorageService.getMeta.notCalled).to.equal(true);
        expect(mockSearchService.index.notCalled).to.equal(true);
        expect(mockQueueService.now.notCalled).to.equal(true);
      } finally {
        delete (globalThis as any).__configuredCreatePreOid;
      }
    });

    it('preserves distinct storage IDs through snapshots and hooks while stripping them from update writes', async function () {
      (globalThis as any).__identitySeenAfterStorage = undefined;
      const stored = { ...baseRecord(), id: 'waterline-storage-id', _id: 'mongo-storage-id' };
      const authoritativeStorage = installAuthoritativeStorage(stored);
      mockStorageService.updateMeta.callsFake(async (_brand: unknown, _oid: string, candidate: any) => {
        expect(candidate.redboxOid).to.equal('record-123');
        expect(candidate).not.to.have.property('id');
        expect(candidate).not.to.have.property('_id');
        authoritativeStorage.commit('record-123', candidate);
        delete candidate.redboxOid;
        return { success: true, oid: 'record-123', applicationState: 'applied' };
      });
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          searchable: false,
          hooks: {
            onUpdate: {
              postSync: [
                {
                  function:
                    '(_oid, record) => ({ ...record, metadata: { ...record.metadata, postSyncOid: record.redboxOid } })',
                },
              ],
              post: [
                {
                  function:
                    '(_oid, record) => { globalThis.__identitySeenAfterStorage = { redboxOid: record.redboxOid, id: record.id, _id: record._id, postSyncOid: record.metadata.postSyncOid }; }',
                },
              ],
            },
          },
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          {
            ...baseRecord('Identity-safe update'),
            id: 'waterline-storage-id',
            _id: 'mongo-storage-id',
          },
          { username: 'user-1' },
          true,
          true
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));

        expect(result.outcome).to.equal('saved');
        expect(mockStorageService.updateMeta.callCount).to.equal(2);
        expect((globalThis as any).__identitySeenAfterStorage).to.deep.equal({
          redboxOid: 'record-123',
          id: 'waterline-storage-id',
          _id: 'mongo-storage-id',
          postSyncOid: 'record-123',
        });
      } finally {
        delete (globalThis as any).__identitySeenAfterStorage;
      }
    });

    it('keeps the primary save but rejects a postSync route-identity conflict', async function () {
      mockStorageService.getMeta.resolves(baseRecord());
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
      });
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          searchable: false,
          hooks: {
            onUpdate: {
              postSync: [{ function: '(_oid, record) => ({ ...record, redboxOid: "different-record" })' }],
            },
          },
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        baseRecord('Primary identity-safe update'),
        { username: 'user-1' },
        true,
        true
      );

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.problems[0].issues[0].code).to.equal('record-validation-authority-context-divergence');
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
    });

    it('keeps the route OID authoritative when an update adapter returns a blank or wrong OID', async function () {
      (globalThis as any).__routeOidEffects = [];
      const stored = { ...baseRecord(), id: 'waterline-storage-id', _id: 'mongo-storage-id' };
      mockStorageService.getMeta.resolves(stored);
      mockStorageService.updateMeta.onFirstCall().resolves({
        success: true,
        oid: 'wrong-adapter-oid',
        applicationState: 'applied',
      });
      mockStorageService.updateMeta.onSecondCall().resolves({
        success: true,
        oid: '',
        applicationState: 'applied',
      });
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          searchable: false,
          hooks: {
            onUpdate: {
              postSync: [
                {
                  function: `(_oid, record, _options, _user, response) => {
                globalThis.__routeOidEffects.push({ phase: 'postSync', oid: _oid, responseOid: response.oid });
                return { ...record, metadata: { ...record.metadata, postSyncApplied: true } };
              }`,
                },
              ],
              post: [
                {
                  function: `(_oid) => {
                globalThis.__routeOidEffects.push({ phase: 'post', oid: _oid });
              }`,
                },
              ],
            },
          },
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          { ...stored, metadata: { title: 'Route-authoritative update' } },
          { username: 'user-1' },
          true,
          true
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));

        expect(result.oid).to.equal('record-123');
        expect(result.outcome).to.equal('saved');
        expect(mockStorageService.updateMeta.callCount).to.equal(2);
        expect(mockStorageService.updateMeta.getCalls().map((call: sinon.SinonSpyCall) => call.args[1])).to.deep.equal([
          'record-123',
          'record-123',
        ]);
        expect((globalThis as any).__routeOidEffects).to.deep.equal([
          { phase: 'postSync', oid: 'record-123', responseOid: 'record-123' },
          { phase: 'post', oid: 'record-123' },
        ]);
        expect(mockStorageService.getMeta.lastCall.args[0]).to.equal('record-123');
      } finally {
        delete (globalThis as any).__routeOidEffects;
      }
    });

    it('deep-clones the separate metadata argument before a failing mutating pre-hook', async function () {
      const stored = baseRecord();
      const callerMetadata = { nested: { title: 'Caller-owned title' } };
      const callerSnapshot = structuredClone(callerMetadata);
      mockStorageService.getMeta.resolves(stored);
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          searchable: false,
          hooks: {
            onUpdate: {
              pre: [
                {
                  function: `(_oid, record) => {
                record.metadata.nested.title = 'Mutated by hook';
                throw new Error('pre-hook failure');
              }`,
                },
              ],
            },
          },
        })
      );

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        true,
        false,
        {},
        { metadata: callerMetadata, mode: 'replace' }
      );

      expect(result.outcome).to.equal('not-saved');
      expect(callerMetadata).to.deep.equal(callerSnapshot);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('rejects a missing stored record type instead of accepting the caller type', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const stored = {
        ...baseRecord(),
        metaMetadata: { brandId: 'brand-1', form: 'default-form' },
      };
      mockStorageService.getMeta.resolves(stored);
      const preHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        { ...stored, metaMetadata: { ...stored.metaMetadata, type: 'rdmp' } },
        { username: 'user-1' },
        true,
        true,
        {},
        undefined,
        createRecordSaveContext({ routeFamily: 'api', operation: 'update' })
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('record-validation-form-resolution-failed');
      expect((global as any).RecordTypesService.get.notCalled).to.equal(true);
      expect(preHook.notCalled).to.equal(true);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('returns a system pre-save failure when a public update snapshot is unavailable', async function () {
      const { createRecordSaveContext, recordSaveFailureStatus } = require('../../src/RecordSaveResponse');
      mockStorageService.getMeta.rejects(new Error('snapshot unavailable'));

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        baseRecord('Legitimate caller update'),
        { username: 'user-1' },
        false,
        false,
        {},
        undefined,
        createRecordSaveContext({ routeFamily: 'api', operation: 'update' })
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0]).to.deep.include({ kind: 'system', phase: 'pre-save' });
      expect(result.problems[0].issues[0].code).to.equal('record-validation-snapshot-unavailable');
      expect(recordSaveFailureStatus(result)).to.equal(500);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('rejects a pre-hook that changes authoritative transition workflow context', async function () {
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const nextStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
        },
      };
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onTransitionWorkflow: {
              pre: [
                {
                  function: '(_oid, record) => ({ ...record, workflow: { stage: "rogue-stage" } })',
                },
              ],
            },
          },
          searchable: false,
        })
      );

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'publisher', roles: [{ name: 'Publisher' }] },
        true,
        false,
        nextStep
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0]).to.deep.include({ kind: 'system', phase: 'pre-save' });
      expect(result.problems[0].issues[0].code).to.equal('record-validation-authority-context-divergence');
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('rejects unauthorized targeted creates and does not broaden object-form transition roles', async function () {
      const configuredObjectRole = { name: 'Publisher' };
      const cases = [
        {
          transitionRoles: ['Publisher'],
          actorRoles: [{ name: 'Researcher' }],
        },
        {
          transitionRoles: [configuredObjectRole],
          // Historical matching does not authorize distinct role objects just
          // because their `name` properties happen to be equal.
          actorRoles: [{ name: 'Publisher' }],
        },
      ];

      for (const testCase of cases) {
        (global as any).WorkflowStepsService.get.returns(
          of({
            name: 'published',
            config: {
              form: 'published-form',
              workflow: { stage: 'published' },
              authorization: { transitionRoles: testCase.transitionRoles, viewRoles: [], editRoles: [] },
            },
          })
        );
        mockStorageService.create.resetHistory();
        (global as any).RecordValidationService.resolve.resetHistory();

        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Unauthorized target' } },
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'user-1', roles: testCase.actorRoles },
          true,
          true,
          'published'
        );

        expect(result.outcome).to.equal('not-saved');
        expect(result.problems[0]).to.deep.include({ kind: 'authorization', phase: 'pre-save' });
        expect(result.problems[0].issues[0].code).to.equal('record-validation-transition-unauthorized');
        expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
        expect(mockStorageService.create.notCalled).to.equal(true);
      }
    });

    it('keeps shadow validation failures response-neutral and preserves successful create', async function () {
      (global as any).RecordValidationService.resolve.resolves(
        resolvedAllowResult(
          {
            metadata: { title: '' },
            metaMetadata: {
              brandId: 'brand-1',
              type: 'rdmp',
              form: 'default-form',
            },
          },
          {
            blockingErrors: [{ message: '@validator-required', field: 'title' }],
          }
        )
      );

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: '' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );

      expect(result.outcome).to.equal('saved');
      expect(result.problems).to.deep.equal([]);
      expect(mockStorageService.create.calledOnce).to.equal(true);
    });

    it('reports advisory failures without blocking an enforced save', async function () {
      const advisoryErrors: RecordSaveIssue[] = [
        {
          message: '@validator-error-recommended',
          field: 'description',
          class: 'required',
        },
      ];
      (global as any).RecordValidationService.resolve.resolves(
        resolvedAllowResult(
          {
            metadata: { title: 'Valid primary record' },
            metaMetadata: {
              brandId: 'brand-1',
              type: 'rdmp',
              form: 'default-form',
            },
          },
          { mode: 'enforce', advisoryErrors }
        )
      );

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Valid primary record' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.problems).to.have.length(1);
      expect(result.problems[0]).to.deep.include({ kind: 'validation', phase: 'pre-save' });
      expect(result.problems[0].issues).to.deep.equal(advisoryErrors);
      expect(mockStorageService.create.calledOnce).to.equal(true);
    });

    it('durably persists the exact sanitized create candidate in shadow and enforce modes', async function () {
      const dirtyHtml = '<p>Safe</p><script>alert(1)</script><img src="x" onerror="alert(2)">';
      for (const mode of ['shadow', 'enforce'] as const) {
        mockStorageService.create.resetHistory();
        const { resolve } = installRichHtmlValidation(mode);
        const callerRecord = { metadata: { description: dirtyHtml, retained: 'caller-owned' } };
        const originalCallerRecord = structuredClone(callerRecord);

        const result = await RecordsService.create(
          { id: 'brand-1' },
          callerRecord,
          { name: 'rdmp', hooks: {}, searchable: false, recordValidation: { mode } },
          { username: 'user-1' }
        );

        expect(result.outcome, mode).to.equal('saved-with-warnings');
        expect(result.problems[0]).to.deep.include({ kind: 'validation', phase: 'pre-save' });
        expect(
          result.problems[0].issues.map((issue: RecordSaveIssue) => issue.class),
          mode
        ).to.deep.equal(['htmlSanitized']);
        expect(callerRecord, mode).to.deep.equal(originalCallerRecord);
        const validationResult = await resolve.firstCall.returnValue;
        expect(validationResult.status, JSON.stringify(validationResult.diagnostics)).to.equal('resolved');
        if (validationResult.status !== 'resolved') throw new Error('Expected resolved validation result.');
        const persisted = mockStorageService.create.firstCall.args[1];
        expect(persisted.metadata, mode).to.deep.equal(validationResult.transformedCandidate.metadata);
        expect(persisted.metadata.description, mode).to.equal('<p>Safe</p><img src="x">');
        expect(persisted.metadata.retained, mode).to.equal('caller-owned');
        expect(validationResult.blockingErrors, mode).to.deep.equal([]);
        expect(
          validationResult.advisoryErrors.map((issue: RecordSaveIssue) => issue.class),
          mode
        ).to.deep.equal(['htmlSanitized']);
      }
    });

    it('never lets rich HTML found only by the validator pass reach create or update storage writes', async function () {
      const dirtyHtml = '<p>Validator pass</p><script>alert(1)</script><img src="x" onerror="alert(2)">';
      const executeValidators: NonNullable<RecordValidationServiceDependencies['executeValidators']> = async (
        form,
        enabledValidationGroups,
        validatorDefinitionsMap,
        jsonataEvaluatorFactory,
        excludedOnlyValidationGroups,
        checkDeadline
      ) =>
        await new ValidatorFormConfigVisitor(mockSails.log).startWithResult({
          form,
          enabledValidationGroups: [...enabledValidationGroups],
          validatorDefinitionsMap,
          jsonataEvaluatorFactory,
          excludedOnlyValidationGroups: [...(excludedOnlyValidationGroups ?? [])],
          checkDeadline,
        });
      installRichHtmlValidation('enforce', 'sanitize', executeValidators, async () => []);

      const createResult = await RecordsService.create(
        { id: 'brand-1' },
        { redboxOid: 'validator-pass-create', metadata: { description: dirtyHtml } },
        { name: 'rdmp', hooks: {}, searchable: false, recordValidation: { mode: 'enforce' } },
        { username: 'user-1' },
        false,
        false
      );
      const createdCandidate = mockStorageService.create.firstCall.args[1];
      expect(createResult.outcome).to.equal('saved-with-warnings');
      expect(createdCandidate.metadata.description).to.equal('<p>Validator pass</p><img src="x">');
      expect(JSON.stringify(createdCandidate)).not.to.match(/<script|onerror/);

      mockStorageService.getMeta.resolves({
        ...baseRecord(),
        metadata: { title: 'Original', description: '<p>Original</p>' },
      });
      mockStorageService.updateMeta.resetHistory();
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {},
          searchable: false,
          recordValidation: { mode: 'enforce' },
        })
      );
      const updateResult = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        { ...baseRecord(), metadata: { title: 'Updated', description: dirtyHtml } },
        { username: 'user-1' },
        false,
        false
      );
      const updatedCandidate = mockStorageService.updateMeta.firstCall.args[2];
      expect(updateResult.outcome).to.equal('saved-with-warnings');
      expect(updatedCandidate.metadata.description).to.equal('<p>Validator pass</p><img src="x">');
      expect(JSON.stringify(updatedCandidate)).not.to.match(/<script|onerror/);
    });

    it('never persists an unsafe replacement returned by the rich HTML transformation channel', async function () {
      const dirtyHtml = '<p>Unsafe replacement</p><img src="x" onerror="alert(1)">';
      const unsafeTransformation = {
        kind: 'rich-html-sanitized' as const,
        dataModelPath: ['description'],
        sourceValue: dirtyHtml,
        value: dirtyHtml,
        advisorySummary: {
          id: 'description',
          message: 'description',
          errors: [{ class: 'htmlSanitized', message: '@validator-warning-html-sanitized', params: {} }],
        },
      };

      for (const mode of ['shadow', 'enforce'] as const) {
        mockStorageService.create.resetHistory();
        const { resolve } = installRichHtmlValidation(
          mode,
          'sanitize',
          async () => ({ summaries: [], transformations: [unsafeTransformation] }),
          async () => []
        );

        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { description: dirtyHtml } },
          { name: 'rdmp', hooks: {}, searchable: false, recordValidation: { mode } },
          { username: 'user-1' },
          false,
          false
        );

        const validationResult = await resolve.firstCall.returnValue;
        expect(validationResult, mode).to.deep.include({ status: 'unresolved', shouldBlock: true });
        expect(
          validationResult.diagnostics.map((item: { code: string }) => item.code),
          mode
        ).to.include('record-validation-transformation-inapplicable');
        expect(result.outcome, mode).to.equal('not-saved');
        expect(mockStorageService.create.notCalled, mode).to.equal(true);
      }
    });

    it('never persists raw rich HTML when later blocking validation fails or times out in shadow mode', async function () {
      const dirtyHtml = '<p>Safe</p><script>alert(1)</script><img src="x" onerror="alert(2)">';
      const cases: Array<{
        name: string;
        execute: NonNullable<RecordValidationServiceDependencies['executeValidators']>;
        diagnostic: string;
      }> = [
        {
          name: 'failure',
          execute: async () => {
            throw new Error('unrelated blocking validator failure');
          },
          diagnostic: 'record-validation-execution-failed',
        },
        {
          name: 'timeout',
          execute: async () => await new Promise<never>(() => undefined),
          diagnostic: 'record-validation-timeout',
        },
      ];

      for (const testCase of cases) {
        mockStorageService.create.resetHistory();
        const { resolve } = installRichHtmlValidation('shadow', 'sanitize', testCase.execute);
        if (testCase.name === 'timeout') mockSails.config.recordValidation.timeoutMs = 10;
        const callerRecord = { metadata: { description: dirtyHtml, retained: testCase.name } };
        const callerSnapshot = structuredClone(callerRecord);

        const result = await RecordsService.create(
          { id: 'brand-1' },
          callerRecord,
          { name: 'rdmp', hooks: {}, searchable: false, recordValidation: { mode: 'shadow' } },
          { username: 'user-1' }
        );

        const validationResult = await resolve.firstCall.returnValue;
        expect(validationResult, testCase.name).to.deep.include({ status: 'unresolved', shouldBlock: false });
        expect(
          validationResult.diagnostics.map((item: { code: string }) => item.code),
          testCase.name
        ).to.include(testCase.diagnostic);
        expect(validationResult.transformedCandidate, testCase.name).not.to.equal(undefined);
        expect(validationResult.transformedCandidate?.metadata.description, testCase.name).to.equal(
          '<p>Safe</p><img src="x">'
        );
        expect(result.outcome, testCase.name).to.equal('saved');
        expect(callerRecord, testCase.name).to.deep.equal(callerSnapshot);
        const persisted = mockStorageService.create.firstCall.args[1];
        expect(persisted.metadata.description, testCase.name).to.equal('<p>Safe</p><img src="x">');
        expect(JSON.stringify(persisted), testCase.name).not.to.include('<script');
        expect(JSON.stringify(persisted), testCase.name).not.to.include('onerror');
      }
    });

    it('rejects unsafe HTML without persistence when rich HTML mode is reject', async function () {
      const { resolve } = installRichHtmlValidation('enforce', 'reject');
      const dirtyHtml = '<p>Unsafe</p><script>alert(1)</script>';

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { description: dirtyHtml } },
        { name: 'rdmp', hooks: {}, searchable: false, recordValidation: { mode: 'enforce' } },
        { username: 'user-1' }
      );

      const validationResult = await resolve.firstCall.returnValue;
      expect(validationResult.status, JSON.stringify(validationResult.diagnostics)).to.equal('resolved');
      if (validationResult.status !== 'resolved') throw new Error('Expected resolved validation result.');
      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0]).to.deep.include({ kind: 'validation', phase: 'pre-save' });
      expect(validationResult.blockingErrors.map((issue: RecordSaveIssue) => issue.class)).to.deep.equal([
        'htmlUnsafe',
      ]);
      expect(validationResult.transformedCandidate.metadata.description).to.equal(dirtyHtml);
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('uses sanitized authoritative candidates for update and transition persistence', async function () {
      const dirtyHtml = '<p>Changed</p><script>alert(1)</script>';
      for (const writeKind of ['update', 'transition'] as const) {
        mockStorageService.updateMeta.resetHistory();
        const { resolve } = installRichHtmlValidation('enforce');
        const stored = {
          ...baseRecord(),
          metadata: { title: 'Original', description: '<p>Original</p>', retained: true },
        };
        mockStorageService.getMeta.resolves(stored);
        (global as any).RecordTypesService.get.returns(
          of({
            name: 'rdmp',
            hooks: {},
            searchable: false,
            recordValidation: { mode: 'enforce' },
          })
        );
        const targetStep =
          writeKind === 'transition'
            ? {
                name: 'published',
                config: {
                  form: 'published-form',
                  workflow: { stage: 'published' },
                  authorization: { transitionRoles: [], viewRoles: [], editRoles: [] },
                },
              }
            : {};
        const candidate = {
          ...baseRecord('Changed'),
          metadata: { title: 'Changed', description: dirtyHtml, retained: true },
        };

        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          candidate,
          { username: 'user-1' },
          false,
          false,
          targetStep
        );

        expect(result.outcome, writeKind).to.equal('saved-with-warnings');
        expect(
          result.problems[0].issues.map((issue: RecordSaveIssue) => issue.class),
          writeKind
        ).to.deep.equal(['htmlSanitized']);
        const validationResult = await resolve.firstCall.returnValue;
        expect(validationResult.status, writeKind).to.equal('resolved');
        if (validationResult.status !== 'resolved') throw new Error('Expected resolved validation result.');
        const persisted = mockStorageService.updateMeta.firstCall.args[2];
        expect(resolve.firstCall.args[0].writeKind, writeKind).to.equal(writeKind);
        expect(persisted.metadata, writeKind).to.deep.equal(validationResult.transformedCandidate.metadata);
        expect(persisted.metadata.description, writeKind).to.equal('<p>Changed</p>');
        expect(persisted.redboxOid, writeKind).to.equal('record-123');
        expect(persisted.metaMetadata.form, writeKind).to.equal(
          writeKind === 'transition' ? 'published-form' : 'default-form'
        );
      }
    });

    it('persists and dispatches the sanitized candidate returned by postSync validation', async function () {
      (globalThis as any).__sanitizedPostSyncRecord = undefined;
      installAuthoritativeStorage();
      const { resolve } = installRichHtmlValidation('enforce');
      const recordType = {
        name: 'rdmp',
        searchable: false,
        recordValidation: { mode: 'enforce' },
        hooks: {
          onCreate: {
            postSync: [
              {
                function:
                  '(_oid, record) => ({ ...record, metadata: { ...record.metadata, description: "<p>Hook</p><script>alert(1)</script>" } })',
              },
            ],
            post: [
              {
                function: '(_oid, record) => { globalThis.__sanitizedPostSyncRecord = structuredClone(record); }',
              },
            ],
          },
        },
      };

      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { description: '<p>Primary</p>' } },
          recordType,
          { username: 'user-1' },
          true,
          true
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));

        expect(result.outcome).to.equal('saved-with-warnings');
        expect(result.problems[0]).to.deep.include({ kind: 'validation', phase: 'post-save' });
        expect(result.problems[0].issues.map((issue: RecordSaveIssue) => issue.class)).to.deep.equal(['htmlSanitized']);
        expect(resolve.callCount).to.equal(2);
        const validationResult = await resolve.secondCall.returnValue;
        expect(validationResult.status).to.equal('resolved');
        if (validationResult.status !== 'resolved') throw new Error('Expected resolved validation result.');
        const persisted = mockStorageService.updateMeta.firstCall.args[2];
        expect(persisted.metadata).to.deep.equal(validationResult.transformedCandidate.metadata);
        expect(persisted.metadata.description).to.equal('<p>Hook</p>');
        expect((globalThis as any).__sanitizedPostSyncRecord).to.deep.equal(persisted);
      } finally {
        delete (globalThis as any).__sanitizedPostSyncRecord;
      }
    });

    it('runs omitted-operation validation through the real service and ignores client group bypass data', async function () {
      const authoritativeForm: FormConfigFrame = {
        name: 'default-form',
        type: 'rdmp',
        attachmentFields: ['attachments'],
        enabledValidationGroups: ['required-fields'],
        validationGroups: {
          all: { description: 'All validators', initialMembership: 'all' },
          none: { description: 'No validators', initialMembership: 'none' },
          'required-fields': { description: 'Required fields', initialMembership: 'none' },
        },
        componentDefinitions: [
          {
            name: 'title',
            component: { class: 'SimpleInputComponent' },
            model: {
              class: 'SimpleInputModel',
              config: {
                validators: [{ class: 'required', groups: { include: ['required-fields'] } }],
              },
            },
          },
        ],
      };
      const dependencies: Partial<RecordValidationServiceDependencies> = {
        loadRecordType: async () => ({
          id: 'record-type-1',
          name: 'rdmp',
          recordValidation: { mode: 'enforce' },
        }),
        loadStartingWorkflowStep: async () => ({
          name: 'draft',
          starting: true,
          config: { form: 'default-form' },
        }),
        loadWorkflowStep: async (_recordType, step) => ({
          name: step,
          config: { form: 'default-form' },
        }),
        loadWorkflowSteps: async () => [],
        loadForm: async (formName, brand) =>
          ({
            id: `form-${formName}`,
            name: formName,
            branding: brand,
            configuration: authoritativeForm,
          }) as FormAttributes,
      };
      mockSails.config.recordValidation = {
        mode: 'enforce',
        timeoutMs: 5_000,
        allowedRequestParameters: [],
      };
      mockSails.config.validators = { definitions: formValidatorsSharedDefinitions };
      mockSails.config.reusableFormDefinitions = {};
      (global as any).FormsService.getForm.resolves({
        name: 'default-form',
        configuration: authoritativeForm,
      });
      (global as any).FormsService.getFormByName.returns(
        of({
          name: 'default-form',
          configuration: authoritativeForm,
        })
      );
      const attachmentJournal = {
        prepareMutations: sinon.stub().resolves(),
        findUnresolvedByOid: sinon.stub().resolves([]),
        markMutation: sinon.stub().resolves(true),
        rebindOid: sinon.stub().resolves(),
      };
      mockSails.services.attachmentmetadataservice = attachmentJournal;
      const validationService = new RecordValidationServices.RecordValidation(dependencies);
      const resolve = sinon.spy(validationService, 'resolve');
      mockSails.services.recordvalidationservice = validationService;

      const result = await RecordsService.create(
        { id: 'brand-1' },
        {
          metadata: {
            title: '',
            enabledValidationGroups: ['none'],
            validationGroups: ['none'],
            attachments: [{ fileId: 'pending-file', pending: true }],
          },
        },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );

      expect(resolve.calledOnce).to.equal(true);
      expect(resolve.firstCall.args[0].validationOperation).to.equal(undefined);
      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0]).to.deep.include({ kind: 'validation', phase: 'pre-save' });
      expect(result.problems[0].issues[0]).to.deep.include({
        code: 'record-validation-failed',
        field: 'title',
        pointer: '/title',
        class: 'required',
      });
      expect(attachmentJournal.prepareMutations.notCalled).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
      expect(mockDatastreamService.addDatastream?.notCalled ?? true).to.equal(true);
    });

    it('preserves replacement semantics and validates the full update candidate after pre-hooks', async function () {
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'old' }, systemMarker: 'keep' };
      mockStorageService.getMeta.resolves(stored);
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              pre: [
                { function: '(_oid, record) => ({ ...record, metadata: { ...record.metadata, hookValue: true } })' },
              ],
            },
          },
          searchable: false,
        })
      );
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.callsFake(async (request: any) => {
        expect(request.candidate.metadata).to.deep.equal({ title: 'Replacement', hookValue: true });
        expect(request.candidate.systemMarker).to.equal('keep');
        return blockingResult();
      });

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        true,
        false,
        {},
        { metadata: { title: 'Replacement' }, mode: 'replace' }
      );

      expect(resolve.calledOnce).to.equal(true);
      expect(result.outcome).to.equal('not-saved');
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('rebinds the preselected create OID between sequential pre hooks', async function () {
      (globalThis as any).__createSecondHookOid = undefined;
      const recordType = {
        name: 'rdmp',
        hooks: {
          onCreate: {
            pre: [
              { function: '() => ({ metadata: { title: "First replacement" } })' },
              {
                function:
                  '(_oid, record) => { globalThis.__createSecondHookOid = record.redboxOid; return { ...record, secondHook: true }; }',
              },
            ],
          },
        },
        searchable: false,
      };
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { redboxOid: 'configured-create-oid', metadata: { title: 'Requested' } },
          recordType,
          { username: 'user-1' },
          true,
          false
        );

        expect(result.outcome).to.equal('saved');
        expect((globalThis as any).__createSecondHookOid).to.equal('configured-create-oid');
        expect(mockStorageService.create.firstCall.args[1]).to.include({
          redboxOid: 'configured-create-oid',
          secondHook: true,
        });
      } finally {
        delete (globalThis as any).__createSecondHookOid;
      }
    });

    it('rejects a conflicting create OID before the next pre hook or any save side effect', async function () {
      (globalThis as any).__conflictingCreateSecondHookRan = false;
      const recordType = {
        name: 'rdmp',
        hooks: {
          onCreate: {
            pre: [
              { function: '(_oid, record) => ({ ...record, redboxOid: "redirected-record" })' },
              {
                function: '(_oid, record) => { globalThis.__conflictingCreateSecondHookRan = true; return record; }',
              },
            ],
          },
        },
        searchable: false,
      };

      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { redboxOid: 'configured-create-oid', metadata: { title: 'Requested' } },
          recordType,
          { username: 'user-1' },
          true,
          false
        );

        expect(result.outcome).to.equal('not-saved');
        expect(result.problems[0].issues[0].code).to.equal('record-validation-authority-context-divergence');
        expect((globalThis as any).__conflictingCreateSecondHookRan).to.equal(false);
        expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
        expect(mockStorageService.create.notCalled).to.equal(true);
        expect(mockStorageService.updateMeta.notCalled).to.equal(true);
        expect(mockSearchService.index.notCalled).to.equal(true);
        expect(mockQueueService.now.notCalled).to.equal(true);
      } finally {
        delete (globalThis as any).__conflictingCreateSecondHookRan;
      }
    });

    it('rebinds the route OID between sequential update pre hooks', async function () {
      (globalThis as any).__updateSecondHookOid = undefined;
      mockStorageService.getMeta.resolves(baseRecord());
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              pre: [
                { function: '() => ({ metadata: { title: "First update replacement" } })' },
                {
                  function:
                    '(_oid, record) => { globalThis.__updateSecondHookOid = record.redboxOid; return { ...record, secondHook: true }; }',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          baseRecord('Requested'),
          { username: 'user-1' },
          true,
          false
        );

        expect(result.outcome).to.equal('saved');
        expect((globalThis as any).__updateSecondHookOid).to.equal('record-123');
        expect(mockStorageService.updateMeta.firstCall.args[2]).to.include({
          redboxOid: 'record-123',
          secondHook: true,
        });
      } finally {
        delete (globalThis as any).__updateSecondHookOid;
      }
    });

    it('rejects a conflicting route OID before the next update pre hook or persistence', async function () {
      (globalThis as any).__conflictingUpdateSecondHookRan = false;
      mockStorageService.getMeta.resolves(baseRecord());
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              pre: [
                { function: '(_oid, record) => ({ ...record, redboxOid: "redirected-record" })' },
                {
                  function: '(_oid, record) => { globalThis.__conflictingUpdateSecondHookRan = true; return record; }',
                },
              ],
            },
          },
          searchable: false,
        })
      );

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          baseRecord('Requested'),
          { username: 'user-1' },
          true,
          false
        );

        expect(result.outcome).to.equal('not-saved');
        expect(result.problems[0].issues[0].code).to.equal('record-validation-authority-context-divergence');
        expect((globalThis as any).__conflictingUpdateSecondHookRan).to.equal(false);
        expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
        expect(mockStorageService.updateMeta.notCalled).to.equal(true);
        expect(mockSearchService.index.notCalled).to.equal(true);
        expect(mockQueueService.now.notCalled).to.equal(true);
      } finally {
        delete (globalThis as any).__conflictingUpdateSecondHookRan;
      }
    });

    it('validates matching and absent update preconditions before merge while preserving update and transition intent', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'keep' } };
      mockStorageService.getMeta.resolves(stored);
      const resolution = updateSchemaResolution();
      const resolveUpdate = sinon.stub().resolves(resolution);
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      const persistSaveUsageReference = recordedSchemaUsage();
      mockSails.services.recordschemaservice = {
        resolveUpdate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };
      const authorize = sinon.spy(RecordsService, 'hasPublicEditAuthorization');
      const applySubmission = sinon.spy(RecordsService, 'applySubmittedMetadata');
      const transitionHook = sinon.spy(RecordsService, 'triggerPreSaveTransitionWorkflowTriggers');
      const businessValidation = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      const matchingEtag = `"sha256:${'b'.repeat(64)}"`;
      const publishedStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
        },
      };
      (global as any).WorkflowStepsService.get.returns(of(publishedStep));

      for (const testCase of [
        { saveOperation: 'update' as const, ifMatch: matchingEtag, nextStep: {}, targetStep: undefined },
        { saveOperation: 'transition' as const, ifMatch: undefined, nextStep: publishedStep, targetStep: 'published' },
      ]) {
        resolveUpdate.resetHistory();
        validateResolvedArtifact.resetHistory();
        authorize.resetHistory();
        applySubmission.resetHistory();
        transitionHook.resetHistory();
        businessValidation.resetHistory();
        persistSaveUsageReference.resetHistory();
        businessValidation.resolves(allowResult({ mode: 'enforce' }));
        mockStorageService.updateMeta.resetHistory();
        (global as any).RecordTypesService.get.resetHistory();

        const rawDelta = { title: `${testCase.saveOperation} title` };
        const user = { username: 'user-1', roles: [{ name: 'Publisher' }] };
        const brand = { id: 'brand-1' };
        const result = await RecordsService.updateMeta(
          brand,
          'record-123',
          stored,
          user,
          false,
          false,
          testCase.nextStep,
          { metadata: rawDelta, mode: 'merge' },
          recordSchemaContext({
            routeFamily: 'api',
            operation: testCase.saveOperation,
            targetStep: testCase.targetStep,
            validationOperation: '  publish  ',
            ...(testCase.ifMatch ? { recordSchemaIfMatch: testCase.ifMatch } : {}),
          })
        );

        expect(result.outcome, testCase.saveOperation).to.equal('saved');
        expect(resolveUpdate.calledOnce, testCase.saveOperation).to.equal(true);
        expect(resolveUpdate.firstCall.args[0]).to.deep.include({
          brand: 'brand-1',
          portal: 'portal',
          oid: 'record-123',
          operation: 'publish',
          ifMatch: testCase.ifMatch,
        });
        expect(resolveUpdate.firstCall.args[0].caller.brand).to.equal(brand);
        expect(resolveUpdate.firstCall.args[0].caller.user).to.equal(user);
        expect(validateResolvedArtifact.calledOnce, testCase.saveOperation).to.equal(true);
        expect(validateResolvedArtifact.firstCall.args[0]).to.deep.include({
          digest: 'b'.repeat(64),
          schemaKind: 'update',
          input: rawDelta,
        });
        expect(validateResolvedArtifact.firstCall.args[0].document).to.equal(resolution.document);
        expect(authorize.calledBefore(resolveUpdate), testCase.saveOperation).to.equal(true);
        expect((global as any).RecordTypesService.get.calledBefore(resolveUpdate), testCase.saveOperation).to.equal(
          true
        );
        expect(resolveUpdate.calledBefore(validateResolvedArtifact), testCase.saveOperation).to.equal(true);
        expect(validateResolvedArtifact.calledBefore(applySubmission), testCase.saveOperation).to.equal(true);
        if (testCase.saveOperation === 'transition') {
          expect(validateResolvedArtifact.calledBefore(transitionHook), testCase.saveOperation).to.equal(true);
        } else {
          expect(transitionHook.notCalled, testCase.saveOperation).to.equal(true);
        }
        expect(businessValidation.firstCall.args[0]).to.deep.include({
          writeKind: testCase.saveOperation,
          validationOperation: '  publish  ',
        });
        expect(mockStorageService.updateMeta.calledOnce, testCase.saveOperation).to.equal(true);
        expect(persistSaveUsageReference.calledOnce, testCase.saveOperation).to.equal(true);
        expect(result.schemaOutcome, testCase.saveOperation).to.deep.equal({
          digest: 'b'.repeat(64),
          immutableUrl: resolution.document.$id,
          completeness: 'complete',
          enforcement: 'enforce',
        });
        expect(rawDelta).to.deep.equal({ title: `${testCase.saveOperation} title` });
      }
    });

    it('rejects invalid structural operations on no-submission transitions before workflow mutation or hooks', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const publishedStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
        },
      };
      (global as any).WorkflowStepsService.get.returns(of(publishedStep));
      const resolveUpdate = sinon.stub();
      const validateResolvedArtifact = sinon.stub();
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      const authorize = sinon.spy(RecordsService, 'hasPublicEditAuthorization');
      const transitionAuthorization = sinon.spy(RecordsService, 'hasTransitionRoleAuthorization');
      const transitionMetadata = sinon.spy(RecordsService, 'transitionWorkflowStepMetadata');
      const transitionHook = sinon.spy(RecordsService, 'triggerPreSaveTransitionWorkflowTriggers');
      const updateHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      for (const testCase of [
        {
          validationOperation: '../malformed',
          schemaOperation: undefined,
          failureKind: 'invalid-request',
          diagnostic: 'record-validation-operation-malformed',
        },
        {
          validationOperation: 'unknown-operation',
          schemaOperation: 'unknown-operation',
          failureKind: 'not-resolvable',
          diagnostic: 'record-validation-operation-unknown',
        },
      ] as const) {
        resolveUpdate.resetHistory();
        validateResolvedArtifact.resetHistory();
        authorize.resetHistory();
        transitionAuthorization.resetHistory();
        transitionMetadata.resetHistory();
        transitionHook.resetHistory();
        updateHook.resetHistory();
        mockRecordValidationService.resolve.resetHistory();
        mockStorageService.getMeta.resetHistory();
        mockStorageService.updateMeta.resetHistory();
        (global as any).RecordTypesService.get.resetHistory();
        resolveUpdate.resolves({
          kind: 'context-failed',
          failureKind: testCase.failureKind,
          diagnosticCodes: [testCase.diagnostic],
        });

        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          structuredClone(stored),
          { username: 'user-1', roles: [{ name: 'Publisher' }] },
          true,
          true,
          publishedStep,
          undefined,
          recordSchemaContext({
            routeFamily: 'api',
            operation: 'transition',
            targetStep: 'published',
            validationOperation: testCase.validationOperation,
          })
        );

        expect(result.outcome, testCase.diagnostic).to.equal('not-saved');
        expect(result.problems[0].issues[0].code, testCase.diagnostic).to.equal('record-validation-operation-invalid');
        expect(resolveUpdate.calledOnce, testCase.diagnostic).to.equal(true);
        expect(resolveUpdate.firstCall.args[0].operation, testCase.diagnostic).to.equal(testCase.schemaOperation);
        expect(mockStorageService.getMeta.calledBefore(resolveUpdate), testCase.diagnostic).to.equal(true);
        expect(authorize.calledBefore(resolveUpdate), testCase.diagnostic).to.equal(true);
        expect(transitionAuthorization.calledBefore(resolveUpdate), testCase.diagnostic).to.equal(true);
        expect((global as any).RecordTypesService.get.calledBefore(resolveUpdate), testCase.diagnostic).to.equal(true);
        expect(validateResolvedArtifact.notCalled, testCase.diagnostic).to.equal(true);
        expect(transitionMetadata.notCalled, testCase.diagnostic).to.equal(true);
        expect(transitionHook.notCalled, testCase.diagnostic).to.equal(true);
        expect(updateHook.notCalled, testCase.diagnostic).to.equal(true);
        expect(mockRecordValidationService.resolve.notCalled, testCase.diagnostic).to.equal(true);
        expect(mockStorageService.updateMeta.notCalled, testCase.diagnostic).to.equal(true);
      }
    });

    it('blocks a stale update precondition before delta validation or any record mutation', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'shadow' };
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'keep' } };
      const requestedRecord = structuredClone(stored);
      const rawDelta = { title: 'Must not merge' };
      mockStorageService.getMeta.resolves(stored);
      const resolveUpdate = sinon.stub().resolves({
        kind: 'precondition-failed',
        condition: 'if-match',
        reason: 'mismatch',
        code: 'record-schema.precondition-failed',
      });
      const validateResolvedArtifact = sinon.stub();
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      const authorize = sinon.spy(RecordsService, 'hasPublicEditAuthorization');
      const applySubmission = sinon.spy(RecordsService, 'applySubmittedMetadata');
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        requestedRecord,
        { username: 'user-1', roles: [{ name: 'Researcher' }] },
        true,
        true,
        {},
        { metadata: rawDelta, mode: 'merge' },
        recordSchemaContext({
          routeFamily: 'api',
          operation: 'update',
          recordSchemaIfMatch: `"sha256:${'a'.repeat(64)}"`,
        })
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0]).to.deep.include({
        kind: 'validation',
        source: 'schema',
        phase: 'schema',
      });
      expect(result.problems[0].issues[0]).to.deep.equal({
        code: 'record-schema.precondition-failed',
        message: '@record-schema.precondition-failed',
      });
      expect(authorize.calledBefore(resolveUpdate)).to.equal(true);
      expect(resolveUpdate.firstCall.args[0].ifMatch).to.equal(`"sha256:${'a'.repeat(64)}"`);
      expect(validateResolvedArtifact.notCalled).to.equal(true);
      expect(applySubmission.notCalled).to.equal(true);
      expect(preSaveHook.notCalled).to.equal(true);
      expect(mockRecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(mockQueueService.now.notCalled).to.equal(true);
      expect(requestedRecord).to.deep.equal(stored);
      expect(rawDelta).to.deep.equal({ title: 'Must not merge' });
    });

    it('applies update schema failures as advisory in shadow and blocking in enforce without mutating rejected input', async function () {
      enableRecordSchema();
      const rawDelta = { title: 42 };
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'keep' } };
      mockStorageService.getMeta.resolves(stored);
      const resolveUpdate = sinon.stub();
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: false,
        issues: [{ code: 'record-schema.type', pointer: '/title', expected: { type: 'string' } }],
        truncated: false,
      });
      const persistSaveUsageReference = recordedSchemaUsage();
      mockSails.services.recordschemaservice = {
        resolveUpdate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };
      const applySubmission = sinon.spy(RecordsService, 'applySubmittedMetadata');
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      for (const mode of ['shadow', 'enforce'] as const) {
        mockSails.config.recordValidation = { mode };
        resolveUpdate.reset();
        resolveUpdate.resolves(updateSchemaResolution(mode));
        validateResolvedArtifact.resetHistory();
        applySubmission.resetHistory();
        preSaveHook.resetHistory();
        mockRecordValidationService.resolve.resetHistory();
        mockRecordValidationService.resolve.resolves(allowResult({ mode }));
        mockStorageService.updateMeta.resetHistory();
        persistSaveUsageReference.resetHistory();

        const requestedRecord = structuredClone(stored);
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          requestedRecord,
          { username: 'user-1' },
          true,
          false,
          {},
          { metadata: rawDelta, mode: 'merge' },
          recordSchemaContext({ routeFamily: 'api', operation: 'update' })
        );

        expect(result.outcome, mode).to.equal(mode === 'shadow' ? 'saved-with-warnings' : 'not-saved');
        expect(result.problems[0]).to.deep.include({
          kind: 'validation',
          source: 'schema',
          phase: 'schema',
        });
        expect(result.problems[0].issues[0]).to.deep.equal({
          code: 'record-schema.type',
          message: '@record-schema.type',
          pointer: '/title',
          expected: { type: 'string' },
        });
        expect(validateResolvedArtifact.firstCall.args[0].input).to.equal(rawDelta);
        expect(applySubmission.called, mode).to.equal(mode === 'shadow');
        expect(preSaveHook.called, mode).to.equal(mode === 'shadow');
        expect(mockRecordValidationService.resolve.called, mode).to.equal(mode === 'shadow');
        expect(mockStorageService.updateMeta.called, mode).to.equal(mode === 'shadow');
        expect(persistSaveUsageReference.called, mode).to.equal(mode === 'shadow');
        if (mode === 'shadow') {
          expect(persistSaveUsageReference.firstCall.args[0]).to.deep.equal({
            digest: 'b'.repeat(64),
            brand: 'brand-1',
            portal: 'portal',
            schemaKind: 'update',
            recordType: 'rdmp',
            oid: 'record-123',
            operation: 'publish',
            saveIdentity: result.requestId,
          });
          expect(result.schemaOutcome).to.deep.equal({
            digest: 'b'.repeat(64),
            immutableUrl: `/brand-1/portal/api/records/schemas/${'b'.repeat(64)}`,
            completeness: 'complete',
            enforcement: 'shadow',
          });
          expect(result.problems).to.have.length(1);
          expect(result.problems[0]).not.to.have.nested.property('issues[0].digest');
        } else {
          expect(result.schemaOutcome).to.equal(undefined);
        }
        expect(requestedRecord, mode).to.deep.equal(stored);
        expect(rawDelta, mode).to.deep.equal({ title: 42 });
      }
    });

    it('accepts unknown update fields in allow mode and blocks them in declared mode', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'keep' } };
      mockStorageService.getMeta.resolves(stored);
      const resolveUpdate = sinon.stub();
      const validateResolvedArtifact = sinon.stub().callsFake((request: any) => {
        const declared = request.document.additionalProperties === false;
        return {
          kind: 'validated',
          valid: !declared,
          issues: declared ? [{ code: 'record-schema.additional-property', pointer: '/extra' }] : [],
          truncated: false,
        };
      });
      const persistSaveUsageReference = recordedSchemaUsage();
      mockSails.services.recordschemaservice = {
        resolveUpdate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };
      mockRecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));

      for (const unknownProperties of ['allow', 'declared'] as const) {
        resolveUpdate.reset();
        const resolution = updateSchemaResolution('enforce', unknownProperties);
        resolveUpdate.resolves(resolution);
        validateResolvedArtifact.resetHistory();
        mockRecordValidationService.resolve.resetHistory();
        mockRecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));
        mockStorageService.updateMeta.resetHistory();
        const rawDelta = { extra: `unknown-${unknownProperties}` };

        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          stored,
          { username: 'user-1' },
          false,
          false,
          {},
          { metadata: rawDelta, mode: 'merge' },
          recordSchemaContext({ routeFamily: 'api', operation: 'update' })
        );

        expect(validateResolvedArtifact.firstCall.args[0].document).to.equal(resolution.document);
        expect(result.outcome, unknownProperties).to.equal(unknownProperties === 'allow' ? 'saved' : 'not-saved');
        expect(mockStorageService.updateMeta.called, unknownProperties).to.equal(unknownProperties === 'allow');
        if (unknownProperties === 'allow') {
          expect(mockStorageService.updateMeta.firstCall.args[2].metadata).to.deep.equal({
            title: 'Original',
            retained: 'keep',
            extra: 'unknown-allow',
          });
        } else {
          expect(result.problems[0].issues[0]).to.deep.include({
            code: 'record-schema.additional-property',
            pointer: '/extra',
          });
        }
        expect(rawDelta).to.deep.equal({ extra: `unknown-${unknownProperties}` });
      }
    });

    it('uses normalized validation-operation rollout precedence when update schema resolution is unavailable', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = {
        mode: 'enforce',
        operations: { publish: { mode: 'enforce' } },
      };
      const recordType = {
        name: 'rdmp',
        hooks: {},
        searchable: false,
        recordValidation: {
          mode: 'enforce',
          operations: { publish: { mode: 'shadow' } },
        },
      };
      (global as any).RecordTypesService.get.returns(of(recordType));
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const resolveUpdate = sinon.stub().resolves({
        kind: 'unavailable',
        stage: 'configuration',
        code: 'record-schema.unavailable',
      });
      const validateResolvedArtifact = sinon.stub();
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      mockRecordValidationService.resolve.resolves(allowResult());
      const context = recordSchemaContext({
        routeFamily: 'api',
        operation: 'update',
        validationOperation: '  publish  ',
      });

      const shadowResult = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        false,
        false,
        {},
        { metadata: { title: 'Shadow unavailable' }, mode: 'replace' },
        context
      );

      expect(shadowResult.outcome).to.equal('saved-with-warnings');
      expect(shadowResult.problems[0]).to.deep.include({ kind: 'system', source: 'schema', phase: 'schema' });
      expect(resolveUpdate.firstCall.args[0].operation).to.equal('publish');
      expect(validateResolvedArtifact.notCalled).to.equal(true);

      recordType.recordValidation.operations.publish.mode = 'enforce';
      resolveUpdate.resetHistory();
      mockStorageService.updateMeta.resetHistory();
      const enforceResult = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        false,
        false,
        {},
        { metadata: { title: 'Enforce unavailable' }, mode: 'replace' },
        context
      );

      expect(enforceResult.outcome).to.equal('not-saved');
      expect(enforceResult.problems[0].issues[0].code).to.equal('record-schema.unavailable');
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('stops a structurally invalid browser merge delta before merge, hooks, business validation, or storage', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'keep' } };
      const rawDelta = { title: 42 };
      mockStorageService.getMeta.resolves(stored);
      const resolveUpdate = sinon.stub().resolves(updateSchemaResolution('enforce'));
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: false,
        issues: [{ code: 'record-schema.type', pointer: '/title', expected: { type: 'string' } }],
        truncated: false,
      });
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      const authorize = sinon.spy(RecordsService, 'hasPublicEditAuthorization');
      const applySubmission = sinon.spy(RecordsService, 'applySubmittedMetadata');
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');
      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        true,
        false,
        {},
        { metadata: rawDelta, mode: 'merge', arrayMergeMode: 'replace' },
        recordSchemaContext({ routeFamily: 'browser', operation: 'update' })
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0]).to.deep.include({
        code: 'record-schema.type',
        pointer: '/title',
      });
      expect(validateResolvedArtifact.calledOnce).to.equal(true);
      expect(validateResolvedArtifact.firstCall.args[0].input).to.equal(rawDelta);
      expect(mockStorageService.getMeta.calledBefore(validateResolvedArtifact)).to.equal(true);
      expect(authorize.calledBefore(validateResolvedArtifact)).to.equal(true);
      expect((global as any).RecordTypesService.get.calledBefore(validateResolvedArtifact)).to.equal(true);
      expect(applySubmission.notCalled).to.equal(true);
      expect(preSaveHook.notCalled).to.equal(true);
      expect(mockRecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect(rawDelta).to.deep.equal({ title: 42 });
    });

    it('orders an internal pre-applied delta through authorization, schema, hooks, validation, storage, and usage', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const stored = {
        ...baseRecord(),
        revision: 1,
        metadata: {
          retained: 'keep',
          nested: { retained: true, values: [{ id: 'stored' }] },
        },
      };
      const requestedRecord = structuredClone(stored);
      requestedRecord.metadata.nested.values = [{ id: 'incoming' }];
      const rawDelta = { nested: { values: [{ id: 'incoming' }] } };
      mockStorageService.getCapabilities = sinon.stub().returns({
        recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
      });
      mockStorageService.getMeta.resolves(stored);
      mockStorageService.updateMeta.callsFake(
        async (_brand: unknown, oid: string, candidate: StorageUpdateCandidate) => ({
          success: true,
          oid,
          applicationState: 'applied',
          committedRevision: 2,
          committedRecord: { ...structuredClone(candidate), revision: 2 },
        })
      );
      const resolveUpdate = sinon.stub().resolves(updateSchemaResolution('enforce'));
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      const persistSaveUsageReference = recordedSchemaUsage();
      mockSails.services.recordschemaservice = {
        resolveUpdate,
        validateResolvedArtifact,
        persistSaveUsageReference,
      };
      mockRecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));
      const authorize = sinon.spy(RecordsService, 'hasEditAccess');
      const applySubmission = sinon.spy(RecordsService, 'applySubmittedMetadata');
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      const result = await RecordsService.updateMetaInternal({
        actor: { kind: 'service', id: 'RecordsServiceTest.internalOrdering' },
        authorization: { kind: 'record-edit' },
        mutationClass: 'full-record',
        brand: { id: 'brand-1' },
        oid: 'record-123',
        record: requestedRecord,
        user: { username: 'user-1', roles: [] },
        triggerPostSaveTriggers: false,
        metadata: rawDelta,
        metadataMode: 'pre-applied',
        context: recordSchemaContext({ routeFamily: 'internal', operation: 'update' }),
      });

      expect(result.wasPersisted(), JSON.stringify(result)).to.equal(true);
      expect(authorize.calledOnce).to.equal(true);
      expect(validateResolvedArtifact.calledOnce).to.equal(true);
      expect(validateResolvedArtifact.firstCall.args[0].input).to.deep.equal(rawDelta);
      expect(authorize.calledBefore(resolveUpdate)).to.equal(true);
      expect(resolveUpdate.calledBefore(validateResolvedArtifact)).to.equal(true);
      expect(validateResolvedArtifact.calledBefore(applySubmission)).to.equal(true);
      expect(applySubmission.calledBefore(preSaveHook)).to.equal(true);
      expect(preSaveHook.calledBefore(mockRecordValidationService.resolve)).to.equal(true);
      expect(mockRecordValidationService.resolve.calledBefore(mockStorageService.updateMeta)).to.equal(true);
      expect(mockStorageService.updateMeta.calledBefore(persistSaveUsageReference)).to.equal(true);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata).to.deep.equal({
        retained: 'keep',
        nested: { retained: true, values: [{ id: 'incoming' }] },
      });
      expect(rawDelta).to.deep.equal({ nested: { values: [{ id: 'incoming' }] } });
    });

    it('derives pre-applied validation from the persisted candidate and safely retries a stale mismatch', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const stored = {
        ...baseRecord(),
        metadata: { title: 'Current', retained: 'concurrent-value' },
      };
      const staleCandidate = {
        ...structuredClone(stored),
        metadata: { title: 42, retained: 'stale-value' },
      };
      const retryCandidate = structuredClone(stored);
      retryCandidate.metadata.title = 'Retried';
      const actor = { username: 'service-user', roles: [{ name: 'Researcher' }] };
      mockStorageService.getMeta.resolves(stored);
      const resolveUpdate = sinon.stub().callsFake(async (request: any) => {
        expect(request.caller.user).to.equal(actor);
        return updateSchemaResolution('enforce');
      });
      const validateResolvedArtifact = sinon.stub();
      validateResolvedArtifact.onFirstCall().returns({
        kind: 'validated',
        valid: false,
        issues: [{ code: 'record-schema.type', pointer: '/title' }],
        truncated: false,
      });
      validateResolvedArtifact.onSecondCall().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      mockRecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));

      const staleResult = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        staleCandidate,
        actor,
        false,
        false,
        {},
        { metadata: {}, mode: 'pre-applied' },
        recordSchemaContext({ routeFamily: 'internal', operation: 'update' })
      );

      expect(staleResult.outcome).to.equal('not-saved');
      expect(validateResolvedArtifact.firstCall.args[0].input).to.deep.equal({
        title: 42,
        retained: 'stale-value',
      });
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect(staleCandidate.metadata).to.deep.equal({ title: 42, retained: 'stale-value' });

      const retryResult = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        retryCandidate,
        actor,
        false,
        false,
        {},
        { metadata: { title: 'Retried' }, mode: 'pre-applied' },
        recordSchemaContext({ routeFamily: 'internal', operation: 'update' })
      );

      expect(retryResult.wasPersisted()).to.equal(true);
      expect(validateResolvedArtifact.secondCall.args[0].input).to.deep.equal({ title: 'Retried' });
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata).to.deep.equal({
        title: 'Retried',
        retained: 'concurrent-value',
      });
      expect(resolveUpdate.callCount).to.equal(2);
    });

    it('does not let an omitted submission bypass schema validation for changed legacy metadata', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const stored = {
        ...baseRecord(),
        metadata: {
          retained: 'keep',
          nested: { retained: true, values: [{ id: 'stored' }] },
        },
      };
      const requestedRecord = structuredClone(stored);
      requestedRecord.metadata.nested.values = [{ id: 'incoming' }];
      mockStorageService.getMeta.resolves(stored);
      const resolveUpdate = sinon.stub().resolves(updateSchemaResolution('enforce'));
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: false,
        issues: [{ code: 'record-schema.array-item', pointer: '/nested/values/0' }],
        truncated: false,
      });
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        requestedRecord,
        { username: 'legacy-service-user' },
        true,
        true
      );

      expect(result.outcome).to.equal('not-saved');
      expect(validateResolvedArtifact.calledOnce).to.equal(true);
      expect(validateResolvedArtifact.firstCall.args[0].input).to.deep.equal({
        nested: { values: [{ id: 'incoming' }] },
      });
      expect(preSaveHook.notCalled).to.equal(true);
      expect(mockRecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('retains an empty own __proto__ value in a derived legacy delta and validates it before hooks or storage', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const stored = { ...baseRecord(), metadata: { title: 'Original' } };
      const requestedRecord = structuredClone(stored);
      Object.defineProperty(requestedRecord.metadata, '__proto__', {
        value: {},
        enumerable: true,
        configurable: true,
        writable: true,
      });
      mockStorageService.getMeta.resolves(stored);
      const resolveUpdate = sinon.stub().resolves(updateSchemaResolution('enforce'));
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: false,
        issues: [{ code: 'record-schema.type', pointer: '/__proto__', expected: { type: 'object' } }],
        truncated: false,
      });
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        requestedRecord,
        { username: 'legacy-service-user' },
        true,
        true
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0]).to.deep.include({
        code: 'record-schema.type',
        pointer: '/__proto__',
      });
      expect(validateResolvedArtifact.calledOnce).to.equal(true);
      const derivedDelta = validateResolvedArtifact.firstCall.args[0].input;
      expect(Object.keys(derivedDelta)).to.deep.equal(['__proto__']);
      expect(Object.getPrototypeOf(derivedDelta)).to.equal(Object.prototype);
      expect(derivedDelta).to.deep.equal(JSON.parse('{"__proto__":{}}'));
      expect(JSON.stringify(derivedDelta)).to.equal('{"__proto__":{}}');
      expect(preSaveHook.notCalled).to.equal(true);
      expect(mockRecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('runs post-merge business validation against the authoritative merged candidate', async function () {
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'keep' } };
      const rawDelta = { title: 'Merged' };
      mockStorageService.getMeta.resolves(stored);
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.callsFake(async (request: any) => {
        expect(request.candidate.metadata).to.deep.equal({ title: 'Merged', retained: 'keep' });
        return blockingResult();
      });

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        false,
        false,
        {},
        { metadata: rawDelta, mode: 'merge' },
        createRecordSaveContext()
      );

      expect(result.outcome).to.equal('not-saved');
      expect(rawDelta).to.deep.equal({ title: 'Merged' });
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('characterizes service-owned recursive object merge and array concatenation before pre-save hooks', async function () {
      const stored = {
        ...baseRecord(),
        metadata: {
          title: 'Original',
          retained: 'keep',
          nested: {
            overwritten: 'stored',
            retained: true,
            values: [{ id: 'nested-stored' }],
          },
          values: [{ id: 'stored' }],
        },
      };
      const rawDelta = {
        title: 'Merged',
        merge: 'ordinary metadata field',
        nested: {
          overwritten: 'incoming',
          incoming: true,
          values: [{ id: 'nested-incoming' }],
        },
        values: [{ id: 'incoming' }],
      };
      const expectedMergedMetadata = {
        title: 'Merged',
        merge: 'ordinary metadata field',
        retained: 'keep',
        nested: {
          overwritten: 'incoming',
          retained: true,
          incoming: true,
          values: [{ id: 'nested-stored' }, { id: 'nested-incoming' }],
        },
        values: [{ id: 'stored' }, { id: 'incoming' }],
      };
      mockStorageService.getMeta.resolves(stored);
      (globalThis as Record<string, unknown>).__recordContractMergeHookInput = undefined;
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              pre: [
                {
                  function:
                    '(_oid, record) => { globalThis.__recordContractMergeHookInput = structuredClone(record.metadata); return record; }',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          stored,
          { username: 'user-1' },
          true,
          false,
          {},
          { metadata: rawDelta, mode: 'merge' },
          createRecordSaveContext()
        );

        expect(result.wasPersisted()).to.equal(true);
        expect((globalThis as Record<string, unknown>).__recordContractMergeHookInput).to.deep.equal(
          expectedMergedMetadata
        );
        expect(mockStorageService.updateMeta.firstCall.args[2].metadata).to.deep.equal(expectedMergedMetadata);
        expect(rawDelta).to.deep.equal({
          title: 'Merged',
          merge: 'ordinary metadata field',
          nested: {
            overwritten: 'incoming',
            incoming: true,
            values: [{ id: 'nested-incoming' }],
          },
          values: [{ id: 'incoming' }],
        });
      } finally {
        delete (globalThis as Record<string, unknown>).__recordContractMergeHookInput;
      }
    });

    it('preserves browser recursive merge with array replacement after raw delta validation', async function () {
      enableRecordSchema();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const stored = {
        ...baseRecord(),
        metadata: {
          retained: 'keep',
          nested: {
            retained: true,
            values: [{ id: 'nested-stored' }],
          },
          values: [{ id: 'stored' }],
        },
      };
      const rawDelta = {
        nested: {
          incoming: true,
          values: [{ id: 'nested-incoming' }],
        },
        values: [{ id: 'incoming' }],
      };
      const expectedMergedMetadata = {
        retained: 'keep',
        nested: {
          retained: true,
          incoming: true,
          values: [{ id: 'nested-incoming' }],
        },
        values: [{ id: 'incoming' }],
      };
      mockStorageService.getMeta.resolves(stored);
      const resolution = updateSchemaResolution('enforce');
      const resolveUpdate = sinon.stub().resolves(resolution);
      const validateResolvedArtifact = sinon.stub().callsFake((request: any) => {
        expect(request.input).to.equal(rawDelta);
        expect(request.input).to.deep.equal({
          nested: {
            incoming: true,
            values: [{ id: 'nested-incoming' }],
          },
          values: [{ id: 'incoming' }],
        });
        return { kind: 'validated', valid: true, issues: [], truncated: false };
      });
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      const applySubmission = sinon.spy(RecordsService, 'applySubmittedMetadata');
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');
      const businessValidation = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      businessValidation.callsFake(async (request: any) => {
        expect(request.candidate.metadata).to.deep.equal(expectedMergedMetadata);
        return allowResult({ mode: 'enforce' });
      });

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        true,
        false,
        {},
        { metadata: rawDelta, mode: 'merge', arrayMergeMode: 'replace' },
        recordSchemaContext({ routeFamily: 'browser', operation: 'update' })
      );

      expect(result.wasPersisted()).to.equal(true);
      expect(resolveUpdate.calledOnce).to.equal(true);
      expect(validateResolvedArtifact.calledOnce).to.equal(true);
      expect(validateResolvedArtifact.firstCall.args[0]).to.deep.include({
        digest: 'b'.repeat(64),
        schemaKind: 'update',
        input: rawDelta,
      });
      expect(validateResolvedArtifact.firstCall.args[0].document).to.equal(resolution.document);
      expect(resolveUpdate.calledBefore(validateResolvedArtifact)).to.equal(true);
      expect(validateResolvedArtifact.calledBefore(applySubmission)).to.equal(true);
      expect(validateResolvedArtifact.calledBefore(preSaveHook)).to.equal(true);
      expect(validateResolvedArtifact.calledBefore(businessValidation)).to.equal(true);
      expect(validateResolvedArtifact.calledBefore(mockStorageService.updateMeta)).to.equal(true);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata).to.deep.equal(expectedMergedMetadata);
      expect(rawDelta).to.deep.equal({
        nested: {
          incoming: true,
          values: [{ id: 'nested-incoming' }],
        },
        values: [{ id: 'incoming' }],
      });
    });

    it('characterizes service-owned replacement as discarding all omitted stored metadata', async function () {
      const stored = {
        ...baseRecord(),
        metadata: {
          title: 'Original',
          retained: 'discard',
          nested: { stored: true },
          values: [{ id: 'stored' }],
        },
      };
      const rawReplacement = {
        title: 'Replacement',
        nested: { incoming: true },
        values: [{ id: 'incoming' }],
      };
      mockStorageService.getMeta.resolves(stored);
      (global as any).RecordValidationService.resolve.resolves(allowResult());
      const structuralValidation = sinon.spy(RecordsService, 'validateUpdateMetadataStructure');

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1' },
        false,
        false,
        {},
        { metadata: rawReplacement, mode: 'replace' },
        createRecordSaveContext()
      );

      expect(result.wasPersisted()).to.equal(true);
      expect(structuralValidation.calledOnceWithExactly(rawReplacement)).to.equal(true);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata).to.deep.equal(rawReplacement);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata).not.to.equal(rawReplacement);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata).not.to.have.property('retained');
      expect(rawReplacement).to.deep.equal({
        title: 'Replacement',
        nested: { incoming: true },
        values: [{ id: 'incoming' }],
      });
    });

    it('resolves brand and record type from the stored snapshot after object-metadata replacement', async function () {
      mockSails.config.recordtype = { rdmp: { recordValidation: { mode: 'enforce' } } };
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const replacement = {
        ...baseRecord('Replacement object metadata'),
        metaMetadata: { sourceMetadata: 'replacement' },
      };
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.callsFake(async (request: any) => {
        expect(request.candidate.metaMetadata).to.deep.include({
          brandId: 'brand-1',
          type: 'rdmp',
          sourceMetadata: 'replacement',
        });
        return blockingResult();
      });

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        replacement,
        { username: 'user-1' },
        false,
        false
      );

      expect(result.outcome).to.equal('not-saved');
      expect(resolve.calledOnce).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('rejects candidate record-type divergence before hooks and runs hooks from the stored type otherwise', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const authoritativeType = {
        name: 'rdmp',
        hooks: {
          onUpdate: {
            pre: [
              {
                function:
                  '(_oid, record) => ({ ...record, metadata: { ...record.metadata, authoritativeHookRan: true } })',
              },
            ],
          },
        },
        searchable: false,
      };
      const wrongType = {
        name: 'other-type',
        hooks: {
          onUpdate: {
            pre: [{ function: '() => { throw new Error("wrong-type hook ran"); }' }],
          },
        },
        searchable: false,
      };
      (global as any).RecordTypesService.get.callsFake((_brand: unknown, name: string) =>
        of(name === 'rdmp' ? authoritativeType : wrongType)
      );
      const triggerPreSave = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

      const divergent = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        {
          ...baseRecord('Candidate type divergence'),
          metaMetadata: { ...stored.metaMetadata, type: 'other-type' },
        },
        { username: 'user-1' },
        true,
        false,
        {},
        undefined,
        createRecordSaveContext({ routeFamily: 'api', operation: 'update' })
      );

      expect(divergent.outcome).to.equal('not-saved');
      expect(divergent.problems[0].issues[0].code).to.equal('record-validation-authority-context-divergence');
      expect((global as any).RecordTypesService.get.calledOnce).to.equal(true);
      expect((global as any).RecordTypesService.get.firstCall.args[1]).to.equal('rdmp');
      expect(triggerPreSave.notCalled).to.equal(true);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);

      (global as any).RecordTypesService.get.resetHistory();

      (global as any).RecordValidationService.resolve.callsFake(async (request: any) => {
        expect(request.candidate.metaMetadata.type).to.equal('rdmp');
        expect(request.candidate.metadata.authoritativeHookRan).to.equal(true);
        return allowResult();
      });
      const authoritative = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        {
          ...baseRecord('Authoritative hook selection'),
          metaMetadata: { brandId: 'brand-1', form: 'default-form' },
        },
        { username: 'user-1' },
        true,
        false,
        {},
        undefined,
        createRecordSaveContext({ routeFamily: 'browser', operation: 'update' })
      );

      expect(authoritative.wasPersisted()).to.equal(true);
      expect((global as any).RecordTypesService.get.calledOnce).to.equal(true);
      expect((global as any).RecordTypesService.get.firstCall.args[1]).to.equal('rdmp');
      expect(triggerPreSave.calledOnce).to.equal(true);
      expect(triggerPreSave.firstCall.args[2]).to.equal(authoritativeType);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata.authoritativeHookRan).to.equal(true);
    });

    it('requires authoritative validation when the pre-update snapshot throws or is unusable', async function () {
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(blockingResult());
      const snapshotSetups = [
        () => mockStorageService.getMeta.rejects(new Error('snapshot unavailable')),
        () => mockStorageService.getMeta.resolves(null),
        () => mockStorageService.getMeta.resolves([]),
        () => mockStorageService.getMeta.resolves({}),
        () => mockStorageService.getMeta.resolves({ redboxOid: 'record-123', authorization: {} }),
      ];

      for (const setupSnapshot of snapshotSetups) {
        mockStorageService.getMeta.reset();
        mockStorageService.updateMeta.resetHistory();
        resolve.resetHistory();
        setupSnapshot();

        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          baseRecord(),
          { username: 'user-1' },
          false,
          false
        );

        expect(result.outcome).to.equal('not-saved');
        expect(resolve.calledOnce).to.equal(true);
        expect(resolve.firstCall.args[0].candidate.metaMetadata.form).to.equal('default-form');
        expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      }
    });

    it('keeps currentStep identical when the stored snapshot is unavailable', async function () {
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(allowResult());

      mockStorageService.getMeta.resolves(baseRecord());
      await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        baseRecord('Changed with snapshot'),
        { username: 'user-1' },
        false,
        false
      );

      mockStorageService.getMeta.reset();
      mockStorageService.getMeta.rejects(new Error('snapshot unavailable'));
      await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        baseRecord('Changed without snapshot'),
        { username: 'user-1' },
        false,
        false
      );

      expect(resolve.callCount).to.equal(2);
      expect(resolve.firstCall.args[0].currentStep).to.equal('draft');
      expect(resolve.secondCall.args[0].currentStep).to.equal('draft');
    });

    it('normalizes explicit null users into an unauthenticated validation actor', async function () {
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(allowResult());

      const createResult = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Null-user create' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        null as any
      );
      expect(createResult.outcome).to.equal('saved');
      expect(resolve.firstCall.args[0].actor).to.deep.equal({ authenticated: false, roles: [] });

      mockStorageService.getMeta.resolves(baseRecord());
      const updateResult = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        baseRecord('Null-user update'),
        null as any,
        false,
        false
      );
      expect(updateResult.outcome).to.equal('saved');
      expect(resolve.secondCall.args[0].actor).to.deep.equal({ authenticated: false, roles: [] });
    });

    it('merges stored fields into the authoritative persisted candidate without exposing them to pre-save hooks', async function () {
      const stored = { ...baseRecord(), storageOnly: { revision: 17 } };
      const requested = baseRecord('Caller mutation') as any;
      delete requested.storageOnly;
      mockStorageService.getMeta.resolves(stored);
      (globalThis as any).__partialUpdateHookInput = undefined;
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              pre: [
                {
                  function:
                    '(_oid, record) => { globalThis.__partialUpdateHookInput = structuredClone(record); return { ...record, hookOwned: true }; }',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.callsFake(async (request: any) => {
        expect(request.candidate.storageOnly).to.deep.equal({ revision: 17 });
        expect(request.candidate.hookOwned).to.equal(true);
        return allowResult();
      });

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          requested,
          { username: 'user-1' },
          true,
          false
        );

        expect(result.outcome).to.equal('saved');
        expect((globalThis as any).__partialUpdateHookInput).not.to.have.property('storageOnly');
        const persistedMutation = mockStorageService.updateMeta.firstCall.args[2];
        expect(persistedMutation.storageOnly).to.deep.equal({ revision: 17 });
        expect(persistedMutation.hookOwned).to.equal(true);
      } finally {
        delete (globalThis as any).__partialUpdateHookInput;
      }
    });

    it('exposes current attachmentFields to update hooks and refreshes them after a form change', async function () {
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      (globalThis as any).__updateHookAttachmentFields = undefined;
      (global as any).FormsService.getFormByName.callsFake((formName: string) =>
        of({
          name: formName,
          configuration: {
            attachmentFields:
              formName === 'after-update-hook-form' ? ['afterUpdateAttachment'] : ['beforeUpdateAttachment'],
          },
        })
      );
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              pre: [
                {
                  function:
                    '(_oid, record) => { globalThis.__updateHookAttachmentFields = [...record.metaMetadata.attachmentFields]; return { ...record, metaMetadata: { ...record.metaMetadata, form: "after-update-hook-form" } }; }',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          baseRecord('Changed'),
          { username: 'user-1' },
          true,
          false
        );

        expect(result.outcome).to.equal('saved');
        expect((globalThis as any).__updateHookAttachmentFields).to.deep.equal(['beforeUpdateAttachment']);
        expect(mockStorageService.updateMeta.firstCall.args[2].metaMetadata).to.deep.include({
          form: 'after-update-hook-form',
          attachmentFields: ['afterUpdateAttachment'],
        });
      } finally {
        delete (globalThis as any).__updateHookAttachmentFields;
      }
    });

    it('skips authoritative validation for authorization-only writes but validates form-context changes', async function () {
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;

      const authorizationCandidate = structuredClone(stored);
      authorizationCandidate.authorization.edit.push('editor-2');
      const authorizationResult = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        authorizationCandidate,
        { username: 'user-1' },
        false,
        false
      );
      expect(authorizationResult.wasPersisted()).to.equal(true);
      expect(resolve.notCalled).to.equal(true);

      mockStorageService.updateMeta.resetHistory();
      const formCandidate = structuredClone(stored);
      formCandidate.metaMetadata.form = 'new-form';
      await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        formCandidate,
        { username: 'user-1' },
        false,
        false
      );
      expect(resolve.calledOnce).to.equal(true);
      expect(resolve.firstCall.args[0].candidate.metaMetadata.form).to.equal('new-form');
      expect(resolve.firstCall.args[0].validationOperation).to.equal(undefined);
      expect(resolve.firstCall.args[0].evaluateFormValidators).to.equal(true);
    });

    it('rejects named-operation contract failures on exempt updates in shadow and enforce', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      const classifications = [
        {
          name: 'authorization-only',
          candidate: () => {
            const candidate = structuredClone(stored);
            candidate.authorization.edit.push('editor-2');
            return candidate;
          },
        },
        {
          name: 'non-form-system-metadata',
          candidate: () => ({
            ...structuredClone(stored),
            metaMetadata: {
              ...structuredClone(stored.metaMetadata),
              sourceMetadata: 'harvest-system-state',
            },
          }),
        },
        { name: 'no-change', candidate: () => structuredClone(stored) },
      ];
      const failures = [
        {
          operation: 'missing-operation',
          diagnostic: 'record-validation-operation-unknown',
          expectedCode: 'record-validation-operation-invalid',
          expectedKind: 'validation',
        },
        {
          operation: 'submit',
          diagnostic: 'record-validation-operation-role-unauthorized',
          expectedCode: 'record-validation-operation-unauthorized',
          expectedKind: 'authorization',
        },
      ];

      for (const mode of ['shadow', 'enforce'] as const) {
        for (const classification of classifications) {
          for (const failure of failures) {
            resolve.resetHistory();
            mockStorageService.updateMeta.resetHistory();
            resolve.resolves({
              status: 'unresolved',
              shouldBlock: true,
              mode,
              diagnostics: [{ code: failure.diagnostic, severity: 'error', message: 'Safe operation failure.' }],
            });

            const result = await RecordsService.updateMeta(
              { id: 'brand-1' },
              'record-123',
              classification.candidate(),
              { username: 'user-1', roles: [{ name: 'Researcher' }] },
              false,
              false,
              {},
              undefined,
              createRecordSaveContext({
                routeFamily: 'internal',
                operation: 'update',
                validationOperation: failure.operation,
              })
            );

            expect(result.outcome, `${mode} ${classification.name} ${failure.operation}`).to.equal('not-saved');
            expect(result.problems[0]).to.deep.include({ kind: failure.expectedKind, phase: 'pre-save' });
            expect(result.problems[0].issues[0].code).to.equal(failure.expectedCode);
            expect(resolve.calledOnce).to.equal(true);
            expect(resolve.firstCall.args[0]).to.deep.include({
              validationOperation: failure.operation,
              evaluateFormValidators: false,
            });
            expect(mockStorageService.updateMeta.notCalled).to.equal(true);
          }
        }
      }
    });

    it('skips validation for non-form system metadata writes on the real update path', async function () {
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const systemCandidate = structuredClone(stored) as any;
      systemCandidate.metaMetadata.sourceMetadata = 'harvest-system-state';

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        systemCandidate,
        { username: 'harvest-service' },
        false,
        false
      );

      expect(result.wasPersisted()).to.equal(true);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
    });

    it('keeps soft delete and restore on their dedicated lifecycle CAS boundaries', async function () {
      enableLifecycleStorage();
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      const record = baseRecord();

      const deleteResult = await RecordsService.delete(
        'record-123',
        false,
        record,
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );
      expect(deleteResult.success).to.equal(true);

      mockStorageService.getTombstone.resolves({
        redboxOid: 'record-123',
        revision: 3,
        brandId: 'brand-1',
        lifecycleState: 'deleted',
        deletedRecordMetadata: { ...record, revision: undefined },
      });
      (global as any).BrandingService.getBrandById = sinon.stub().resolves({ id: 'brand-1' });
      const restoreResult = await RecordsService.restoreRecord('record-123', { username: 'user-1' });

      expect(restoreResult.success).to.equal(true);
      expect(resolve.notCalled).to.equal(true);
      expect(mockStorageService.createTombstone.calledOnce).to.equal(true);
      expect(mockStorageService.removeActiveRecord.calledOnce).to.equal(true);
      expect(mockStorageService.updateTombstone.calledTwice).to.equal(true);
      expect(mockStorageService.createActiveRecordFromTombstone.calledOnce).to.equal(true);
      expect(mockStorageService.removeTombstone.calledOnce).to.equal(true);
      expect(mockStorageService.delete.notCalled).to.equal(true);
      expect(mockStorageService.restoreRecord.notCalled).to.equal(true);
    });

    it('validates an authorized transition against its target step and target form', async function () {
      const stored = baseRecord();
      const transitionAuthorization = sinon.spy(RecordsService, 'hasTransitionRoleAuthorization');
      mockStorageService.getMeta.resolves(stored);
      const nextStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
        },
      };
      (global as any).WorkflowStepsService.get.returns(of(nextStep));
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onTransitionWorkflow: {
              pre: [
                {
                  function:
                    '(_oid, record) => ({ ...record, workflow: { ...record.workflow, hookMarker: "update-preserved" }, metadata: { ...record.metadata, transitionHookSawStage: record.workflow.stage } })',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      resolve.callsFake(async (request: any) => {
        expect(request.writeKind).to.equal('transition');
        expect(request.targetStep).to.equal('published');
        expect(request.currentStep).to.equal('draft');
        expect(request.candidate.metaMetadata.form).to.equal('published-form');
        expect(request.candidate.workflow.stage).to.equal('published');
        expect(request.candidate.workflow.hookMarker).to.equal('update-preserved');
        expect(request.candidate.metadata.transitionHookSawStage).to.equal('published');
        expect(request.actor.roles).to.deep.equal(['Publisher']);
        return blockingResult();
      });

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'publisher', roles: [{ name: 'Publisher' }] },
        true,
        true,
        nextStep
      );

      expect(result.outcome).to.equal('not-saved');
      expect(transitionAuthorization.callCount).to.equal(2);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('authorizes transitions with the canonical resolved step, not a same-name supplied object', async function () {
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const canonicalStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
        },
      };
      const fabricatedStep = {
        name: 'published',
        config: {
          form: 'attacker-form',
          workflow: { stage: 'attacker-stage' },
          authorization: { transitionRoles: [] },
        },
      };
      (global as any).WorkflowStepsService.get.returns(of(canonicalStep));
      const canonicalRecordType = { name: 'rdmp', hooks: {}, searchable: false };
      (global as any).RecordTypesService.get.returns(of(canonicalRecordType));
      const transitionAuthorization = sinon.spy(RecordsService, 'hasTransitionRoleAuthorization');
      const preTransitionHook = sinon.spy(RecordsService, 'triggerPreSaveTransitionWorkflowTriggers');

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'researcher', roles: [{ name: 'Researcher' }] },
        true,
        true,
        fabricatedStep
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('record-validation-transition-unauthorized');
      expect((global as any).WorkflowStepsService.get.calledOnceWithExactly(canonicalRecordType, 'published')).to.equal(
        true
      );
      expect(transitionAuthorization.calledOnce).to.equal(true);
      expect(transitionAuthorization.firstCall.args[0]).to.equal(canonicalStep);
      expect(preTransitionHook.notCalled).to.equal(true);
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    for (const routeFamily of ['browser', 'api'] as const) {
      it(`rejects an unresolved ${routeFamily} transition as a transition before hooks or persistence`, async function () {
        const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
        const stored = baseRecord();
        mockStorageService.getMeta.resolves(stored);
        mockSails.config.recordtype = { rdmp: { recordValidation: { mode: 'enforce' } } };
        (global as any).WorkflowStepsService.get.returns(of(null));
        const triggerPreSave = sinon.spy(RecordsService, 'triggerPreSaveTriggers');

        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          stored,
          { username: 'user-1' },
          true,
          true,
          undefined,
          undefined,
          createRecordSaveContext({
            routeFamily,
            operation: 'transition',
            targetStep: 'missing-step',
          })
        );

        expect(result.outcome).to.equal('not-saved');
        expect(result.problems[0]).to.deep.include({ kind: 'system', phase: 'pre-save' });
        expect(result.problems[0].issues[0].code).to.equal('record-validation-form-resolution-failed');
        expect(triggerPreSave.notCalled).to.equal(true);
        expect((global as any).RecordTypesService.get.calledOnce).to.equal(true);
        expect((global as any).WorkflowStepsService.get.calledOnce).to.equal(true);
        expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
        expect(mockStorageService.updateMeta.notCalled).to.equal(true);
        const targetLog = mockSails.log.warn
          .getCalls()
          .map((call: sinon.SinonSpyCall) => call.args[1])
          .find((details: any) => details?.event === 'record_validation_workflow_target_rejected');
        expect(targetLog).to.deep.include({
          mode: 'enforce',
          operation: 'transition',
          diagnostic_code: 'record-validation-workflow-step-not-found',
        });
      });
    }

    it('normalizes a deleted transition-hook form before the primary transition save', async function () {
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
      });
      const nextStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
        },
      };
      (global as any).WorkflowStepsService.get.returns(of(nextStep));
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onTransitionWorkflow: {
              pre: [{ function: '(_oid, record) => { delete record.metaMetadata.form; return record; }' }],
            },
          },
          searchable: false,
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'publisher', roles: [{ name: 'Publisher' }] },
        true,
        false,
        nextStep
      );

      expect(result.outcome).to.equal('saved');
      expect((global as any).RecordValidationService.resolve.firstCall.args[0].candidate.metaMetadata.form).to.equal(
        'published-form'
      );
      expect(mockStorageService.updateMeta.firstCall.args[2].metaMetadata.form).to.equal('published-form');
    });

    it('rejects target-step transition roles safely before hooks, validation, attachments, or storage', async function () {
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      const nextStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'] },
        },
      };
      (global as any).WorkflowStepsService.get.returns(of(nextStep));

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'user-1', roles: [{ name: 'Researcher' }] },
        true,
        true,
        nextStep
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0]).to.deep.include({ kind: 'authorization', phase: 'pre-save' });
      expect(result.problems[0].issues[0].code).to.equal('record-validation-transition-unauthorized');
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('uses one complete candidate for create postSync validation, persistence, and detached hooks', async function () {
      (globalThis as any).__createPartialPostRecord = undefined;
      installAuthoritativeStorage();
      const recordType = {
        name: 'rdmp',
        hooks: {
          onCreate: {
            postSync: [{ function: '() => ({ metadata: { title: "Partial create postSync" } })' }],
            post: [
              {
                function: '(_oid, record) => { globalThis.__createPartialPostRecord = structuredClone(record); }',
              },
            ],
          },
        },
        searchable: false,
      };
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(allowResult());

      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          {
            metadata: { title: 'Primary create', omittedByReplacement: true },
            systemMarker: { retained: true },
          },
          recordType,
          { username: 'user-1' }
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));

        expect(result.outcome).to.equal('saved');
        expect(resolve.callCount).to.equal(2);
        expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
        const validated = resolve.secondCall.args[0].candidate;
        const persisted = mockStorageService.updateMeta.firstCall.args[2];
        expect(persisted).to.deep.equal(validated);
        expect(persisted.metadata).to.deep.equal({ title: 'Partial create postSync' });
        expect(persisted.metaMetadata).to.deep.include({
          type: 'rdmp',
          form: 'default-form',
          brandId: 'brand-1',
        });
        expect(persisted.workflow).to.deep.equal({ stage: 'draft' });
        expect(persisted.systemMarker).to.deep.equal({ retained: true });
        expect((globalThis as any).__createPartialPostRecord).to.deep.equal(persisted);
      } finally {
        delete (globalThis as any).__createPartialPostRecord;
      }
    });

    it('uses one complete candidate for targeted-create transition postSync processing', async function () {
      (globalThis as any).__createTransitionPartialPostRecord = undefined;
      installAuthoritativeStorage();
      const targetStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
        },
      };
      (global as any).WorkflowStepsService.get.returns(of(targetStep));
      const recordType = {
        name: 'rdmp',
        hooks: {
          onTransitionWorkflow: {
            postSync: [{ function: '() => ({ metadata: { title: "Partial transition postSync" } })' }],
            post: [
              {
                function:
                  '(_oid, record) => { globalThis.__createTransitionPartialPostRecord = structuredClone(record); }',
              },
            ],
          },
        },
        searchable: false,
      };
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(allowResult());

      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          {
            metadata: { title: 'Primary targeted create', omittedByReplacement: true },
            systemMarker: { retained: true },
          },
          recordType,
          { username: 'publisher', roles: [{ name: 'Publisher' }] },
          true,
          true,
          'published'
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));

        expect(result.outcome).to.equal('saved');
        expect(resolve.callCount).to.equal(2);
        expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
        const validated = resolve.secondCall.args[0].candidate;
        const persisted = mockStorageService.updateMeta.firstCall.args[2];
        expect(persisted).to.deep.equal(validated);
        expect(persisted.metadata).to.deep.equal({ title: 'Partial transition postSync' });
        expect(persisted.metaMetadata).to.deep.include({
          type: 'rdmp',
          form: 'published-form',
          brandId: 'brand-1',
        });
        expect(persisted.workflow).to.deep.equal({ stage: 'published' });
        expect(persisted.systemMarker).to.deep.equal({ retained: true });
        expect((globalThis as any).__createTransitionPartialPostRecord).to.deep.equal(persisted);
      } finally {
        delete (globalThis as any).__createTransitionPartialPostRecord;
      }
    });

    it('keeps the primary update and skips an invalid postSync secondary mutation', async function () {
      const stored = baseRecord();
      const primaryCandidate = baseRecord('Primary');
      mockStorageService.getMeta.resolves(stored);
      const persistedCandidates: any[] = [];
      mockStorageService.updateMeta.callsFake(async (_brand: any, _oid: string, candidate: any) => {
        persistedCandidates.push(structuredClone(candidate));
        return { success: true, oid: 'record-123', applicationState: 'applied' };
      });
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              postSync: [
                {
                  function:
                    '(_oid, record) => ({ ...record, metadata: { ...record.metadata, title: "Invalid secondary" } })',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.onFirstCall().resolves(allowResult());
      resolve.onSecondCall().resolves(blockingResult());

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        primaryCandidate,
        { username: 'user-1' },
        true,
        true
      );

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.problems[0]).to.deep.include({ kind: 'system', phase: 'post-save' });
      expect(result.problems[0].issues[0].code).to.equal('record-validation-post-sync-failed');
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
      expect(persistedCandidates[0].metadata.title).to.equal('Primary');
      expect(resolve.secondCall.args[0].candidate.metadata.title).to.equal('Invalid secondary');
    });

    it('persists the complete authoritative candidate validated after a partial postSync replacement', async function () {
      (globalThis as any).__updatePartialPostRecord = undefined;
      const stored = baseRecord();
      installAuthoritativeStorage(stored);
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              postSync: [{ function: '() => ({ metadata: { title: "Partial postSync" } })' }],
              post: [
                {
                  function: '(_oid, record) => { globalThis.__updatePartialPostRecord = structuredClone(record); }',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(allowResult());

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        baseRecord('Primary'),
        { username: 'user-1' },
        true,
        true
      );

      expect(result.outcome).to.equal('saved');
      expect(mockStorageService.updateMeta.callCount).to.equal(2);
      const validated = resolve.secondCall.args[0].candidate;
      const persisted = mockStorageService.updateMeta.secondCall.args[2];
      expect(persisted).to.deep.equal(validated);
      expect(persisted.metadata).to.deep.equal({ title: 'Partial postSync' });
      expect(persisted.metaMetadata).to.deep.include({
        type: 'rdmp',
        form: 'default-form',
        brandId: 'brand-1',
      });
      expect(persisted.workflow).to.deep.equal({ stage: 'draft' });
      expect(persisted.authorization.edit).to.deep.equal(['user-1']);
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
      expect((globalThis as any).__updatePartialPostRecord).to.deep.equal(persisted);
      delete (globalThis as any).__updatePartialPostRecord;
    });

    it('rebinds the route OID between sequential postSync hooks and before detached hooks', async function () {
      (globalThis as any).__postSyncSecondHookOid = undefined;
      (globalThis as any).__postSyncDetachedHookOid = undefined;
      mockStorageService.getMeta.resolves(baseRecord());
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'adapter-storage-id',
        applicationState: 'applied',
      });
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              postSync: [
                { function: '() => ({ metadata: { title: "First postSync replacement" } })' },
                {
                  function:
                    '(_oid, record) => { globalThis.__postSyncSecondHookOid = record.redboxOid; return { ...record, secondPostSync: true }; }',
                },
              ],
              post: [
                {
                  function: '(_oid, record) => { globalThis.__postSyncDetachedHookOid = record.redboxOid; }',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          baseRecord('Primary'),
          { username: 'user-1' },
          true,
          true
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));

        expect(result.outcome).to.equal('saved');
        expect(result.oid).to.equal('record-123');
        expect((globalThis as any).__postSyncSecondHookOid).to.equal('record-123');
        expect((globalThis as any).__postSyncDetachedHookOid).to.equal('record-123');
        expect(mockStorageService.updateMeta.callCount).to.equal(2);
        expect(mockStorageService.updateMeta.secondCall.args[1]).to.equal('record-123');
        expect(mockStorageService.updateMeta.secondCall.args[2]).to.include({
          redboxOid: 'record-123',
          secondPostSync: true,
        });
      } finally {
        delete (globalThis as any).__postSyncSecondHookOid;
        delete (globalThis as any).__postSyncDetachedHookOid;
      }
    });

    it('rejects a conflicting postSync OID before later hooks, secondary persistence, or detached effects', async function () {
      (globalThis as any).__conflictingPostSyncSecondHookRan = false;
      (globalThis as any).__conflictingPostSyncDetachedHookRan = false;
      mockStorageService.getMeta.resolves(baseRecord());
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'adapter-storage-id',
        applicationState: 'applied',
      });
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              postSync: [
                { function: '(_oid, record) => ({ ...record, redboxOid: "redirected-record" })' },
                {
                  function:
                    '(_oid, record) => { globalThis.__conflictingPostSyncSecondHookRan = true; return record; }',
                },
              ],
              post: [
                {
                  function: '() => { globalThis.__conflictingPostSyncDetachedHookRan = true; }',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          baseRecord('Primary'),
          { username: 'user-1' },
          true,
          true
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));

        expect(result.outcome).to.equal('saved-with-warnings');
        expect((globalThis as any).__conflictingPostSyncSecondHookRan).to.equal(false);
        expect((globalThis as any).__conflictingPostSyncDetachedHookRan).to.equal(false);
        expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
        expect((global as any).RecordValidationService.resolve.calledOnce).to.equal(true);
        expect(mockSearchService.index.notCalled).to.equal(true);
      } finally {
        delete (globalThis as any).__conflictingPostSyncSecondHookRan;
        delete (globalThis as any).__conflictingPostSyncDetachedHookRan;
      }
    });

    it('preserves an actionable post-save validation cause and phase for secondary candidates', async function () {
      const { RECORD_VALIDATION_DIAGNOSTIC_CODES } = require('../../src/services/RecordValidationService');
      mockStorageService.getMeta.resolves(baseRecord());
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onUpdate: {
              postSync: [
                {
                  function:
                    '(_oid, record) => ({ ...record, metadata: { ...record.metadata, title: "Timed out secondary" } })',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.onFirstCall().resolves(allowResult());
      resolve.onSecondCall().resolves({
        status: 'unresolved',
        shouldBlock: true,
        mode: 'enforce',
        diagnostics: [
          {
            code: RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout,
            severity: 'error',
            message: 'safe timeout',
          },
        ],
      });

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        baseRecord('Primary'),
        { username: 'user-1' },
        true,
        true
      );

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.problems[0]).to.deep.include({ kind: 'system', phase: 'post-save' });
      expect(result.problems[0].issues[0].code).to.equal('record-validation-timeout');
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
    });

    it('dispatches transition post hooks only after awaited secondary persistence', async function () {
      const events: string[] = [];
      (globalThis as any).__transitionPersistenceOrder = events;
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      mockStorageService.updateMeta.callsFake(async () => {
        events.push(mockStorageService.updateMeta.callCount === 1 ? 'primary' : 'secondary');
        return { success: true, oid: 'record-123', applicationState: 'applied' };
      });
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onTransitionWorkflow: {
              postSync: [
                {
                  function:
                    '(_oid, record) => { globalThis.__transitionPersistenceOrder.push("postSync"); return { ...record, metadata: { ...record.metadata, transitioned: true } }; }',
                },
              ],
              post: [
                {
                  function: '() => { globalThis.__transitionPersistenceOrder.push("post"); }',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());
      const nextStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
        },
      };

      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          stored,
          { username: 'publisher', roles: [{ name: 'Publisher' }] },
          true,
          true,
          nextStep
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));

        expect(result.outcome).to.equal('saved');
        expect(events).to.deep.equal(['primary', 'postSync', 'secondary', 'post']);
      } finally {
        delete (globalThis as any).__transitionPersistenceOrder;
      }
    });

    it('normalizes a malformed postSync transition form before secondary persistence', async function () {
      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      mockStorageService.updateMeta.resolves({
        success: true,
        oid: 'record-123',
        applicationState: 'applied',
      });
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          hooks: {
            onTransitionWorkflow: {
              postSync: [
                {
                  function:
                    '(_oid, record) => ({ ...record, metaMetadata: { ...record.metaMetadata, form: "../malformed" } })',
                },
              ],
            },
          },
          searchable: false,
        })
      );
      (global as any).RecordValidationService.resolve.resolves(allowResult());
      const nextStep = {
        name: 'published',
        config: {
          form: 'published-form',
          workflow: { stage: 'published' },
          authorization: { transitionRoles: ['Publisher'], viewRoles: [], editRoles: [] },
        },
      };

      const result = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        stored,
        { username: 'publisher', roles: [{ name: 'Publisher' }] },
        true,
        true,
        nextStep
      );

      expect(result.outcome).to.equal('saved');
      expect(mockStorageService.updateMeta.callCount).to.equal(2);
      expect(mockStorageService.updateMeta.firstCall.args[2].metaMetadata.form).to.equal('published-form');
      expect(mockStorageService.updateMeta.secondCall.args[2].metaMetadata.form).to.equal('published-form');
    });

    it('requires detached post-hook writes to enter RecordsService validation independently', async function () {
      installAuthoritativeStorage();
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(allowResult());
      let detachedWrite: Promise<any> | undefined;
      (globalThis as any).__detachedValidatedWrite = (oid: string) => {
        detachedWrite = RecordsService.updateMeta(
          { id: 'brand-1' },
          oid,
          { ...baseRecord('Detached mutation'), redboxOid: oid },
          { username: 'internal-service' },
          false,
          false
        );
        return detachedWrite;
      };
      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Created' } },
          {
            name: 'rdmp',
            hooks: { onCreate: { post: [{ function: '(oid) => globalThis.__detachedValidatedWrite(oid)' }] } },
            searchable: false,
          },
          { username: 'user-1' }
        );
        await new Promise(resolveImmediate => setImmediate(resolveImmediate));
        await detachedWrite;

        expect(result.outcome).to.equal('saved');
        expect(resolve.callCount).to.equal(2);
        expect(resolve.secondCall.args[0].writeKind).to.equal('update');
        expect(resolve.secondCall.args[0].candidate.metadata.title).to.equal('Detached mutation');
      } finally {
        delete (globalThis as any).__detachedValidatedWrite;
      }
    });

    it('validates internal writes by default and accepts only an audited complete internal bypass', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(blockingResult());

      const strictResult = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Internal strict' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'migration-service' }
      );
      expect(strictResult.outcome).to.equal('not-saved');

      resolve.resetHistory();
      mockStorageService.create.resetHistory();
      mockStorageService.createRecordAudit.resetHistory();
      const bypassResult = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'sensitive-record-value' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'migration-service', token: 'secret-token' },
        true,
        true,
        undefined,
        createRecordSaveContext({
          requestId: '9f851760-1978-4fb4-a667-c29c42b7e50d',
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: {
            mode: 'bypass',
            reason: 'trusted-data-migration',
            actor: { kind: 'service', id: 'MigrationService' },
          },
        })
      );

      expect(bypassResult.outcome).to.equal('saved');
      expect(resolve.notCalled).to.equal(true);
      expect(mockStorageService.createRecordAudit.calledOnce).to.equal(true);
      const audit = mockStorageService.createRecordAudit.firstCall.args[0];
      expect(audit.action).to.equal('validation-bypassed');
      expect(audit.record.validationBypass).to.deep.include({
        mode: 'bypass',
        reason: 'trusted-data-migration',
        requestId: '9f851760-1978-4fb4-a667-c29c42b7e50d',
      });
      expect(audit.record.validationBypass.actor).to.deep.equal({ kind: 'service', id: 'MigrationService' });
      expect(audit.record.validationBypass.recordContext).to.deep.include({
        form: 'default-form',
        recordType: 'rdmp',
        brand: 'brand-1',
      });
      expect(audit.record.validationBypass.recordContext.oid).to.be.a('string').and.not.be.empty;
      expect(JSON.stringify(audit)).not.to.include('sensitive-record-value');
      expect(JSON.stringify(audit)).not.to.include('secret-token');
      const bypassLogCall = mockSails.log.warn
        .getCalls()
        .find((call: any) => call.args[1]?.event === 'record_validation_bypassed');
      expect(bypassLogCall?.args[1]).to.deep.include({
        request_id: '9f851760-1978-4fb4-a667-c29c42b7e50d',
        record_type: 'rdmp',
        form: 'default-form',
        validation_operation: 'strict-all',
      });
      expect(JSON.stringify(bypassLogCall?.args[1])).not.to.match(/sensitive-record-value|secret-token/);
    });

    it('rejects incomplete, unauditable, and HTTP-forged bypasses without persistence', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const validBypass = {
        mode: 'bypass',
        reason: 'configuration-recovery',
        actor: { kind: 'service', id: 'RecoveryService' },
      };
      const contexts = [
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: null as any,
        }),
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: 'bypass' as any,
        }),
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: { ...validBypass, mode: 'skip' } as any,
        }),
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: { ...validBypass, reason: 'because-I-said-so' } as any,
        }),
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: { ...validBypass, actor: { kind: 'service', id: '' } } as any,
        }),
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: { ...validBypass, actor: null } as any,
        }),
        createRecordSaveContext({
          routeFamily: 'api',
          operation: 'create',
          validationBypass: validBypass as any,
        }),
      ];

      for (const context of contexts) {
        mockStorageService.create.resetHistory();
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Rejected bypass' } },
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'service' },
          true,
          true,
          undefined,
          context
        );
        expect(result.outcome).to.equal('not-saved');
        expect(result.problems[0].issues[0].code).to.match(/record-validation-bypass-(invalid|forbidden)/);
        expect(mockStorageService.create.notCalled).to.equal(true);
      }

      mockStorageService.createRecordAudit.rejects(new Error('secret audit backend failure'));
      const unauditable = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Rejected audit' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'service' },
        true,
        true,
        undefined,
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: validBypass,
        })
      );
      expect(unauditable.outcome).to.equal('not-saved');
      expect(unauditable.problems[0].issues[0].code).to.equal('record-validation-bypass-audit-failed');
      expect(JSON.stringify(unauditable)).not.to.include('secret audit backend failure');
      expect(JSON.stringify(mockSails.log.error.args)).not.to.include('secret audit backend failure');
      expect(mockStorageService.create.notCalled).to.equal(true);

      mockStorageService.createRecordAudit.resetBehavior();
      mockStorageService.createRecordAudit.resolves(undefined);
      mockStorageService.create.resetHistory();
      const missingAuditConfirmation = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Missing audit confirmation' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'service' },
        true,
        true,
        undefined,
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'create',
          validationBypass: validBypass,
        })
      );
      expect(missingAuditConfirmation.outcome).to.equal('not-saved');
      expect(missingAuditConfirmation.problems[0].issues[0].code).to.equal('record-validation-bypass-audit-failed');
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('does not accept bypass-shaped HTTP record data as a validation capability', async function () {
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(blockingResult());

      const result = await RecordsService.create(
        { id: 'brand-1' },
        {
          metadata: { title: 'HTTP payload' },
          authorization: { edit: ['user-1'], view: ['user-1'] },
          validationBypass: {
            mode: 'bypass',
            reason: 'trusted-data-migration',
            actor: { kind: 'service', id: 'ForgedBrowserService' },
          },
        },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        true,
        true,
        undefined,
        createRecordSaveContext({ routeFamily: 'api', operation: 'create' })
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('record-validation-failed');
      expect(resolve.calledOnce).to.equal(true);
      expect(mockStorageService.createRecordAudit.notCalled).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('rejects cloned save contexts before validation, hooks, or storage', async function () {
      const preSaveHook = sinon.spy(RecordsService, 'triggerPreSaveTriggers');
      const trustedCreateContext = createRecordSaveContext({
        routeFamily: 'api',
        operation: 'create',
        validationOperation: 'publish',
      });
      const spreadCreateContext: RecordSaveContext = { ...trustedCreateContext };

      await rejects(
        () =>
          RecordsService.create(
            { id: 'brand-1' },
            { metadata: { title: 'Rejected create' } },
            { name: 'rdmp', hooks: { onCreate: { pre: [{ function: '(_oid, record) => record' }] } } },
            { username: 'user-1' },
            true,
            true,
            undefined,
            spreadCreateContext
          ),
        {
          name: 'TypeError',
          message: 'Record save contexts must be omitted or created by createRecordSaveContext().',
        }
      );

      const trustedUpdateContext = createRecordSaveContext({
        routeFamily: 'api',
        operation: 'update',
        validationOperation: 'publish',
      });
      const modifiedUpdateContext: RecordSaveContext = {
        ...trustedUpdateContext,
        validationOperation: 'forged-operation',
      };
      await rejects(
        () =>
          RecordsService.updateMeta(
            { id: 'brand-1' },
            'record-123',
            baseRecord('Rejected update'),
            { username: 'user-1' },
            true,
            true,
            {},
            { metadata: { title: 'Rejected update' }, mode: 'replace' },
            modifiedUpdateContext
          ),
        {
          name: 'TypeError',
          message: 'Record save contexts must be omitted or created by createRecordSaveContext().',
        }
      );

      expect(preSaveHook.notCalled).to.equal(true);
      expect(mockRecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.getMeta.notCalled).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('preserves internal-looking user metadata without treating it as save context', async function () {
      mockRecordValidationService.resolve.resolves(allowResult());
      const internalLookingUserMetadata = {
        validationBypass: { label: 'user metadata' },
        schemaOperation: 'user-defined-operation',
        ifMatch: 'user-defined-precondition',
        recordSchemaIfMatch: 'user-defined-record-field',
        schemaOutcome: { label: 'user-defined-outcome' },
      };
      const createInput = {
        metadata: { title: 'Created', ...internalLookingUserMetadata },
        authorization: { edit: ['user-1'], view: ['user-1'] },
      };
      const createResult = await RecordsService.create(
        { id: 'brand-1' },
        createInput,
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        false,
        false,
        undefined,
        createRecordSaveContext({ routeFamily: 'api', operation: 'create' })
      );

      expect(createResult.outcome).to.equal('saved');
      expect(createResult.schemaOutcome).to.equal(undefined);
      const createCandidate: unknown = mockStorageService.create.firstCall.args[1];
      assertUnknownRecord(createCandidate);
      const createdMetadata: unknown = createCandidate.metadata;
      assertUnknownRecord(createdMetadata);
      expect(createdMetadata).to.deep.include(internalLookingUserMetadata);
      expect(createInput.metadata.schemaOutcome).to.deep.equal(internalLookingUserMetadata.schemaOutcome);

      const stored = baseRecord();
      mockStorageService.getMeta.resolves(stored);
      mockStorageService.updateMeta.resetHistory();
      const updateInput = {
        ...stored,
        metadata: { title: 'Requested', ...internalLookingUserMetadata },
        metaMetadata: { ...stored.metaMetadata, ...internalLookingUserMetadata },
      };
      const updateResult = await RecordsService.updateMeta(
        { id: 'brand-1' },
        'record-123',
        updateInput,
        { username: 'user-1' },
        false,
        false,
        {},
        { metadata: { title: 'Updated', ...internalLookingUserMetadata }, mode: 'replace' },
        createRecordSaveContext({ routeFamily: 'api', operation: 'update' })
      );

      expect(updateResult.outcome).to.equal('saved');
      expect(updateResult.schemaOutcome).to.equal(undefined);
      const updateCandidate: unknown = mockStorageService.updateMeta.firstCall.args[2];
      assertUnknownRecord(updateCandidate);
      const updatedMetadata: unknown = updateCandidate.metadata;
      const updatedMetaMetadata: unknown = updateCandidate.metaMetadata;
      assertUnknownRecord(updatedMetadata);
      assertUnknownRecord(updatedMetaMetadata);
      expect(updatedMetadata).to.deep.include(internalLookingUserMetadata);
      expect(updatedMetaMetadata).to.deep.include(internalLookingUserMetadata);
      expect(updateInput.metadata.schemaOutcome).to.deep.equal(internalLookingUserMetadata.schemaOutcome);
    });

    it('maps every authoritative failure class to stable safe response problems', async function () {
      const { RECORD_VALIDATION_DIAGNOSTIC_CODES } = require('../../src/services/RecordValidationService');
      const cases = [
        {
          name: 'blocking validator',
          result: blockingResult({
            blockingErrors: [
              {
                message: 'raw secret validator value',
                field: 'title',
                class: 'RequiredValidator',
                lineagePaths: { dataModel: ['title'] },
              },
            ],
          }),
          kind: 'validation',
          code: 'record-validation-failed',
        },
        {
          name: 'form resolution',
          result: {
            status: 'unresolved',
            shouldBlock: true,
            mode: 'enforce',
            diagnostics: [
              {
                code: RECORD_VALIDATION_DIAGNOSTIC_CODES.formNotFound,
                severity: 'error',
                message: 'secret form detail',
              },
            ],
          },
          kind: 'system',
          code: 'record-validation-form-resolution-failed',
        },
        {
          name: 'expression/configuration',
          result: {
            status: 'unresolved',
            shouldBlock: true,
            mode: 'enforce',
            diagnostics: [
              {
                code: RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionEvaluationFailed,
                severity: 'error',
                message: 'secret expression detail',
              },
            ],
          },
          kind: 'system',
          code: 'record-validation-configuration-failed',
        },
        {
          name: 'configuration takes precedence over simultaneous field failures',
          result: blockingResult({
            diagnostics: [
              {
                code: RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionResultMalformed,
                severity: 'error',
                message: 'secret malformed result',
              },
            ],
          }),
          kind: 'system',
          code: 'record-validation-configuration-failed',
        },
        {
          name: 'timeout',
          result: {
            status: 'unresolved',
            shouldBlock: true,
            mode: 'enforce',
            diagnostics: [
              {
                code: RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout,
                severity: 'error',
                message: 'secret timeout detail',
              },
            ],
          },
          kind: 'system',
          code: 'record-validation-timeout',
        },
        {
          name: 'operation authorization',
          result: {
            status: 'unresolved',
            shouldBlock: true,
            mode: 'shadow',
            diagnostics: [
              {
                code: RECORD_VALIDATION_DIAGNOSTIC_CODES.operationRoleUnauthorized,
                severity: 'error',
                message: 'secret role detail',
              },
            ],
          },
          kind: 'authorization',
          code: 'record-validation-operation-unauthorized',
        },
        {
          name: 'operation syntax',
          result: {
            status: 'unresolved',
            shouldBlock: true,
            mode: 'shadow',
            diagnostics: [
              {
                code: RECORD_VALIDATION_DIAGNOSTIC_CODES.operationUnknown,
                severity: 'error',
                message: 'secret operation detail',
              },
            ],
          },
          kind: 'validation',
          code: 'record-validation-operation-invalid',
        },
      ];

      for (const testCase of cases) {
        mockStorageService.create.resetHistory();
        (global as any).RecordValidationService.resolve.resolves(testCase.result);
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'private payload' } },
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'user-1' }
        );
        expect(result.outcome, testCase.name).to.equal('not-saved');
        expect(result.problems[0].kind, testCase.name).to.equal(testCase.kind);
        expect(result.problems[0].phase, testCase.name).to.equal('pre-save');
        expect(result.problems[0].issues[0].code, testCase.name).to.equal(testCase.code);
        expect(JSON.stringify(result), testCase.name).not.to.include('secret');
        expect(JSON.stringify(result), testCase.name).not.to.include('private payload');
        expect(mockStorageService.create.notCalled, testCase.name).to.equal(true);
        (global as any).RecordValidationService.resolve.reset();
      }
    });

    it('keeps unexpected validation failures response-neutral in shadow and fails closed in enforce', async function () {
      const failures = [
        () => (global as any).RecordValidationService.resolve.throws(new Error('secret synchronous failure')),
        () =>
          (global as any).RecordValidationService.resolve.callsFake(() =>
            Promise.reject(new Error('secret rejected validation failure'))
          ),
        () =>
          (global as any).RecordValidationService.resolve.callsFake(() => Promise.reject('secret string rejection')),
        () =>
          (global as any).RecordValidationService.resolve.callsFake(() =>
            Promise.reject({ secret: 'secret object rejection' })
          ),
      ];
      for (const configureFailure of failures) {
        configureFailure();
        mockSails.config.recordValidation = { mode: 'shadow' };
        const shadowResult = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'private payload' } },
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'user-1' }
        );
        expect(shadowResult.outcome).to.equal('saved');
        expect(shadowResult.problems).to.deep.equal([]);

        mockSails.config.recordValidation = { mode: 'enforce' };
        mockStorageService.create.resetHistory();
        const enforceResult = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'private payload' } },
          { name: 'rdmp', hooks: {}, searchable: false },
          { username: 'user-1' }
        );
        expect(enforceResult.outcome).to.equal('not-saved');
        expect(enforceResult.problems[0].issues[0].code).to.equal('record-validation-configuration-failed');
        expect(JSON.stringify(enforceResult)).not.to.include('secret');
        expect(mockStorageService.create.notCalled).to.equal(true);
        (global as any).RecordValidationService.resolve.reset();
      }
      expect(JSON.stringify(mockSails.log.error.args)).not.to.match(/secret|private payload/);
      expect(JSON.stringify(mockSails.log.warn.args)).not.to.match(/secret|private payload/);
      await new Promise(resolveImmediate => setImmediate(resolveImmediate));
    });

    it('handles an unavailable validation service by the effective shadow/enforce rollout mode', async function () {
      delete (global as any).RecordValidationService;
      delete mockSails.services.recordvalidationservice;

      mockSails.config.recordValidation = { mode: 'shadow' };
      const shadowResult = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Shadow write' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );
      expect(shadowResult.outcome).to.equal('saved');
      expect(shadowResult.problems).to.deep.equal([]);

      mockSails.config.recordValidation = { mode: 'enforce' };
      mockStorageService.create.resetHistory();
      const enforceResult = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Enforce write' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );
      expect(enforceResult.outcome).to.equal('not-saved');
      expect(enforceResult.problems[0]).to.deep.include({ kind: 'system', phase: 'pre-save' });
      expect(enforceResult.problems[0].issues[0].code).to.equal('record-validation-configuration-failed');
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('uses a validation service that becomes available after RecordsService initialization', async function () {
      delete (global as any).RecordValidationService;
      delete mockSails.services.recordvalidationservice;
      mockSails.config.recordValidation = { mode: 'shadow' };

      const beforeRegistration = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Before registration' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );
      expect(beforeRegistration.outcome).to.equal('saved');

      const lateService = { resolve: sinon.stub().resolves(blockingResult()) };
      mockSails.services.recordvalidationservice = lateService;
      mockStorageService.create.resetHistory();
      const afterRegistration = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'After registration' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );

      expect(afterRegistration.outcome).to.equal('not-saved');
      expect(lateService.resolve.calledOnce).to.equal(true);
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('uses record-type and operation rollout overrides when validation resolution is unavailable', async function () {
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      delete (global as any).RecordValidationService;
      delete mockSails.services.recordvalidationservice;
      mockSails.config.recordValidation = {
        mode: 'shadow',
        operations: { publish: { mode: 'enforce' } },
      };

      const operationOverride = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Operation override' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' },
        true,
        true,
        undefined,
        createRecordSaveContext({ validationOperation: 'publish' })
      );
      expect(operationOverride.outcome).to.equal('not-saved');

      mockStorageService.create.resetHistory();
      mockSails.config.recordValidation = { mode: 'shadow' };
      const recordTypeOverride = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Record type override' } },
        { name: 'rdmp', hooks: {}, searchable: false, recordValidation: { mode: 'enforce' } },
        { username: 'user-1' }
      );
      expect(recordTypeOverride.outcome).to.equal('not-saved');
      expect(mockStorageService.create.notCalled).to.equal(true);
    });

    it('keeps append/remove structural validation active while authorizing the initiating actor', async function () {
      enableRecordSchema();
      enableInternalRecordMutationStorage();
      mockSails.config.recordValidation = { mode: 'enforce' };
      (global as any).RecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));
      const resolveUpdate = sinon.stub().callsFake(async (request: any) => {
        expect(request.caller.user).to.deep.include({ username: 'owner' });
        return updateSchemaResolution('enforce');
      });
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      const user = { username: 'owner', roles: [{ id: 'role-researcher', name: 'Researcher' }] };

      const appendStored = {
        ...baseRecord(),
        revision: 1,
        authorization: { edit: ['owner'], view: [], editRoles: [], viewRoles: [] },
      };
      mockStorageService.getMeta.resolves(appendStored);
      const appendResult = await RecordsService.appendToRecord(
        'record-123',
        'record-456',
        'metadata.relatedRecords',
        'array',
        structuredClone(appendStored),
        user
      );
      expect(appendResult.wasPersisted()).to.equal(true);
      expect(validateResolvedArtifact.firstCall.args[0].input).to.deep.equal({ relatedRecords: ['record-456'] });

      resolveUpdate.resetHistory();
      validateResolvedArtifact.resetHistory();
      mockStorageService.updateMeta.resetHistory();
      const removeStored = {
        ...baseRecord(),
        revision: 1,
        metadata: { title: 'Original', relatedRecords: ['record-456', 'record-789'] },
        authorization: { edit: ['owner'], view: [], editRoles: [], viewRoles: [] },
      };
      mockStorageService.getMeta.reset();
      mockStorageService.getMeta.resolves(removeStored);
      const removeResult = await RecordsService.removeFromRecord(
        'record-123',
        'record-456',
        'metadata.relatedRecords',
        structuredClone(removeStored),
        user
      );
      expect(removeResult.wasPersisted()).to.equal(true);
      expect(resolveUpdate.calledOnce).to.equal(true);
      expect(validateResolvedArtifact.firstCall.args[0].input).to.deep.equal({ relatedRecords: ['record-789'] });
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
    });

    it('detaches append/remove candidates, exposes scalar deletions, and retries without duplicate mutation', async function () {
      enableRecordSchema();
      enableInternalRecordMutationStorage();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const actor = { username: 'owner', roles: [{ id: 'role-researcher', name: 'Researcher' }] };
      const stored = {
        ...baseRecord(),
        revision: 1,
        metadata: { title: 'Original', relatedRecords: ['record-456'] },
        authorization: { edit: ['owner'], view: [], editRoles: [], viewRoles: [] },
      };
      const appendCaller = structuredClone(stored);
      const removeCaller = structuredClone(stored);
      mockStorageService.getMeta.resolves(stored);
      mockRecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));
      const resolveUpdate = sinon.stub().callsFake(async (request: any) => {
        expect(request.caller.user).to.deep.include(actor);
        return updateSchemaResolution('enforce');
      });
      const validateResolvedArtifact = sinon.stub();
      validateResolvedArtifact.onFirstCall().returns({
        kind: 'validated',
        valid: false,
        issues: [{ code: 'record-schema.type', pointer: '/relatedRecords' }],
        truncated: false,
      });
      validateResolvedArtifact.onSecondCall().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      validateResolvedArtifact.onThirdCall().returns({
        kind: 'validated',
        valid: false,
        issues: [{ code: 'record-schema.type', pointer: '/title' }],
        truncated: false,
      });
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };

      const rejectedAppend = await RecordsService.appendToRecord(
        'record-123',
        'record-789',
        'metadata.relatedRecords',
        'array',
        appendCaller,
        actor
      );
      expect(rejectedAppend.outcome).to.equal('not-saved');
      expect(appendCaller).to.deep.equal(stored);
      expect(validateResolvedArtifact.calledOnce, JSON.stringify(rejectedAppend)).to.equal(true);
      expect(validateResolvedArtifact.firstCall.args[0].input).to.deep.equal({
        relatedRecords: ['record-456', 'record-789'],
      });

      const retriedAppend = await RecordsService.appendToRecord(
        'record-123',
        'record-789',
        'metadata.relatedRecords',
        'array',
        appendCaller,
        actor
      );
      expect(retriedAppend.wasPersisted()).to.equal(true);
      expect(appendCaller).to.deep.equal(stored);
      expect(mockStorageService.updateMeta.firstCall.args[2].metadata.relatedRecords).to.deep.equal([
        'record-456',
        'record-789',
      ]);

      const rejectedRemove = await RecordsService.removeFromRecord(
        'record-123',
        'Original',
        'metadata.title',
        removeCaller,
        actor
      );
      expect(rejectedRemove.outcome).to.equal('not-saved');
      expect(removeCaller).to.deep.equal(stored);
      expect(validateResolvedArtifact.thirdCall.args[0].input).to.deep.equal({ title: null });
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
      expect(resolveUpdate.callCount).to.equal(3);
    });

    it('resolves a brandless internal write against the stored non-default brand schema', async function () {
      enableRecordSchema();
      enableInternalRecordMutationStorage();
      mockSails.config.recordValidation = { mode: 'enforce' };
      const brand = { id: 'brand-2', name: 'faculty' };
      const stored = {
        ...baseRecord(),
        revision: 1,
        metaMetadata: { ...baseRecord().metaMetadata, brandId: 'brand-2' },
      };
      const candidate = structuredClone(stored);
      candidate.metadata.title = 'DOI writeback';
      (global as any).BrandingService.getBrandById.withArgs('brand-2').returns(brand);
      mockStorageService.getMeta.resolves(stored);
      const resolveUpdate = sinon.stub().resolves(updateSchemaResolution('enforce'));
      const validateResolvedArtifact = sinon.stub().returns({
        kind: 'validated',
        valid: true,
        issues: [],
        truncated: false,
      });
      mockSails.services.recordschemaservice = { resolveUpdate, validateResolvedArtifact };
      mockRecordValidationService.resolve.resolves(allowResult({ mode: 'enforce' }));

      const result = await RecordsService.updateMetaInternal({
        actor: { kind: 'service', id: 'test.non-default-brand-writeback' },
        authorization: { kind: 'service' },
        mutationClass: 'full-record',
        oid: 'record-123',
        record: candidate,
        user: { username: 'owner' },
        metadata: { title: 'DOI writeback' },
        metadataMode: 'pre-applied',
      });

      expect(result.wasPersisted()).to.equal(true);
      expect(resolveUpdate.firstCall.args[0]).to.include({ brand: 'brand-2' });
      expect(resolveUpdate.firstCall.args[0].caller.brand).to.equal(brand);
      expect(mockStorageService.updateMeta.firstCall.args[0]).to.equal(brand);
    });

    it('resolves authoritative brand and fails closed for append/remove when validation is unavailable', async function () {
      mockSails.config.recordValidation = { mode: 'shadow' };
      mockStorageService.getCapabilities = sinon.stub().returns({
        recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
      });
      (global as any).RecordTypesService.get.returns(
        of({ name: 'rdmp', hooks: {}, searchable: false, recordValidation: { mode: 'enforce' } })
      );
      delete (global as any).RecordValidationService;
      delete mockSails.services.recordvalidationservice;

      const appendStored = { ...baseRecord(), revision: 1 };
      mockStorageService.getMeta.resolves(appendStored);
      const appendResult = await RecordsService.appendToRecord(
        'record-123',
        'record-456',
        'metadata.relatedRecords',
        'array',
        structuredClone(appendStored)
      );

      expect(appendResult.outcome).to.equal('not-saved');
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect((global as any).BrandingService.getBrandById.calledWith('brand-1')).to.equal(true);
      expect((global as any).RecordTypesService.get.calledWithMatch({ id: 'brand-1' }, 'rdmp')).to.equal(true);
      expect((global as any).RecordTypesService.get.firstCall.args[0]).to.deep.include({ id: 'brand-1' });

      const rejectingService = { resolve: sinon.stub().rejects(new Error('validation unavailable')) };
      mockSails.services.recordvalidationservice = rejectingService;
      mockStorageService.updateMeta.resetHistory();
      const removeStored = {
        ...baseRecord(),
        revision: 1,
        metadata: { title: 'Original', relatedRecords: ['record-456', 'record-789'] },
      };
      mockStorageService.getMeta.reset();
      mockStorageService.getMeta.resolves(removeStored);
      const removeResult = await RecordsService.removeFromRecord(
        'record-123',
        'record-456',
        'metadata.relatedRecords',
        structuredClone(removeStored)
      );

      expect(removeResult.outcome).to.equal('not-saved');
      expect(rejectingService.resolve.calledOnce).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });
  });

  describe('Effect hook lifecycle integration', function () {
    function recordTypeWithHooks(hooks: any): any {
      return { name: 'rdmp', searchable: false, hooks };
    }

    let committedEffectRecord: any;
    const commitEffectRecord = (oid: string, candidate: any) => {
      committedEffectRecord = { ...structuredClone(candidate), redboxOid: oid };
    };

    beforeEach(function () {
      committedEffectRecord = {
        redboxOid: 'record-123',
        metadata: { title: 'Test' },
        metaMetadata: { type: 'rdmp', form: 'default-form', brandId: 'brand-1' },
        workflow: { stage: 'draft' },
        authorization: { edit: ['user-1'], view: [], editRoles: [], viewRoles: [] },
      };
      mockStorageService.getMeta.callsFake(async () => structuredClone(committedEffectRecord));
      mockStorageService.create.callsFake(async (_brand: unknown, candidate: any) => {
        const oid = String(candidate.redboxOid);
        commitEffectRecord(oid, candidate);
        return { success: true, oid, applicationState: 'applied' };
      });
      mockStorageService.updateMeta.callsFake(async (_brand: unknown, oid: string, candidate: any) => {
        commitEffectRecord(oid, candidate);
        return { success: true, oid, applicationState: 'applied' };
      });
    });

    it('preserves create ordering and keeps execution metadata out of the business record', async function () {
      const order: string[] = [];
      (globalThis as any).__effectHookOrder = order;
      mockStorageService.create.callsFake(async (_brand: unknown, candidate: any) => {
        order.push('persistence');
        const oid = String(candidate.redboxOid);
        commitEffectRecord(oid, candidate);
        return { success: true, oid, applicationState: 'applied' };
      });
      mockStorageService.updateMeta.callsFake(async (_brand: unknown, oid: string, candidate: any) => {
        order.push('postSync-persistence');
        commitEffectRecord(oid, candidate);
        return { success: true, oid, applicationState: 'applied' };
      });
      const recordType = recordTypeWithHooks({
        onCreate: {
          pre: [{ function: '(_oid, record) => { globalThis.__effectHookOrder.push("pre"); return record; }' }],
          postSync: [
            { function: '(_oid, record) => { globalThis.__effectHookOrder.push("postSync"); return record; }' },
          ],
          post: [{ function: '() => { globalThis.__effectHookOrder.push("post"); }' }],
        },
      });

      try {
        const result = await RecordsService.create({ id: 'brand-1' }, { metadata: { title: 'Created' } }, recordType, {
          username: 'user-1',
        });
        await new Promise(resolve => setImmediate(resolve));

        expect(result.wasPersisted()).to.equal(true);
        expect(order).to.deep.equal(['pre', 'persistence', 'postSync', 'postSync-persistence', 'post']);
        const storedRecord = mockStorageService.create.firstCall.args[1];
        expect(storedRecord).not.to.have.property('executionSummary');
        expect(JSON.stringify(storedRecord)).not.to.include('executionId');
        expect(Object.keys(result)).not.to.include('executionSummary');

        const auditSummary = mockQueueService.now
          .getCalls()
          .map((call: any) => call.args[1]?.executionSummary)
          .find((candidate: any) => candidate !== undefined);
        expect(auditSummary.completedThrough).to.equal('post-dispatch');
        expect(auditSummary.partial).to.equal(false);
        expect(auditSummary.counts.dispatched).to.equal(undefined);
        expect(
          auditSummary.actions.some((action: any) => action.phase === 'post' && action.status === 'succeeded')
        ).to.equal(true);
      } finally {
        delete (globalThis as any).__effectHookOrder;
      }
    });

    it('does not persist after a pre-hook failure', async function () {
      mockStorageService.create.resetHistory();
      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Rejected' } },
        recordTypeWithHooks({
          onCreate: { pre: [{ function: '() => { throw new Error("secret pre failure"); }' }] },
        }),
        { username: 'user-1' }
      );

      expect(mockStorageService.create.notCalled).to.equal(true);
      expect(result.wasPersisted()).to.equal(false);
      expect(result.outcome).to.equal('not-saved');
      expect(JSON.stringify(result)).not.to.include('secret pre failure');
    });

    it('keeps a postSync failure persisted with warnings and queues its summary', async function () {
      mockStorageService.create.resetHistory();
      mockQueueService.now.resetHistory();
      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Warning' } },
        recordTypeWithHooks({
          onCreate: { postSync: [{ function: '() => null' }] },
        }),
        { username: 'user-1' }
      );
      await Promise.resolve();

      expect(mockStorageService.create.calledOnce).to.equal(true);
      expect(result.wasPersisted()).to.equal(true);
      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.problems[0].phase).to.equal('post-save');
      expect(mockQueueService.now.calledOnce).to.equal(true);
      const summary = mockQueueService.now.firstCall.args[1].executionSummary;
      expect(summary.completedThrough).to.equal('postSync');
      expect(summary.partial).to.equal(false);
      expect(summary.actions[0].status).to.equal('failed');
    });

    it('recovers a transient pre-hook retry without a user-facing warning', async function () {
      mockStorageService.create.resetHistory();
      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Retry' } },
        recordTypeWithHooks({
          onCreate: {
            pre: [
              {
                function: `(() => {
                globalThis.__effectRetryAttempts = 0;
                return (_oid, record) => {
                  globalThis.__effectRetryAttempts += 1;
                  if (globalThis.__effectRetryAttempts === 1) {
                    throw Object.assign(new Error('transient secret'), { _tag: 'ActionTransientFailure', code: 'temporary' });
                  }
                  return record;
                };
              })()`,
                execution: {
                  retry: { maxAttempts: 2, retryOn: ['transient'], idempotent: true },
                },
              },
            ],
          },
        }),
        { username: 'user-1' }
      );

      try {
        expect((globalThis as any).__effectRetryAttempts).to.equal(2);
        expect(mockStorageService.create.calledOnce).to.equal(true);
        expect(result.outcome).to.equal('saved');
        expect(result.problems).to.deep.equal([]);
      } finally {
        delete (globalThis as any).__effectRetryAttempts;
      }
    });

    it('maps pre and postSync timeouts to their existing save boundaries', async function () {
      mockStorageService.create.resetHistory();
      const preResult = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Pre timeout' } },
        recordTypeWithHooks({
          onCreate: { pre: [{ function: '() => new Promise(() => undefined)', execution: { timeoutMs: 10 } }] },
        }),
        { username: 'user-1' }
      );
      expect(preResult.wasPersisted()).to.equal(false);
      expect(mockStorageService.create.notCalled).to.equal(true);

      const postResult = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Post timeout' } },
        recordTypeWithHooks({
          onCreate: { postSync: [{ function: '() => new Promise(() => undefined)', execution: { timeoutMs: 10 } }] },
        }),
        { username: 'user-1' }
      );
      expect(postResult.wasPersisted()).to.equal(true);
      expect(postResult.outcome).to.equal('saved-with-warnings');
    });

    it('does not alter a successful response when a detached hook fails afterward', async function () {
      mockSails.log.error.resetHistory();
      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Detached' } },
        recordTypeWithHooks({
          onCreate: { post: [{ function: '() => { throw new Error("detached secret"); }' }] },
        }),
        { username: 'user-1' }
      );
      await new Promise(resolve => setImmediate(resolve));

      expect(result.outcome).to.equal('saved');
      expect(result.problems).to.deep.equal([]);
      expect(mockSails.log.error.calledWithMatch('record_hook_detached_action_failed')).to.equal(true);
      expect(JSON.stringify(mockSails.log.error.args)).not.to.include('detached secret');
    });

    it('queues the terminal detached outcome instead of a dispatch-only audit result', async function () {
      mockQueueService.now.resetHistory();
      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Detached audit' } },
        recordTypeWithHooks({
          onCreate: { post: [{ function: '() => { throw new Error("detached audit secret"); }' }] },
        }),
        { username: 'user-1' }
      );
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      expect(result.outcome).to.equal('saved');
      const summary = mockQueueService.now.firstCall.args[1].executionSummary;
      expect(summary.completedThrough).to.equal('post-dispatch');
      expect(summary.counts.dispatched).to.equal(undefined);
      expect(summary.counts.failed).to.equal(1);
      expect(summary.actions[0].status).to.equal('failed');
      expect(summary.actions[0].durationMs).to.be.at.least(0);
    });

    it('finalizes a detached audit after a bounded grace period and does so exactly once', async function () {
      const clock = sinon.useFakeTimers();
      mockQueueService.now.resetHistory();
      mockSails.log.info.resetHistory();
      (globalThis as any).__resolvePendingDetached = undefined;
      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Pending detached audit' } },
          recordTypeWithHooks({
            onCreate: {
              post: [
                { function: '() => undefined' },
                {
                  function: '() => new Promise(resolve => { globalThis.__resolvePendingDetached = resolve; })',
                },
              ],
            },
          }),
          { username: 'user-1' }
        );
        await Promise.resolve();

        // The response and indexing path do not wait for the detached grace
        // period, and the unresolved Promise has not prevented submission yet.
        expect(result.outcome).to.equal('saved');
        expect(mockQueueService.now.notCalled).to.equal(true);

        await clock.tickAsync(1000);
        await Promise.resolve();
        await Promise.resolve();

        expect(mockQueueService.now.calledOnce).to.equal(true);
        const summary = mockQueueService.now.firstCall.args[1].executionSummary;
        expect(summary.partial).to.equal(true);
        expect(summary.detachedFinalization).to.equal('grace-expired');
        expect(summary.detachedPending).to.equal(1);
        expect(summary.totalActions).to.equal(2);
        expect(summary.counts.succeeded).to.equal(1);
        expect(summary.counts.dispatched).to.equal(1);
        expect(summary.actions.map((action: any) => action.status)).to.deep.equal(['succeeded', 'dispatched']);

        const completedEvents = mockSails.log.info
          .getCalls()
          .filter((call: any) => String(call.args[0]).includes('record_hook_operation_completed'));
        const dispatchedEvents = mockSails.log.info
          .getCalls()
          .filter((call: any) => String(call.args[0]).includes('record_hook_operation_dispatched'));
        expect(dispatchedEvents).to.have.length(1);
        expect(completedEvents).to.have.length(1);

        // A terminal result arriving after finalization remains observable at
        // action level but cannot enqueue a second audit document.
        (globalThis as any).__resolvePendingDetached?.();
        await Promise.resolve();
        await Promise.resolve();
        expect(mockQueueService.now.calledOnce).to.equal(true);
        expect(completedEvents).to.have.length(1);
      } finally {
        delete (globalThis as any).__resolvePendingDetached;
        clock.restore();
      }
    });

    it('does not let malformed detached post configuration block persistence', async function () {
      const calls: string[] = [];
      (globalThis as any).__effectDetachedCompatibility = calls;
      try {
        const result = await RecordsService.create(
          { id: 'brand-1' },
          { metadata: { title: 'Malformed detached hook' } },
          recordTypeWithHooks({
            onCreate: {
              post: [
                { function: '({ invalid: true })' },
                { function: '() => { globalThis.__effectDetachedCompatibility.push("valid"); }' },
              ],
            },
          }),
          { username: 'user-1' }
        );
        await new Promise(resolve => setImmediate(resolve));

        expect(result.wasPersisted()).to.equal(true);
        expect(result.outcome).to.equal('saved');
        expect(calls).to.deep.equal(['valid']);
      } finally {
        delete (globalThis as any).__effectDetachedCompatibility;
      }
    });

    it('preserves the trigger-flag asymmetry: disabled pre hooks do not disable post hooks', async function () {
      const calls: string[] = [];
      (globalThis as any).__effectFlagCalls = calls;
      const recordType = recordTypeWithHooks({
        onUpdate: {
          pre: [{ function: '(_oid, record) => { globalThis.__effectFlagCalls.push("pre"); return record; }' }],
          post: [{ function: '() => { globalThis.__effectFlagCalls.push("post"); }' }],
        },
      });
      (globalThis as any).RecordTypesService.get.returns(of(recordType));
      try {
        const result = await RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          { metaMetadata: { type: 'rdmp', brandId: 'brand-1', form: 'default-form' }, metadata: {} },
          { username: 'user-1' },
          false,
          true
        );
        await new Promise(resolve => setImmediate(resolve));
        expect(result.wasPersisted()).to.equal(true);
        expect(calls).to.deep.equal(['post']);
      } finally {
        delete (globalThis as any).__effectFlagCalls;
      }
    });

    it('passes execution summaries through the existing audit queue payload', async function () {
      mockQueueService.now.resetHistory();
      const summary = {
        schemaVersion: 1,
        executionId: 'execution-1',
        trigger: 'record-hook' as const,
        operation: 'update' as const,
        partial: false,
        durationMs: 3,
        totalActions: 1,
        counts: { succeeded: 1 },
        actions: [],
        truncated: false,
      };
      await RecordsService.auditRecord(
        'record-123',
        { metadata: { title: 'Audit' } },
        { username: 'user-1' },
        'updated',
        summary
      );

      expect(mockQueueService.now.firstCall.args[1].executionSummary).to.deep.equal(summary);
      expect(mockQueueService.now.firstCall.args[1].record).not.to.have.property('executionSummary');
    });

    it('lets a custom RecordsService subclass inherit the core hook coordinator', async function () {
      const CoreRecords = RecordsService.constructor as any;
      class ExtendedRecords extends CoreRecords {
        public extensionMarker = true;
      }
      const extended = new ExtendedRecords();
      const recordType = recordTypeWithHooks({
        onCreate: { pre: [{ function: '(_oid, record) => ({ ...record, extended: true })' }] },
      });
      const result = await extended.triggerPreSaveTriggers('record-123', {}, recordType, 'onCreate', {});

      expect(extended.extensionMarker).to.equal(true);
      expect(result).to.deep.equal({ extended: true });
    });
  });

  describe('delete hook audit boundary', function () {
    beforeEach(function () {
      enableLifecycleStorage();
    });

    it('threads a postSync replacement to detached hooks without mutating the caller-owned record', async function () {
      const callerRecord = { metadata: { title: 'Original' } };
      const callerSnapshot = structuredClone(callerRecord);
      (globalThis as any).__deletePostRecord = undefined;
      const recordType = {
        name: 'rdmp',
        searchable: false,
        hooks: {
          onDelete: {
            postSync: [{ function: '(_oid, record) => ({ ...record, hookReplacement: true })' }],
            post: [
              {
                function:
                  '(_oid, record) => { globalThis.__deletePostRecord = structuredClone(record); return undefined; }',
              },
            ],
          },
        },
      };
      (globalThis as any).RecordTypesService.get.returns(of(recordType));

      try {
        const result = await RecordsService.delete('record-123', false, callerRecord, recordType, {
          username: 'user-1',
        });
        await new Promise(resolve => setImmediate(resolve));

        expect(result.success).to.equal(true);
        expect(callerRecord).to.deep.equal(callerSnapshot);
        expect((globalThis as any).__deletePostRecord).to.deep.include({ hookReplacement: true });
      } finally {
        delete (globalThis as any).__deletePostRecord;
      }
    });

    it('writes a partial audit before detached post work starts', async function () {
      mockQueueService.now.resetHistory();
      const recordType = {
        name: 'rdmp',
        searchable: false,
        hooks: {
          onDelete: {
            pre: [{ function: '(_oid, record) => record' }],
            post: [{ function: '() => undefined' }],
          },
        },
      };
      const result = await RecordsService.delete('record-123', false, { metadata: {} }, recordType, {
        username: 'user-1',
      });
      await new Promise(resolve => setImmediate(resolve));

      expect(result.success).to.equal(true);
      const summary = mockQueueService.now.firstCall.args[1].executionSummary;
      expect(summary.partial).to.equal(true);
      expect(summary.completedThrough).to.equal('persistence');
      expect(summary.actions.every((action: any) => action.phase !== 'post')).to.equal(true);
    });
  });

  describe('finishSave operational handoff', function () {
    function persistedTracker() {
      const { RecordSaveTracker, createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const tracker = new RecordSaveTracker(createRecordSaveContext());
      tracker.confirmPrimaryPersistence('tracker-oid', { message: '@record-save-post-save-failed' });
      return tracker;
    }

    it('returns a deeply detached save response for nested adapter and hook data', function () {
      const { RecordSaveTracker, createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const tracker = new RecordSaveTracker(createRecordSaveContext());
      tracker.confirmPrimaryPersistence('tracker-oid', {
        success: true,
        data: { nested: { value: 'data' } },
        metadata: { nested: { value: 'metadata' } },
        items: [{ nested: { value: 'item' } }],
      });
      tracker.mergeLegacyHookFields({ workspaceData: { nested: { value: 'workspace' } } });

      const response = tracker.toResponse();
      (response.data as any).nested.value = 'changed';
      (response.metadata as any).nested.value = 'changed';
      (response.items[0] as any).nested.value = 'changed';
      (response.workspaceData as any).nested.value = 'changed';

      expect((tracker.result.data as any).nested.value).to.equal('data');
      expect((tracker.result.metadata as any).nested.value).to.equal('metadata');
      expect((tracker.result.items[0] as any).nested.value).to.equal('item');
      expect((tracker.result.workspaceData as any).nested.value).to.equal('workspace');
    });

    it('returns saved-with-warnings and retains committed concurrency when final reconciliation reload fails', async function () {
      mockStorageService.getMeta.rejects(new Error('snapshot unavailable'));
      const audit = sinon.stub(RecordsService, 'auditRecord');
      const tracker = persistedTracker();
      tracker.setProjectedMetadata({ stale: true });
      tracker.result.data = { stale: true };
      tracker.result.details = { stale: true };
      tracker.result.totalItems = 1;
      tracker.result.items = [{ stale: true }];
      tracker.mergeLegacyHookFields({
        workspaceOid: 'stale-workspace',
        workspaceData: { stale: true },
      });
      tracker.setConcurrencyMetadata({
        mode: 'strict',
        revision: 8,
        currentRevision: 8,
        entityTag: formatRecordEntityTag('tracker-oid', 8),
      });

      const result = await (RecordsService as any).finishSave(
        tracker,
        {
          id: 'user-id',
          username: 'user-1',
          password: 'secret-password',
          token: 'secret-token',
          headers: { authorization: 'Bearer secret-token' },
        },
        'updated',
        true
      );

      expect(result.oid).to.equal('tracker-oid');
      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.wasPersisted()).to.equal(true);
      expect(result.isComplete()).to.equal(false);
      expect(result.metadata).to.equal(null);
      expect(result.data).to.equal(undefined);
      expect(result.details).to.equal(undefined);
      expect(result.totalItems).to.equal(0);
      expect(result.items).to.deep.equal([]);
      expect(result.workspaceOid).to.equal(undefined);
      expect(result.workspaceData).to.equal(undefined);
      expect(result.problems[0]).to.deep.include({ kind: 'system', phase: 'response' });
      expect(result.problems[0].issues[0].code).to.equal('record-post-commit-reconciliation-deferred');
      expect(result.concurrency).to.deep.include({
        mode: 'strict',
        revision: 8,
        currentRevision: 8,
        entityTag: formatRecordEntityTag('tracker-oid', 8),
      });
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(audit.notCalled).to.equal(true);
      expect(mockQueueService.now.calledOnce).to.equal(true);
      expect(mockQueueService.now.firstCall.args[0]).to.equal('RecordsService-ReconcilePostCommitSave');
      expect(mockQueueService.now.firstCall.args[1]).to.deep.equal({
        schemaVersion: 1,
        oid: 'tracker-oid',
        searchable: true,
        action: 'updated',
        actor: { id: 'user-id', username: 'user-1' },
        resolution: 'direct',
        committedRevision: 8,
      });
      expect(JSON.stringify(mockQueueService.now.firstCall.args[1])).not.to.contain('secret');
    });

    it('keeps reconciliation explicitly deferred when durable enqueue fails', async function () {
      mockStorageService.getMeta.rejects(new Error('snapshot unavailable'));
      mockQueueService.now.rejects(new Error('private queue failure'));

      const result = await (RecordsService as any).finishSave(persistedTracker(), {}, 'updated', true);

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.metadata).to.equal(null);
      expect(result.data).to.equal(undefined);
      expect(result.problems[0].issues[0].code).to.equal('record-post-commit-reconciliation-deferred');
      const deferredLog = mockSails.log.warn
        .getCalls()
        .find((call: any) => call.args[1]?.event === 'record_post_commit_reconciliation_deferred');
      expect(deferredLog).not.to.equal(undefined);
      expect(deferredLog!.args[1]).to.deep.include({ handoff: 'unknown', error_type: 'Error' });
      expect(JSON.stringify(mockSails.log.warn.args)).not.to.contain('private queue failure');
    });

    it('dispatches save-owned detached hooks only after reload and with the authoritative record', async function () {
      const tracker = persistedTracker();
      const operation = (RecordsService as any).registerSaveHookOperation(
        tracker,
        (RecordsService as any).createHookExecutionOperation('onUpdate', undefined, 'tracker-oid')
      );
      const dispatchPost = sinon.stub();
      sinon.stub(RecordsService as any, 'hookCoordinator').returns({ dispatchPost });
      sinon.stub(RecordsService, 'auditRecord');
      const authoritative = {
        redboxOid: 'tracker-oid',
        revision: 9,
        metadata: { title: 'Authoritative' },
        metaMetadata: { type: 'rdmp' },
      };
      const recordType = { hooks: { onUpdate: { post: [{ function: 'async () => undefined' }] } } };
      const user = { username: 'user-1' };

      RecordsService.triggerPostSaveTriggers(
        'tracker-oid',
        { redboxOid: 'tracker-oid', metadata: { title: 'Stale projection' } },
        recordType,
        'onUpdate',
        user,
        operation
      );
      expect(dispatchPost.notCalled).to.equal(true);
      mockStorageService.getMeta.resolves(authoritative);

      await (RecordsService as any).finishSave(tracker, user, 'updated', false);

      expect(dispatchPost.calledOnceWithExactly('tracker-oid', authoritative, recordType, 'onUpdate', user)).to.equal(
        true
      );
    });

    it('discards save-owned detached hooks when the authoritative reload fails', async function () {
      const tracker = persistedTracker();
      const operation = (RecordsService as any).registerSaveHookOperation(
        tracker,
        (RecordsService as any).createHookExecutionOperation('onUpdate', undefined, 'tracker-oid')
      );
      const dispatchPost = sinon.stub();
      sinon.stub(RecordsService as any, 'hookCoordinator').returns({ dispatchPost });
      RecordsService.triggerPostSaveTriggers(
        'tracker-oid',
        { redboxOid: 'tracker-oid', metadata: { title: 'Untrusted projection' } },
        { hooks: {} },
        'onUpdate',
        {},
        operation
      );
      mockStorageService.getMeta.rejects(new Error('snapshot unavailable'));

      const result = await (RecordsService as any).finishSave(tracker, {}, 'updated', false);

      expect(result.outcome).to.equal('saved-with-warnings');
      expect(dispatchPost.notCalled).to.equal(true);
      expect(mockQueueService.now.calledOnce).to.equal(true);
    });

    for (const [description, reloaded] of [
      ['null', null],
      ['undefined', undefined],
      ['an incomplete object', { metadata: { stale: true } }],
    ] as const) {
      it(`defers reconciliation and clears projections when the committed reload returns ${description}`, async function () {
        mockStorageService.getMeta.resolves(reloaded);
        const audit = sinon.stub(RecordsService, 'auditRecord');
        const tracker = persistedTracker();
        tracker.setProjectedMetadata({ stale: true });
        tracker.result.data = { stale: true };
        tracker.mergeLegacyHookFields({ workspaceData: { stale: true } });

        const result = await (RecordsService as any).finishSave(tracker, {}, 'updated', true);

        expect(result.outcome).to.equal('saved-with-warnings');
        expect(result.metadata).to.equal(null);
        expect(result.data).to.equal(undefined);
        expect(result.workspaceData).to.equal(undefined);
        expect(result.problems[0].issues[0].code).to.equal('record-post-commit-reconciliation-deferred');
        expect(mockQueueService.now.calledOnce).to.equal(true);
        expect(mockSearchService.index.notCalled).to.equal(true);
        expect(audit.notCalled).to.equal(true);
      });
    }

    it('reloads and reconciles indexing and audit from the bounded durable job payload', async function () {
      mockSearchService.index.resolves(true);
      const payload = {
        schemaVersion: 1,
        oid: 'tracker-oid',
        searchable: true,
        action: 'updated',
        actor: {
          id: 'user-id',
          username: 'user-1',
          password: 'must-not-persist',
          arbitrary: 'must-not-persist',
        },
        resolution: 'direct',
        committedRevision: 8,
        record: { metadata: { title: 'must-not-persist' } },
      };
      const authoritative = {
        redboxOid: 'tracker-oid',
        revision: 9,
        metadata: { title: 'Authoritative' },
        metaMetadata: { type: 'rdmp' },
      };
      mockStorageService.getMeta.resolves(authoritative);

      await RecordsService.reconcilePostCommitSave({ attrs: { data: payload } });

      expect(mockSearchService.index.calledOnceWithExactly('tracker-oid', authoritative)).to.equal(true);
      expect(mockStorageService.createRecordAudit.calledOnce).to.equal(true);
      const audit = mockStorageService.createRecordAudit.firstCall.args[0];
      expect(audit.record).to.equal(authoritative);
      expect(audit.user).to.deep.equal({ id: 'user-id', username: 'user-1' });
      expect(audit.concurrency).to.deep.equal({ revision: 9, resolution: 'direct' });
      expect(JSON.stringify(audit.user)).not.to.contain('must-not-persist');
    });

    it('rejects reconciliation when index submission is not acknowledged', async function () {
      mockStorageService.getMeta.resolves({
        redboxOid: 'tracker-oid',
        metadata: { title: 'Authoritative' },
        metaMetadata: { type: 'rdmp' },
      });
      mockSearchService.index.resolves(false);

      let rejection: unknown;
      try {
        await RecordsService.reconcilePostCommitSave({
          attrs: {
            data: {
              schemaVersion: 1,
              oid: 'tracker-oid',
              searchable: true,
              action: 'updated',
              actor: {},
              resolution: 'direct',
            },
          },
        });
      } catch (error) {
        rejection = error;
      }

      expect(rejection).to.be.instanceOf(Error);
      expect(mockStorageService.createRecordAudit.notCalled).to.equal(true);
    });

    it('rejects an unusable reconciliation reload before indexing or auditing', async function () {
      mockStorageService.getMeta.resolves({ redboxOid: 'tracker-oid', metadata: { incomplete: true } });

      let rejection: unknown;
      try {
        await RecordsService.reconcilePostCommitSave({
          attrs: {
            data: {
              schemaVersion: 1,
              oid: 'tracker-oid',
              searchable: true,
              action: 'updated',
              actor: {},
              resolution: 'direct',
            },
          },
        });
      } catch (error) {
        rejection = error;
      }

      expect(rejection).to.be.instanceOf(Error);
      expect((rejection as Error).message).to.equal('Record post-commit reconciliation failed.');
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(mockStorageService.createRecordAudit.notCalled).to.equal(true);
    });

    it('uses the tracker oid and waits for index acceptance before returning', async function () {
      mockStorageService.getMeta.resolves({
        redboxOid: 'tracker-oid',
        metadata: { committed: true },
        metaMetadata: { type: 'rdmp' },
      });
      mockSearchService.index.resolves(true);
      sinon.stub(RecordsService, 'auditRecord').callsFake(() => new Promise(() => undefined));

      const result = await (RecordsService as any).finishSave(persistedTracker(), {}, 'updated', true);
      await Promise.resolve();

      expect(result.oid).to.equal('tracker-oid');
      expect(mockStorageService.getMeta.calledWith('tracker-oid')).to.equal(true);
      expect(
        mockSearchService.index.calledWith('tracker-oid', sinon.match({ metadata: { committed: true } }))
      ).to.equal(true);
    });

    it('reports a persisted save with warnings when index acceptance is false', async function () {
      mockStorageService.getMeta.resolves({
        redboxOid: 'tracker-oid',
        metadata: { committed: true },
        metaMetadata: { type: 'rdmp' },
      });
      mockSearchService.index.resolves(false);
      sinon.stub(RecordsService, 'auditRecord');

      const result = await (RecordsService as any).finishSave(persistedTracker(), {}, 'updated', true);

      expect(result.wasPersisted()).to.equal(true);
      expect(result.outcome).to.equal('saved-with-warnings');
      expect(result.problems.some((problem: any) => problem.issues[0]?.code === 'record-index-failed')).to.equal(true);
    });
  });

  describe('internal record mutations', function () {
    const internalRecord = (revision: number, title = 'baseline') => ({
      redboxOid: 'internal-record-1',
      revision,
      metadata: { title, secret: 'never-project-this' },
      metaMetadata: {
        brandId: 'brand-1',
        type: 'rdmp',
        form: 'default-form',
        attachmentFields: [],
      },
      authorization: {
        edit: ['editor'],
        view: ['editor'],
        editRoles: [],
        viewRoles: [],
        editPending: [],
        viewPending: [],
      },
      workflow: { stage: 'draft' },
    });

    const enableConcurrency = (mode: 'last-write-wins' | 'observe' | 'strict') => {
      mockStorageService.getCapabilities = sinon.stub().returns({
        recordConcurrency: FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
      });
      (global as any).RecordTypesService.get.returns(
        of({ name: 'rdmp', hooks: {}, searchable: true, concurrentModification: { mode } })
      );
    };

    it('fails closed for an untrusted writer identity before loading or writing record state', async function () {
      const result = await RecordsService.updateMetaInternal({
        actor: { kind: 'service', id: '../unsafe writer' },
        authorization: { kind: 'service' },
        mutationClass: 'full-record',
        oid: 'internal-record-1',
        record: internalRecord(1),
      });

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].kind).to.equal('system');
      expect(result.problems[0].issues[0].code).to.equal('internal-record-mutation-contract-invalid');
      expect(mockStorageService.getMeta.notCalled).to.equal(true);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect(JSON.stringify(result)).not.to.include('never-project-this');
    });

    it('reauthorizes record-edit writers against the current record without disclosing or mutating it', async function () {
      enableConcurrency('strict');
      mockStorageService.getMeta.resolves(internalRecord(4));

      const missingUser = await RecordsService.updateMetaInternal({
        actor: { kind: 'service', id: 'FigshareService.transitionWorkflowForRecord' },
        authorization: { kind: 'record-edit' },
        mutationClass: 'full-record',
        oid: 'internal-record-1',
        record: internalRecord(4, 'missing-user-candidate'),
      });
      const result = await RecordsService.updateMetaInternal({
        actor: { kind: 'service', id: 'FigshareService.transitionWorkflowForRecord' },
        authorization: { kind: 'record-edit' },
        mutationClass: 'full-record',
        oid: 'internal-record-1',
        record: internalRecord(4, 'candidate'),
        user: { username: 'intruder', roles: [] },
      });

      expect(missingUser.outcome).to.equal('not-saved');
      expect(missingUser.problems[0].issues[0].code).to.equal('internal-record-mutation-unauthorized');
      expect(JSON.stringify(missingUser)).not.to.include('missing-user-candidate');
      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].kind).to.equal('authorization');
      expect(result.problems[0].issues[0].code).to.equal('internal-record-mutation-unauthorized');
      expect(result.concurrency).to.equal(undefined);
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(mockQueueService.now.notCalled).to.equal(true);
      expect(JSON.stringify(result)).not.to.include('candidate');
    });

    for (const mode of ['last-write-wins', 'observe', 'strict'] as const) {
      it(`enforces the authoritative snapshot revision for an internal ${mode} save`, async function () {
        enableConcurrency(mode);
        let current = internalRecord(7);
        mockStorageService.getMeta.callsFake(async () => _.cloneDeep(current));
        mockStorageService.updateMeta.callsFake(async (_brand, oid, candidate, user, options) => {
          expect(options.precondition).to.deep.equal({ requireRevision: true, expectedRevision: 7 });
          expect(options.resolution).to.equal('internal');
          expect(user.serviceIdentity).to.equal('DoiService.publishDoiTrigger');
          current = { ..._.cloneDeep(candidate), redboxOid: oid, revision: 8 };
          return {
            success: true,
            oid,
            applicationState: 'applied',
            committedRevision: 8,
            committedRecord: _.cloneDeep(current),
          };
        });

        const result = await RecordsService.updateMetaInternal({
          actor: { kind: 'service', id: 'DoiService.publishDoiTrigger' },
          authorization: { kind: 'service' },
          mutationClass: 'external-side-effect',
          oid: 'internal-record-1',
          record: internalRecord(7, 'writeback'),
        });

        expect(result.outcome).to.equal('saved');
        expect(result.requestId).to.equal(mockStorageService.updateMeta.firstCall.args[4].requestId);
        expect(result.concurrency).to.include({ mode, revision: 8, resolution: 'internal' });
        expect(mockSearchService.index.calledWith('internal-record-1', sinon.match({ revision: 8 }))).to.equal(true);
        expect(mockQueueService.now.calledWith('RecordAudit')).to.equal(true);
        expect(mockQueueService.now.lastCall.args[1].concurrency).to.deep.equal({
          revision: 8,
          resolution: 'internal',
        });
      });
    }

    it('surfaces a full-record stale result without replaying hooks, indexing, or audit work', async function () {
      enableConcurrency('strict');
      mockStorageService.getMeta.resolves(internalRecord(3, 'latest'));

      const result = await RecordsService.updateMetaInternal({
        actor: { kind: 'service', id: 'HarvestRunService.updateTrackedRecord' },
        authorization: { kind: 'service' },
        mutationClass: 'full-record',
        oid: 'internal-record-1',
        record: internalRecord(2, 'stale-secret-candidate'),
      });

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].kind).to.equal('conflict');
      expect(result.problems[0].issues[0].code).to.equal('record-revision-stale');
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(mockQueueService.now.notCalled).to.equal(true);
      expect(JSON.stringify(result)).not.to.include('stale-secret-candidate');
    });

    it('does not dispatch post-commit hooks, indexing, or audit when an internal save loses at final CAS', async function () {
      enableConcurrency('observe');
      const hooks = {
        pre: sinon.stub().callsFake((_oid, record) => record),
        post: sinon.stub(),
      };
      (globalThis as any).__w05Hooks = hooks;
      (global as any).RecordTypesService.get.returns(
        of({
          name: 'rdmp',
          searchable: true,
          concurrentModification: { mode: 'observe' },
          hooks: {
            onUpdate: {
              pre: [{ function: 'globalThis.__w05Hooks.pre' }],
              post: [{ function: 'globalThis.__w05Hooks.post' }],
            },
          },
        })
      );
      mockStorageService.getMeta.resolves(internalRecord(1));
      mockStorageService.updateMeta.resolves({
        success: false,
        oid: 'internal-record-1',
        applicationState: 'not-applied',
        nonApplicationReason: 'stale-revision',
      });

      const result = await RecordsService.updateMetaInternal({
        actor: { kind: 'service', id: 'TriggerService.runTemplatesOnRelatedRecord' },
        authorization: { kind: 'service' },
        mutationClass: 'full-record',
        oid: 'internal-record-1',
        record: internalRecord(1, 'candidate'),
      });

      expect(result.outcome).to.equal('not-saved');
      expect(hooks.pre.calledOnce).to.equal(true);
      expect(hooks.post.notCalled).to.equal(true);
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(mockQueueService.now.notCalled).to.equal(true);
      delete (globalThis as any).__w05Hooks;
    });

    it('reloads and recomputes a declared mutation once per bounded retry with fresh request linkage', async function () {
      enableConcurrency('observe');
      let current = internalRecord(1, 'first-baseline');
      const computedFrom: string[] = [];
      const dispatchedRequestIds: string[] = [];
      mockStorageService.getMeta.callsFake(async () => _.cloneDeep(current));
      mockStorageService.updateMeta.callsFake(async (_brand, oid, candidate, _user, options) => {
        dispatchedRequestIds.push(options.requestId);
        if (dispatchedRequestIds.length === 1) {
          current = internalRecord(2, 'second-baseline');
          return {
            success: false,
            oid,
            applicationState: 'not-applied',
            nonApplicationReason: 'stale-revision',
          };
        }
        expect(options.precondition).to.deep.equal({ requireRevision: true, expectedRevision: 2 });
        current = { ..._.cloneDeep(candidate), redboxOid: oid, revision: 3 };
        return {
          success: true,
          oid,
          applicationState: 'applied',
          committedRevision: 3,
          committedRecord: _.cloneDeep(current),
        };
      });

      const result = await RecordsService.mutateMetaInternal({
        actor: { kind: 'service', id: 'RecordsService.appendToRecord' },
        authorization: { kind: 'service' },
        oid: 'internal-record-1',
        triggerPreSaveTriggers: false,
        triggerPostSaveTriggers: false,
        mutate: snapshot => {
          computedFrom.push(String(snapshot.metadata?.title));
          return { ...snapshot, metadata: { ...snapshot.metadata, targeted: computedFrom.length } };
        },
        retry: { idempotent: true, recomputable: true, maxAttempts: 2 },
      });

      expect(result.outcome).to.equal('saved');
      expect(computedFrom).to.deep.equal(['first-baseline', 'second-baseline']);
      expect(dispatchedRequestIds).to.have.length(2);
      expect(dispatchedRequestIds[0]).not.to.equal(dispatchedRequestIds[1]);
      expect(result.concurrency?.resolutionOfRequestId).to.equal(dispatchedRequestIds[0]);
      expect(result.requestId).to.equal(dispatchedRequestIds[1]);
      expect(result.concurrency?.revision).to.equal(3);
    });

    it('never retries an unknown dispatched mutation or persists its candidate in audit', async function () {
      enableConcurrency('last-write-wins');
      mockStorageService.getMeta.resolves(internalRecord(5));
      mockStorageService.updateMeta.resolves({
        success: false,
        oid: 'internal-record-1',
        applicationState: 'unknown',
      });
      const mutate = sinon.stub().callsFake(snapshot => ({
        ...snapshot,
        metadata: { ...snapshot.metadata, secret: 'unknown-candidate-secret' },
      }));

      const result = await RecordsService.mutateMetaInternal({
        actor: { kind: 'service', id: 'RecordsService.updateNotificationLog' },
        authorization: { kind: 'service' },
        oid: 'internal-record-1',
        triggerPreSaveTriggers: false,
        triggerPostSaveTriggers: false,
        mutate,
        retry: { idempotent: true, recomputable: true, maxAttempts: 3 },
      });

      expect(result.outcome).to.equal('unknown');
      expect(mutate.calledOnce).to.equal(true);
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(mockQueueService.now.notCalled).to.equal(true);
      expect(JSON.stringify(result)).not.to.include('unknown-candidate-secret');
    });
  });

  describe('createBatch', function () {
    it('keeps createRecordAudit optional for hook compatibility while audited paths fail closed at runtime', function () {
      type IsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;
      const createRecordAuditIsRequired: IsRequired<StorageService, 'createRecordAudit'> = false;

      expect(createRecordAuditIsRequired).to.equal(false);
    });

    it('durably audits the v1 direct-storage bypass and never reports the batch as validated', async function () {
      const records = [{ title: 'Rec 1' }, { title: 'Rec 2' }];
      const storageResult = { accepted: 2 };
      mockSails.config.record.auditing.enabled = false;
      mockStorageService.createBatch.resolves(storageResult);

      const result = await RecordsService.createBatch('rdmp', records, 'harvestId');

      expect(result).to.equal(storageResult);
      expect(mockStorageService.createBatch.calledWith('rdmp', records, 'harvestId')).to.be.true;
      expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
      expect(mockStorageService.createRecordAudit.calledOnce).to.equal(true);
      const audit = mockStorageService.createRecordAudit.firstCall.args[0];
      expect(audit.action).to.equal('batch-validation-bypassed');
      expect(audit.record.validationBypass).to.deep.include({
        mode: 'direct-storage-v1',
        reason: 'create-batch-v1-direct-storage',
        validationStatus: 'unvalidated',
        argumentContract: 'typed-three-argument',
        recordType: 'rdmp',
        candidateCount: 2,
      });
      expect(JSON.stringify(audit)).not.to.include('Rec 1');
      expect(JSON.stringify(result)).not.to.include('validated');
    });

    it('documents and forwards the legacy records-only argument contract', async function () {
      const records = [{ title: 'Legacy' }];

      await RecordsService.createBatch(records);

      expect(mockStorageService.createBatch.calledOnceWithExactly(records, undefined, undefined)).to.equal(true);
      const audit = mockStorageService.createRecordAudit.firstCall.args[0];
      expect(audit.record.validationBypass).to.deep.include({
        argumentContract: 'legacy-records-only',
        candidateCount: 1,
      });
      expect(audit.record.validationBypass).not.to.have.property('recordType');
    });

    it('fails closed when the direct-batch bypass audit is missing, rejected, or unconfirmed', async function () {
      const failures = [
        () => {
          mockStorageService.createRecordAudit = undefined;
        },
        () => {
          mockStorageService.createRecordAudit.rejects(new Error('audit rejected'));
        },
        () => {
          mockStorageService.createRecordAudit.resolves(undefined);
        },
      ];

      for (const configureFailure of failures) {
        mockStorageService.createBatch.resetHistory();
        if (!mockStorageService.createRecordAudit) {
          mockStorageService.createRecordAudit = sinon.stub();
        } else {
          mockStorageService.createRecordAudit.reset();
        }
        configureFailure();

        let error: unknown;
        try {
          await RecordsService.createBatch('rdmp', [{ title: 'Blocked' }], 'harvestId');
        } catch (caught) {
          error = caught;
        }
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).name).to.equal('RBValidationError');
        expect((error as any).problemKind).to.equal('system');
        expect((error as any).displayErrors).to.deep.equal([
          {
            title: '@record-save-record-validation-batch-bypass-audit-failed',
            code: 'record-validation-batch-bypass-audit-failed',
          },
        ]);
        expect(mockStorageService.createBatch.notCalled).to.equal(true);
      }
    });
  });

  describe('getRelatedRecords', function () {
    it('should call storage service getRelatedRecords', async function () {
      await RecordsService.getRelatedRecords('oid-1', 'relatedTo');

      expect(mockStorageService.getRelatedRecords.calledWith('oid-1', 'relatedTo')).to.be.true;
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const exported = RecordsService.exports();

      expect(exported).to.have.property('create');
      expect(exported).to.have.property('updateMeta');
      expect(exported).to.have.property('updateMetaInternal');
      expect(exported).to.have.property('mutateMetaInternal');
      expect(exported).to.have.property('getMeta');
      expect(exported).to.have.property('getRecordAudit');
      expect(exported).to.have.property('getResolvedPermissionsSummary');
      expect(exported).to.have.property('hasEditAccess');
      expect(exported).to.have.property('hasViewAccess');
      expect(exported).to.have.property('delete');
      expect(exported).to.have.property('getRecords');
      expect(exported).to.have.property('getAttachments');
      expect(exported).to.have.property('bootstrapData');
      expect(exported).to.have.property('appendToRecord');
      expect(exported).to.have.property('removeFromRecord');
      expect(exported).to.have.property('storeRecordAudit');
    });
  });
});
