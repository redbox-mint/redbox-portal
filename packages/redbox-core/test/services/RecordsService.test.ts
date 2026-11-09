let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of, firstValueFrom } from 'rxjs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { StorageServiceResponse } from '../../src/StorageServiceResponse';
import { RecordAuditActionType, RecordAuditModel } from '../../src/model/storage/RecordAuditModel';
import { RecordWriteConflict } from '../../src/RecordWriteOptions';
import { UserModel } from '../../src/model/storage/UserModel';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject, configureModelMethod } from './testHelper';

describe('RecordsService', function () {
  let mockSails: any;
  let RecordsService: any;
  let mockRecord: any;
  let mockStorageService: any;
  let mockSearchService: any;
  let mockQueueService: any;
  let mockDatastreamService: any;

  beforeEach(function () {
    mockStorageService = {
      create: sinon.stub().resolves({ success: true, oid: 'new-record-123', isSuccessful: () => true }),
      updateMeta: sinon.stub().resolves({ success: true, oid: 'record-123', isSuccessful: () => true }),
      getMeta: sinon.stub().resolves({ redboxOid: 'record-123', metadata: { title: 'Test' } }),
      getDeletedRecordMeta: sinon.stub().resolves({ redboxOid: 'deleted-record-123' }),
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
      destroyDeletedRecord: sinon.stub().resolves({})
    };

    mockSearchService = {
      index: sinon.stub(),
      remove: sinon.stub()
    };

    mockQueueService = {
      now: sinon.stub().resolves({ attrs: { name: 'RecordsService-RecoverRecordAudit' } })
    };

    mockDatastreamService = {
      listDatastreams: sinon.stub().resolves([])
    };

    mockSails = createMockSails({
      config: {
        appPath: '/app',
        record: {
          baseUrl: {
            redbox: 'http://localhost:9000'
          },
          api: {
            info: { url: '/info', method: 'GET' },
            search: { url: '/search', method: 'GET' }
          },
          auditing: {
            enabled: true,
            writeAttempts: 1,
            recordAuditJobName: 'RecordAudit'
          },
          datastreamService: 'datastreamservice'
        },
        storage: {
          serviceName: 'mongostorageservice'
        },
        search: {
          serviceName: 'solrsearchservice'
        },
        queue: {
          serviceName: 'agendaqueueservice'
        },
        redbox: {
          apiKey: 'test-api-key'
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      },
      services: {
        brandingservice: {
          getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
          getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
          getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default' })
        },
        mongostorageservice: mockStorageService,
        solrsearchservice: mockSearchService,
        agendaqueueservice: mockQueueService,
        datastreamservice: mockDatastreamService
      }
    });

    mockRecord = {
      find: sinon.stub(),
      findOne: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub(),
      destroy: sinon.stub()
    };

    setupServiceTestGlobals(mockSails);
    (global as any).Record = mockRecord;
    (global as any).RecordType = {
      findOne: sinon.stub().resolves({ name: 'rdmp', packageType: 'rdmp' })
    };
    (global as any).WorkflowStep = {
      findOne: sinon.stub().resolves({ name: 'draft', config: {} })
    };
    (global as any).BrandingService = {
      getDefault: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };
    (global as any).FormsService = {
      getForm: sinon.stub().resolves({ name: 'default-form', attachmentFields: [] }),
      getFormByName: sinon.stub().returns(of({ name: 'default-form', attachmentFields: [] }))
    };
    (global as any).RolesService = {
      getAdminFromBrand: sinon.stub().returns({ id: 'role-admin', name: 'Admin' }),
      getRole: sinon.stub().returns(null)
    };
    (global as any).UsersService = {
      hasRole: sinon.stub().returns(true),
      getUserWithUsername: sinon.stub().returns(of(null))
    };
    (global as any).WorkflowStepsService = {
      getFirst: sinon.stub().returns(of({ name: 'draft', config: { form: 'default-form', addJsonLdContext: false } })),
      get: sinon.stub().returns(of({ name: 'draft', config: {} }))
    };
    (global as any).RecordTypesService = {
      get: sinon.stub().returns(of({ name: 'rdmp', hooks: {} }))
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key)
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
    delete (global as any).TranslationService;
    delete (global as any).RedboxJavaStorageService;
    delete (global as any).SolrSearchService;
    sinon.restore();
  });

  describe('initialization', function () {
    for (const queueState of ['configured', 'missing configuration', 'unavailable service']) {
      it(`initializes storage and persists audits with the queue ${queueState}`, async function () {
        if (queueState === 'missing configuration') {
          delete mockSails.config.queue;
          delete mockSails.services.agendaqueueservice;
        } else if (queueState === 'unavailable service') {
          delete mockSails.services.agendaqueueservice;
        }
        delete RecordsService.storageService;
        delete RecordsService.searchService;
        delete RecordsService.datastreamService;
        delete RecordsService.queueService;
        mockSails.after = sinon.stub();

        RecordsService.init();

        sinon.assert.calledOnce(mockSails.after);
        const [events, onReady] = mockSails.after.firstCall.args;
        expect(events).to.deep.equal(['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready']);
        onReady();

        expect(RecordsService.storageService).to.equal(mockStorageService);
        expect(RecordsService.datastreamService).to.equal(mockDatastreamService);
        expect(RecordsService.searchService).to.equal(mockSearchService);
        expect(RecordsService.queueService).to.equal(queueState === 'configured' ? mockQueueService : undefined);

        await RecordsService.auditRecord('record-123', { metadata: { title: 'Initialized audit' } }, { username: 'admin' });

        sinon.assert.calledOnce(mockStorageService.createRecordAudit);
        sinon.assert.notCalled(mockQueueService.now);
      });
    }
  });

  describe('durable Figshare save boundaries', () => {
    let previousConfig: unknown;
    let previousFigshare: unknown;
    const brand = { id: 'brand-1', name: 'default' };
    const actor = { username: 'researcher' };
    const hooks = { onCreate: { pre: [{ function: 'validateFigshareRecord' }], postSync: [{ function: 'test' }] }, onUpdate: { pre: [{ function: 'validateFigshareRecord' }], postSync: [{ function: 'test' }] } };
    const record = () => ({ metadata: { title: 'before hooks' }, metaMetadata: { type: 'rdmp', brandId: 'brand-1' }, workflow: { stage: 'draft' }, authorization: {} });
    beforeEach(() => {
      previousConfig = Reflect.get(globalThis, 'AppConfigService'); previousFigshare = Reflect.get(globalThis, 'FigshareService');
      mockSails.config.jsonld = { addJsonLdContext: false };
      mockSails.config.record.allowGuestUser = false;
      Reflect.set(globalThis, 'WorkflowStepsService', { getFirst: () => of({ name: 'draft', config: { form: 'default-form', workflow: { stage: 'draft' }, authorization: { viewRoles: [], editRoles: [] } } }) });
      const { FigsharePublishing } = require('../../src/configmodels/FigsharePublishing');
      const config = new FigsharePublishing(); config.enabled = true; config.connection.token = 'test'; config.processing.enabled = true;
      Reflect.set(globalThis, 'AppConfigService', { getAppConfigurationForBrand: () => ({ figsharePublishing: config }) });
      Reflect.set(globalThis, 'FigshareService', { wakeFigshareRecord: sinon.stub().resolves() });
      Reflect.set(globalThis, 'RecordTypesService', { get: () => of({ name: 'rdmp', hooks }) });
      const { StorageServiceResponse } = require('../../src/StorageServiceResponse');
      const response = new StorageServiceResponse(); response.success = true; response.oid = 'record-123';
      mockStorageService.create.resolves(response);
      mockStorageService.readyFigshareIntent = sinon.stub().resolves(true);
      mockStorageService.abandonFigshareIntent = sinon.stub().resolves(true);
      sinon.stub(RecordsService, 'triggerPreSaveTriggers').callsFake(async (_oid: unknown, value: unknown) => ({ ...(value && typeof value === 'object' ? value : {}), metadata: { title: 'after final pre hook' } }));
      sinon.stub(RecordsService, 'triggerPostSaveSyncTriggers').callsFake(async (_oid: unknown, _record: unknown, _type: unknown, _event: unknown, _user: unknown, response: unknown) => response);
      sinon.stub(RecordsService, 'triggerPostSaveTriggers');
      sinon.stub(RecordsService, 'auditRecord').resolves();
      sinon.stub(RecordsService, 'handleUpdateDataStream').returns(of({ success: true, isSuccessful: () => true }));
    });
    afterEach(() => { Reflect.set(globalThis, 'AppConfigService', previousConfig); Reflect.set(globalThis, 'FigshareService', previousFigshare); });
    it('does not require remote credentials when queued processing is disabled', async () => {
      const { FigsharePublishing } = require('../../src/configmodels/FigsharePublishing');
      const config = new FigsharePublishing(); config.enabled = true; config.connection.token = ''; config.processing.enabled = false;
      config.queue.publishAfterUploadDelay = 'in one minute'; config.queue.uploadedFilesCleanupDelay = 'tomorrow at noon';
      Reflect.set(globalThis, 'AppConfigService', { getAppConfigurationForBrand: () => ({ figsharePublishing: config }) });
      const response = await RecordsService.create(brand, record(), { name: 'rdmp', hooks }, actor);
      expect(response.isSuccessful()).to.equal(true);
      expect(mockStorageService.create.firstCall.args[4].figshareIntent).to.equal(undefined);
      sinon.assert.notCalled(mockStorageService.readyFigshareIntent);
    });
    it('preserves source saves and durable intent with an unsupported enabled-processing delay', async () => {
      const { FigsharePublishing } = require('../../src/configmodels/FigsharePublishing');
      const config = new FigsharePublishing(); config.enabled = true;
      config.queue.publishAfterUploadDelay = 'in one minute';
      Reflect.set(globalThis, 'AppConfigService', { getAppConfigurationForBrand: () => ({ figsharePublishing: { ...config, processing: { enabled: true } } }) });
      expect((await RecordsService.create(brand, record(), { name: 'rdmp', hooks }, actor)).isSuccessful()).to.equal(true);
      expect(mockStorageService.create.firstCall.args[4].figshareIntent).not.to.equal(undefined);
      expect((await RecordsService.updateMeta(brand, 'record-123', record(), actor, true, false)).isSuccessful()).to.equal(true);
      expect(mockStorageService.updateMeta.lastCall.args[4].figshareIntent).not.to.equal(undefined);
    });
    it('persists initialising intent after final pre hooks and marks ready after synchronous persistence', async () => {
      const response = await RecordsService.create(brand, record(), { name: 'rdmp', hooks }, actor);
      expect(response.isSuccessful()).to.equal(true);
      const args = mockStorageService.create.firstCall.args;
      expect(args[1].metadata.title).to.equal('after final pre hook');
      expect(args[4].figshareIntent.readiness).to.equal('initialising');
      sinon.assert.callOrder(mockStorageService.create, mockStorageService.updateMeta, mockStorageService.readyFigshareIntent);
      sinon.assert.notCalled(mockStorageService.abandonFigshareIntent);
    });
    it('abandons committed create intent when a secondary save fails', async () => {
      mockStorageService.updateMeta.resolves({ success: false, isSuccessful: () => false });
      const response = await RecordsService.create(brand, record(), { name: 'rdmp', hooks }, actor);
      expect(response.isSuccessful()).to.equal(false);
      sinon.assert.calledOnce(mockStorageService.create); sinon.assert.notCalled(mockStorageService.readyFigshareIntent);
      const token = mockStorageService.create.firstCall.args[4].figshareIntent.saveToken;
      sinon.assert.calledOnceWithExactly(mockStorageService.abandonFigshareIntent, 'record-123', token);
    });
    it('abandons committed update intent when a synchronous post-save hook fails', async () => {
      const { StorageServiceResponse } = require('../../src/StorageServiceResponse');
      const saved = new StorageServiceResponse(); saved.success = true; saved.oid = 'record-123'; saved.metadata = { recordVersion: 1 };
      mockStorageService.updateMeta.resolves(saved);
      RecordsService.triggerPostSaveSyncTriggers.rejects(new Error('post-save hook failed'));
      const response = await RecordsService.updateMeta(brand, 'record-123', record(), actor, true, true);
      expect(response.isSuccessful()).to.equal(false);
      const source = mockStorageService.updateMeta.firstCall.args[4].figshareIntent;
      expect(source.readiness).to.equal('initialising');
      sinon.assert.notCalled(mockStorageService.readyFigshareIntent);
      sinon.assert.calledOnceWithExactly(mockStorageService.abandonFigshareIntent, 'record-123', source.saveToken);
    });
    it('never writes intent when a pre hook rejects the source save', async () => {
      RecordsService.triggerPreSaveTriggers.rejects(new Error('invalid record'));
      const response = await RecordsService.create(brand, record(), { name: 'rdmp', hooks }, actor);
      expect(response.isSuccessful()).to.equal(false);
      sinon.assert.notCalled(mockStorageService.create); sinon.assert.notCalled(mockStorageService.readyFigshareIntent);
    });
    for (const authorised of [false, true]) {
      it(`collects transition intent only when the requested transition is authorised (${authorised})`, async () => {
        const transitionHooks = { onUpdate: hooks.onUpdate, onTransitionWorkflow: { pre: [{ function: 'validateFigshareRecord' }] } };
        Reflect.set(globalThis, 'RecordTypesService', { get: () => of({ name: 'rdmp', hooks: transitionHooks }) });
        const preTransition = sinon.stub(RecordsService, 'triggerPreSaveTransitionWorkflowTriggers').callsFake(async (_oid: unknown, value: unknown) => value);
        const applyTransition = sinon.stub(RecordsService, 'transitionWorkflowStepMetadata').callsFake((value: any, step: any) => { value.workflow = step.config.workflow; });
        const nextStep = { name: 'queued', config: { form: 'default-form', workflow: { stage: 'queued' }, authorization: { transitionRoles: ['Curator'] } } };
        const user = { ...actor, roles: [{ name: authorised ? 'Curator' : 'Researcher' }] };
        const response = await RecordsService.updateMeta(brand, 'record-123', record(), user, true, false, nextStep);
        expect(response.isSuccessful()).to.equal(true);
        const source = mockStorageService.updateMeta.firstCall.args[4].figshareIntent;
        expect(source.intents.map((item: any) => item.policyId)).to.deep.equal(authorised ? ['onUpdate.pre.validateFigshareRecord', 'onTransitionWorkflow.pre.validateFigshareRecord'] : ['onUpdate.pre.validateFigshareRecord']);
        expect(preTransition.called).to.equal(authorised);
        expect(applyTransition.called).to.equal(authorised);
      });
    }
    it('carries the accepted version into secondary workflow writes and propagates conflicts', async () => {
      const { RecordWriteConflict } = require('../../src/RecordWriteOptions');
      mockStorageService.updateMeta.onFirstCall().resolves({ success: true, oid: 'record-123', metadata: { recordVersion: 8 }, isSuccessful: () => true });
      mockStorageService.updateMeta.onSecondCall().rejects(new RecordWriteConflict('record-123'));
      let failure: unknown;
      try { await RecordsService.updateMeta(brand, 'record-123', record(), actor, true, true, {}, {}, { expectedVersion: 7, maintenance: true }); } catch (error) { failure = error; }
      expect(failure).to.be.instanceOf(RecordWriteConflict);
      expect(mockStorageService.updateMeta.firstCall.args[4].expectedVersion).to.equal(7);
      expect(mockStorageService.updateMeta.secondCall.args[4].expectedVersion).to.equal(8);
      sinon.assert.notCalled(RecordsService.handleUpdateDataStream);
      sinon.assert.notCalled(mockStorageService.readyFigshareIntent);
    });
  });

  describe('constructor', function () {
    it('should set logHeader', function () {
      expect(RecordsService.logHeader).to.equal('RecordsService::');
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
          viewRoles: ['Researcher']
        }
      });
      (global as any).UsersService.getUserWithUsername.withArgs('editor').returns(of({ name: 'Editor', email: 'editor@example.com' }));
      (global as any).UsersService.getUserWithUsername.withArgs('viewer').returns(of({ name: 'Viewer', email: 'viewer@example.com' }));

      const result = await RecordsService.getResolvedPermissionsSummary('record-123');

      expect(result).to.deep.equal({
        edit: [{ username: 'editor', name: 'Editor', email: 'editor@example.com' }],
        view: [{ username: 'viewer', name: 'Viewer', email: 'viewer@example.com' }],
        editPending: ['pending-editor'],
        viewPending: ['pending-viewer'],
        editRoles: ['Admin'],
        viewRoles: ['Researcher']
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
          viewRoles: []
        }
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
          metadata: { name: 'file.pdf', mimeType: 'application/pdf' }
        }
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
            dateUpdated: '2001-01-01T00:00:00.000Z'
          }
        }
      ]);

      const result = await RecordsService.getAttachments('record-123');

      expect(result).to.have.length(1);
      expect(result[0]).to.have.property('dateUpdated', '2026-05-13T07:01:32.533Z');
    });

    it('should use lastModified when a datastream does not provide uploadDate', async function () {
      mockDatastreamService.listDatastreams.resolves([
        {
          lastModified: '2026-05-13T07:01:32.533Z',
          metadata: { name: 'file.pdf', mimeType: 'application/pdf' }
        }
      ]);

      const result = await RecordsService.getAttachments('record-123');

      expect(result).to.have.length(1);
      expect(new Date(result[0].dateUpdated as string).toISOString()).to.equal('2026-05-13T07:01:32.533Z');
    });

    it('should filter by label when provided', async function () {
      mockDatastreamService.listDatastreams.resolves([
        { label: 'matched-file.pdf', uploadDate: new Date().toISOString(), metadata: { name: 'matched-file.pdf' } },
        { label: 'other-file.txt', uploadDate: new Date().toISOString(), metadata: { name: 'other-file.txt' } }
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
          view: ['testuser']
        }
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
          editRoles: ['Admin']
        }
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
          view: ['otheruser']
        }
      };

      const result = RecordsService.hasEditAccess(brand, user, [], record);

      expect(result).to.be.false;
    });

    it('should handle flat authorization structure (Solr format)', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'testuser', roles: [] };
      const record = {
        authorization_edit: ['testuser'],
        authorization_view: ['testuser']
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
          view: ['owner', 'viewer']
        }
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
          view: ['viewer']
        }
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
          view: ['viewer']
        }
      };

      const result = RecordsService.hasViewAccess(brand, user, [], record);

      expect(result).to.be.false;
    });

    it('should handle flat authorization structure (Solr format)', function () {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'viewer', roles: [] };
      const record = {
        authorization_edit: ['owner'],
        authorization_view: ['owner', 'viewer']
      };

      const result = RecordsService.hasViewAccess(brand, user, [], record);

      expect(result).to.be.true;
    });
  });

  describe('auditRecord', function () {
    for (const environment of ['development', 'production', 'integrationtest']) {
      it(`persists directly in ${environment} without enqueuing`, async function () {
        mockSails.config.environment = environment;
        const record = {
          metadata: { title: 'Test' },
          metaMetadata: { lastSaveDate: '2026-03-01T12:00:00Z' },
          authorization: { edit: ['testuser'] },
          workflow: { stage: 'draft' }
        };
        const user = { username: 'testuser' };

        await RecordsService.auditRecord('record-123', record, user);

        sinon.assert.calledOnce(mockStorageService.createRecordAudit);
        const data = mockStorageService.createRecordAudit.firstCall.args[0];
        expect(data).to.be.instanceOf(RecordAuditModel);
        expect(data).to.include({ redboxOid: 'record-123', action: 'updated', occurredAt: '2026-03-01T12:00:00Z' });
        expect(data.record).to.deep.equal(record);
        expect(data.user).to.deep.equal(user);
        sinon.assert.notCalled(mockQueueService.now);
      });
    }

    it('persists without a queue service or queue configuration', async function () {
      RecordsService.queueService = null;
      delete mockSails.config.queue;
      delete mockSails.services.agendaqueueservice;
      delete mockSails.config.record.auditing.recordAuditJobName;

      await RecordsService.auditRecord('record-123', {}, {});

      sinon.assert.calledOnce(mockStorageService.createRecordAudit);
      sinon.assert.notCalled(mockQueueService.now);
    });

    it('awaits storage completion before resolving', async function () {
      let finish!: (response: StorageServiceResponse) => void;
      mockStorageService.createRecordAudit.returns(new Promise<StorageServiceResponse>(resolve => { finish = resolve; }));
      let completed = false;

      const auditing = RecordsService.auditRecord('record-123', {}, {}).then(() => { completed = true; });
      await Promise.resolve();
      expect(completed).to.equal(false);

      const response = new StorageServiceResponse();
      response.success = true;
      finish(response);
      await auditing;
      expect(completed).to.equal(true);
    });

    it('bounds a stalled audit write and logs structured failure data', async function () {
      const clock = sinon.useFakeTimers();
      mockSails.config.record.auditing.writeTimeoutMs = 50;
      mockStorageService.createRecordAudit.returns(new Promise<StorageServiceResponse>(() => {}));
      let completed = false;
      const auditing = RecordsService.auditRecord('record-123', {}, {}).then(() => { completed = true; });

      await clock.tickAsync(49);
      expect(completed).to.equal(false);
      await clock.tickAsync(1);
      expect(completed).to.equal(true);
      await auditing;

      sinon.assert.calledWithMatch(mockSails.log.error, 'Failed to persist record audit', {
        event: 'record_audit_write_failed', redboxOid: 'record-123', action: 'updated',
        timedOut: true, timeoutMs: 50, error: 'Error: Record audit write timed out after 50ms'
      });
      expect(clock.countTimers()).to.equal(0);
      sinon.assert.calledOnceWithMatch(mockQueueService.now, 'RecordsService-RecoverRecordAudit', {
        redboxOid: 'record-123', auditId: sinon.match(/^[a-f0-9]{24}$/)
      });
    });

    for (const configuredTimeout of [undefined, 0, -1, 1.5, '50', NaN, Infinity, 2147483648]) {
      it(`uses the default audit deadline for an absent or invalid timeout (${configuredTimeout})`, async function () {
        const clock = sinon.useFakeTimers();
        mockSails.config.record.auditing.writeTimeoutMs = configuredTimeout;
        mockStorageService.createRecordAudit.returns(new Promise<StorageServiceResponse>(() => {}));
        let completed = false;
        const auditing = RecordsService.auditRecord('record-123', {}, {}).then(() => { completed = true; });

        await clock.tickAsync(4999);
        expect(completed).to.equal(false);
        await clock.tickAsync(1);
        expect(completed).to.equal(true);
        await auditing;
        sinon.assert.calledWithMatch(mockSails.log.error, 'Failed to persist record audit', { timedOut: true, timeoutMs: 5000 });
      });
    }

    for (const fails of [false, true]) {
      it(`clears the audit deadline after a ${fails ? 'rejected' : 'successful'} write`, async function () {
        const clock = sinon.useFakeTimers();
        if (fails) mockStorageService.createRecordAudit.rejects(new Error('audit storage unavailable'));

        await RecordsService.auditRecord('record-123', {}, {});

        expect(clock.countTimers()).to.equal(0);
        await clock.tickAsync(5000);
        expect(mockSails.log.error.callCount).to.equal(fails ? 1 : 0);
      });
    }

    it('handles late storage rejection after retaining the same event for durable recovery', async function () {
      const clock = sinon.useFakeTimers();
      mockSails.config.record.auditing.writeTimeoutMs = 50;
      let rejectWrite!: (error: Error) => void;
      mockStorageService.createRecordAudit.returns(new Promise<StorageServiceResponse>((_resolve, reject) => { rejectWrite = reject; }));

      const auditing = RecordsService.auditRecord('record-123', {}, {});
      await clock.tickAsync(50);
      await auditing;
      rejectWrite(new Error('late storage rejection'));
      await clock.tickAsync(0);

      sinon.assert.calledOnce(mockSails.log.error);
      sinon.assert.calledOnce(mockStorageService.createRecordAudit);
      sinon.assert.calledOnce(mockQueueService.now);
      expect(mockQueueService.now.firstCall.args[1]).to.equal(mockStorageService.createRecordAudit.firstCall.args[0]);
    });

    it('accepts the string true auditing setting', async function () {
      mockSails.config.record.auditing.enabled = 'true';
      await RecordsService.auditRecord('record-123', {}, {});
      sinon.assert.calledOnce(mockStorageService.createRecordAudit);
    });

    for (const enabled of [false, 'false', undefined]) {
      it(`skips storage and queue when auditing is ${enabled}`, async function () {
        mockSails.config.record.auditing.enabled = enabled;
        await RecordsService.auditRecord('record-123', {}, {});
        sinon.assert.notCalled(mockStorageService.createRecordAudit);
        sinon.assert.notCalled(mockQueueService.now);
      });
    }

    it('removes password and token before storage and logging', async function () {
      const user = { username: 'testuser', password: 'secret', token: 'token123' };

      await RecordsService.auditRecord('record-123', {}, user);

      expect(user.password).to.be.undefined;
      expect(user.token).to.be.undefined;
      expect(mockStorageService.createRecordAudit.firstCall.args[0].user).to.deep.equal({ username: 'testuser' });
      const logs = mockSails.log.verbose.getCalls().map((call: sinon.SinonSpyCall) => call.args.join(' ')).join('\n');
      expect(logs).not.to.include('secret');
      expect(logs).not.to.include('token123');
    });

    it('normalizes class-backed snapshots without changing their serialized shape', async function () {
      const snapshot = new StorageServiceResponse();
      snapshot.success = true;
      snapshot.metadata = { redboxOid: 'record-123', metadata: { title: 'Restored record' } };

      await RecordsService.auditRecord('record-123', snapshot, {}, RecordAuditActionType.restored);

      const data = mockStorageService.createRecordAudit.firstCall.args[0];
      expect(Object.getPrototypeOf(data.record)).to.equal(Object.prototype);
      expect(JSON.stringify(data.record)).to.equal(JSON.stringify(snapshot));
      expect(data.action).to.equal('restored');
    });

    it('normalizes class-backed actors after redaction', async function () {
      const actor = new UserModel();
      actor.username = 'admin';
      actor.password = 'actor-password';
      actor.token = 'actor-token';
      actor.lastLogin = new Date('2026-03-01T12:00:00Z');

      await RecordsService.auditRecord('record-123', {}, actor);

      const data = mockStorageService.createRecordAudit.firstCall.args[0];
      expect(Object.getPrototypeOf(data.user)).to.equal(Object.prototype);
      expect(data.user.username).to.equal('admin');
      expect(data.user).not.to.have.property('password');
      expect(data.user).not.to.have.property('token');
      expect(JSON.stringify(data.user)).to.equal(JSON.stringify(actor));
    });

    it('preserves a null actor when normalizing audit data', async function () {
      await RecordsService.auditRecord('record-123', {}, null);
      expect(mockStorageService.createRecordAudit.firstCall.args[0].user).to.equal(null);
    });

    it('logs unserializable snapshots without failing the persisted record operation', async function () {
      const record: { self?: unknown } = {};
      record.self = record;

      await RecordsService.auditRecord('record-123', record, {});

      sinon.assert.notCalled(mockStorageService.createRecordAudit);
      sinon.assert.calledWithMatch(mockSails.log.error, 'Failed to persist record audit for record-123');
      sinon.assert.notCalled(mockQueueService.now);
    });

    for (const action of Object.values(RecordAuditActionType)) {
      it(`preserves the ${action} action and its event timestamp`, async function () {
        sinon.useFakeTimers(new Date('2026-03-03T12:00:00Z'));
        const record = { metaMetadata: { createdOn: '2026-03-01T12:00:00Z', lastSaveDate: '2026-03-02T12:00:00Z' } };

        await RecordsService.auditRecord('record-123', record, {}, action);

        const data = mockStorageService.createRecordAudit.firstCall.args[0];
        expect(data.action).to.equal(action);
        const expectedTime = action === RecordAuditActionType.created ? record.metaMetadata.createdOn
          : action === RecordAuditActionType.updated ? record.metaMetadata.lastSaveDate : '2026-03-03T12:00:00.000Z';
        expect(data.occurredAt).to.equal(expectedTime);
      });
    }

    for (const failure of [new Error('audit database unavailable'), new RecordWriteConflict()]) {
      it(`logs a rejected audit write without rejecting the saved record operation (${failure.name})`, async function () {
        mockStorageService.createRecordAudit.rejects(failure);

        await RecordsService.auditRecord('record-123', {}, {});

        sinon.assert.calledWithMatch(mockSails.log.error, 'Failed to persist record audit for record-123 (updated)');
        sinon.assert.calledWithMatch(mockSails.log.error, failure.message);
        sinon.assert.calledWithMatch(mockSails.log.error, sinon.match.string, {
          event: 'record_audit_write_failed', redboxOid: 'record-123', action: 'updated', timedOut: false
        });
        sinon.assert.calledOnce(mockQueueService.now);
      });
    }

    for (const message of ['audit insert failed', '']) {
      it(`logs an unsuccessful storage response without rejecting (${message || 'no message'})`, async function () {
        const response = new StorageServiceResponse();
        response.message = message;
        mockStorageService.createRecordAudit.resolves(response);

        await RecordsService.auditRecord('record-123', {}, {});

        sinon.assert.calledWithMatch(mockSails.log.error, message || 'unsuccessful record audit response');
        sinon.assert.calledOnce(mockQueueService.now);
      });
    }

    it('logs missing storage capability without rejecting', async function () {
      delete mockStorageService.createRecordAudit;

      await RecordsService.auditRecord('record-123', {}, {});

      sinon.assert.calledWithMatch(mockSails.log.error, 'Storage service does not support createRecordAudit');
      sinon.assert.calledOnce(mockQueueService.now);
    });

    it('keeps a persisted partial record update successful when its audit fails', async function () {
      mockStorageService.setRecordFields = sinon.stub().resolves({ updated: true, recordVersion: 2 });
      mockStorageService.createRecordAudit.rejects(new Error('audit insert failed'));

      const result = await RecordsService.setRecordFields('record-123', { 'metadata.title': 'Saved' }, 1, ['metadata.title'], {});

      expect(result).to.deep.equal({ updated: true, recordVersion: 2 });
      sinon.assert.calledOnce(mockStorageService.createRecordAudit);
      sinon.assert.calledWithMatch(mockSails.log.error, 'audit insert failed');
    });

    it('retries the same immutable redacted event before falling back to Agenda', async function () {
      const clock = sinon.useFakeTimers();
      mockSails.config.record.auditing.writeAttempts = 3;
      mockStorageService.createRecordAudit.rejects(new Error('temporary outage'));
      const record = { metadata: { title: 'Original' }, lastSaveDate: '2026-03-01T12:00:00Z' };
      const user = { username: 'original', password: 'secret', token: 'secret-token' };
      const auditing = RecordsService.auditRecord('record-123', record, user);
      record.metadata.title = 'Changed';
      user.username = 'changed';
      await clock.tickAsync(500);
      await auditing;

      sinon.assert.calledThrice(mockStorageService.createRecordAudit);
      sinon.assert.calledOnce(mockQueueService.now);
      const event = mockQueueService.now.firstCall.args[1];
      expect(event.auditId).to.match(/^[a-f0-9]{24}$/);
      expect(event.record.metadata.title).to.equal('Original');
      expect(event.user).to.deep.equal({ username: 'original' });
      expect(event.occurredAt).to.equal('2026-03-01T12:00:00Z');
      for (const call of mockStorageService.createRecordAudit.getCalls()) expect(call.args[0]).to.equal(event);
      sinon.assert.calledWithMatch(mockSails.log.warn, 'retained for durable recovery', {
        event: 'record_audit_recovery_queued', auditId: event.auditId
      });
    });

    it('does not enqueue when a short retry succeeds', async function () {
      const clock = sinon.useFakeTimers();
      mockSails.config.record.auditing.writeAttempts = 3;
      mockStorageService.createRecordAudit.onFirstCall().rejects(new Error('temporary failure'));
      const auditing = RecordsService.auditRecord('record-123', {}, {});
      await clock.tickAsync(200);
      await auditing;
      sinon.assert.calledTwice(mockStorageService.createRecordAudit);
      sinon.assert.notCalled(mockQueueService.now);
      sinon.assert.notCalled(mockSails.log.error);
    });

    for (const queueState of ['missing', 'rejected', 'stalled']) {
      it(`reports recovery failure without failing the saved record when the queue is ${queueState}`, async function () {
        const clock = sinon.useFakeTimers();
        mockSails.config.record.auditing.writeTimeoutMs = 50;
        mockStorageService.createRecordAudit.rejects(new Error('audit insert failed'));
        if (queueState === 'missing') RecordsService.queueService = null;
        else if (queueState === 'rejected') mockQueueService.now.rejects(new Error('queue insert failed'));
        else mockQueueService.now.returns(new Promise(() => {}));

        const auditing = RecordsService.auditRecord('record-123', {}, {});
        await clock.tickAsync(50);
        await auditing;
        sinon.assert.calledWithMatch(mockSails.log.error, 'Unable to retain record audit', {
          event: 'record_audit_recovery_failed', auditId: sinon.match(/^[a-f0-9]{24}$/), redboxOid: 'record-123'
        });
        sinon.assert.notCalled(mockSails.log.warn);
      });
    }

    it('honours a configured failure-only recovery job name', async function () {
      mockSails.config.record.auditing.recordAuditRecoveryJobName = 'CustomAuditRecovery';
      mockStorageService.createRecordAudit.rejects(new Error('audit insert failed'));
      await RecordsService.auditRecord('record-123', {}, {});
      sinon.assert.calledOnceWithMatch(mockQueueService.now, 'CustomAuditRecovery');
    });
  });

  describe('recoverRecordAudit', function () {
    const data = {
      auditId: '0123456789abcdef01234567', redboxOid: 'record-123', action: RecordAuditActionType.updated,
      occurredAt: '2026-03-01T12:00:00Z', record: { metadata: { title: 'Original snapshot' } }, user: { username: 'original' }
    };

    it('delivers a serialized retained event through a fresh service instance even when new audits are disabled', async function () {
      mockSails.config.record.auditing.enabled = false;
      const recovered = JSON.parse(JSON.stringify({ attrs: { data } }));
      await RecordsService.recoverRecordAudit(recovered);
      sinon.assert.calledOnceWithExactly(mockStorageService.createRecordAudit, recovered.attrs.data);
      sinon.assert.notCalled(mockQueueService.now);
      sinon.assert.calledWithMatch(mockSails.log.info, 'Recovered record audit', {
        event: 'record_audit_recovered', auditId: data.auditId
      });
    });

    it('rejects failed recovery so Agenda schedules durable backoff instead of acknowledging it', async function () {
      const failure = new Error('audit database unavailable');
      mockStorageService.createRecordAudit.rejects(failure);
      await assert.rejects(RecordsService.recoverRecordAudit({ attrs: { data } }), error => error === failure);
      sinon.assert.calledWithMatch(mockSails.log.error, 'Record audit recovery will retry', { event: 'record_audit_recovery_retry' });
      sinon.assert.notCalled(mockQueueService.now);
    });

    it('bounds a stalled queued write below its Agenda lock lifetime', async function () {
      const clock = sinon.useFakeTimers();
      mockSails.config.record.auditing.writeTimeoutMs = 120000;
      mockStorageService.createRecordAudit.returns(new Promise(() => {}));
      const recovered = RecordsService.recoverRecordAudit({ attrs: { data } }).catch((error: unknown) => error);
      await clock.tickAsync(10000);
      expect(await recovered).to.be.instanceOf(Error);
      sinon.assert.calledWithMatch(mockSails.log.error, 'Record audit recovery will retry');
    });

    for (const auditId of [undefined, '', 'not-an-event-id']) {
      it(`rejects an invalid recovery identity (${auditId}) before inserting`, async function () {
        await assert.rejects(RecordsService.recoverRecordAudit({ attrs: { data: { ...data, auditId } } }), /stable audit ID/);
        sinon.assert.notCalled(mockStorageService.createRecordAudit);
      });
    }
  });

  it('persists partial-write audits with the newer top-level save time', async function () {
    mockStorageService.setRecordFields = sinon.stub().resolves({ updated: true, recordVersion: 2 });
    mockStorageService.getMeta.resolves({
      redboxOid: 'record-123',
      metaMetadata: { lastSaveDate: '2026-03-01T12:00:00Z' },
      lastSaveDate: '2026-03-02T12:00:00Z',
      metadata: { title: 'Updated by Figshare' },
    });

    await RecordsService.setRecordFields('record-123', { 'metadata.title': 'Updated by Figshare' }, 1, ['metadata.title'], {});

    sinon.assert.calledOnce(mockStorageService.createRecordAudit);
    expect(mockStorageService.createRecordAudit.firstCall.args[0].occurredAt).to.equal('2026-03-02T12:00:00Z');
    sinon.assert.notCalled(mockQueueService.now);
  });

  describe('storeRecordAudit', function () {
    for (const wrapped of [true, false]) {
      it(`persists a legacy ${wrapped ? 'attrs.data' : 'attrs'} payload unchanged even when new audits are disabled`, async function () {
        mockSails.config.record.auditing.enabled = false;
        const data = { redboxOid: 'record-123', action: 'updated', user: { username: 'testuser' }, record: { lastSaveDate: '2026-03-01T12:00:00Z' } };

        await RecordsService.storeRecordAudit({ attrs: wrapped ? { data } : data });

        sinon.assert.calledOnceWithExactly(mockStorageService.createRecordAudit, data);
        expect(data).not.to.have.property('occurredAt');
      });
    }

    it('does not complete the job until persistence finishes', async function () {
      let finish!: (response: StorageServiceResponse) => void;
      mockStorageService.createRecordAudit.returns(new Promise<StorageServiceResponse>(resolve => { finish = resolve; }));
      let completed = false;

      const storing = Promise.resolve(RecordsService.storeRecordAudit({ attrs: { data: { redboxOid: 'record-123' } } }))
        .then(() => { completed = true; });
      await Promise.resolve();
      expect(completed).to.equal(false);

      const response = new StorageServiceResponse();
      response.success = true;
      finish(response);
      await storing;
      expect(completed).to.equal(true);
    });

    it('preserves explicit event time in queued snapshots', async function () {
      const data = { redboxOid: 'record-123', occurredAt: '2026-03-01T12:00:00Z', action: 'deleted', record: { lastSaveDate: '2026-02-01T12:00:00Z' } };
      await RecordsService.storeRecordAudit({ attrs: { data } });
      sinon.assert.calledOnceWithExactly(mockStorageService.createRecordAudit, data);
    });

    it('rejects and logs storage rejections so Agenda can fail the job', async function () {
      const failure = new Error('audit database unavailable');
      mockStorageService.createRecordAudit.rejects(failure);

      await assert.rejects(RecordsService.storeRecordAudit({ attrs: { data: { redboxOid: 'record-123' } } }), error => error === failure);

      sinon.assert.calledWithMatch(mockSails.log.error, 'Failed to store legacy record audit for record-123');
      sinon.assert.calledWithMatch(mockSails.log.error, failure.message);
    });

    for (const message of ['audit insert failed', '']) {
      it(`rejects unsuccessful storage responses so Agenda can fail the job (${message || 'no message'})`, async function () {
        const response = new StorageServiceResponse();
        response.message = message;
        mockStorageService.createRecordAudit.resolves(response);

        await assert.rejects(RecordsService.storeRecordAudit({ attrs: { data: { redboxOid: 'record-123' } } }), /audit insert failed|unsuccessful record audit response/);

        sinon.assert.calledWithMatch(mockSails.log.error, 'Failed to store legacy record audit for record-123');
      });
    }

    it('rejects missing storage capability so Agenda can fail the job', async function () {
      delete mockStorageService.createRecordAudit;

      await assert.rejects(RecordsService.storeRecordAudit({ attrs: { data: { redboxOid: 'record-123' } } }), /does not support createRecordAudit/);

      sinon.assert.calledWithMatch(mockSails.log.error, 'Failed to store legacy record audit for record-123');
    });
  });

  describe('hasPostSaveSyncHooks', function () {
    it('should return true when hooks are configured', function () {
      const recordType = {
        hooks: {
          onUpdate: {
            postSync: [{ function: 'someFunction' }]
          }
        }
      };

      const result = RecordsService.hasPostSaveSyncHooks(recordType, 'onUpdate');

      expect(result).to.be.true;
    });

    it('should return false when no hooks configured', function () {
      const recordType = {
        hooks: {}
      };

      const result = RecordsService.hasPostSaveSyncHooks(recordType, 'onUpdate');

      expect(result).to.be.false;
    });

    it('should return false for empty hooks array', function () {
      const recordType = {
        hooks: {
          onUpdate: {
            postSync: []
          }
        }
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
        searchCore: 'default'
      };
      const workflowStep = {
        config: { form: 'default-form' }
      };
      const form = {
        configuration: {
          attachmentFields: ['dataLocations']
        }
      };

      const result = (RecordsService as any).initRecordMetaMetadata(
        'brand-1', 'testuser', recordType, workflowStep, form, '2024-01-01T00:00:00Z'
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
        searchCore: 'default'
      };
      const workflowStep = {
        config: { form: 'default-form' }
      };
      const form = {
        attachmentFields: ['dataLocations']
      };

      const result = (RecordsService as any).initRecordMetaMetadata(
        'brand-1', 'testuser', recordType, workflowStep, form, '2024-01-01T00:00:00Z'
      );

      expect(result).to.have.property('attachmentFields', form.attachmentFields);
    });
  });

  describe('bindPendingAttachmentOids', function () {
    it('rebinds pending attachment URLs and clears the pending flag', function () {
      const metadata = {
        attachments: [{
          pending: true,
          location: '/record/pending-oid/attach/file-123',
          uploadUrl: 'http://localhost/record/pending-oid/attach/file-123',
          fileId: 'file-123'
        }]
      };

      (RecordsService as any).bindPendingAttachmentOids(metadata, ['attachments'], 'oid-100');

      expect(metadata.attachments[0]).to.deep.include({
        pending: false,
        location: '/record/oid-100/attach/file-123',
        uploadUrl: 'http://localhost/record/oid-100/attach/file-123'
      });
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
      await fs.writeFile(path.join(recordsPath, 'party.json'), JSON.stringify([
        { title: 'Party one' },
        { title: 'Party two' }
      ]));
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
      } finally {
        await fs.rm(bootstrapPath, { recursive: true, force: true });
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
    for (const permanentlyDelete of [false, true]) {
      it(`removes search results and completes ${permanentlyDelete ? 'permanent' : 'soft'} deletion when audit storage never settles`, async function () {
        const clock = sinon.useFakeTimers();
        mockSails.config.record.auditing.writeTimeoutMs = 50;
        mockStorageService.createRecordAudit.returns(new Promise<StorageServiceResponse>(() => {}));
        const response = new StorageServiceResponse();
        response.success = true;
        mockStorageService.delete.resolves(response);
        sinon.stub(RecordsService, 'triggerPreSaveTriggers').resolves({});
        const postSync = sinon.stub(RecordsService, 'triggerPostSaveSyncTriggers').resolves(response);
        const post = sinon.stub(RecordsService, 'triggerPostSaveTriggers');
        let completed = false;

        const deleting = RecordsService.delete('record-123', permanentlyDelete, {}, {}, { username: 'admin' })
          .then((result: StorageServiceResponse) => { completed = true; return result; });
        await clock.tickAsync(0);

        sinon.assert.calledOnceWithExactly(mockSearchService.remove, 'record-123');
        sinon.assert.callOrder(mockStorageService.delete, mockSearchService.remove, mockStorageService.createRecordAudit);
        expect(completed).to.equal(false);
        await clock.tickAsync(50);
        expect(completed).to.equal(true);
        expect(await deleting).to.equal(response);
        sinon.assert.calledOnce(postSync);
        sinon.assert.calledOnce(post);
        sinon.assert.calledWithMatch(mockSails.log.error, 'Failed to persist record audit', {
          event: 'record_audit_write_failed', redboxOid: 'record-123',
          action: permanentlyDelete ? 'destroyed' : 'deleted', timedOut: true
        });
      });
    }

    it('should delete record if user has access', async function () {
      const user = { username: 'admin' };
      const record = {
        metaMetadata: { brandId: 'brand-1' },
        metadata: {}
      };

      sinon.stub(RecordsService, 'getMeta').resolves(record);
      sinon.stub(RecordsService, 'hasEditAccess').returns(true);

      const result = await RecordsService.delete('record-123', user);

      expect(mockStorageService.delete.calledWith('record-123')).to.be.true;
      expect(mockSearchService.remove.calledWith('record-123')).to.be.true;
      expect(result).to.have.property('success', true);

      (RecordsService.getMeta as any).restore();
      (RecordsService.hasEditAccess as any).restore();
    });
  });

  describe('triggerPreSaveTriggers', function () {
    it('should handle undefined triggers', async function () {
      const recordType = { hooks: {} };
      const record = { metadata: { title: 'Test' } };

      const result = await RecordsService.triggerPreSaveTriggers('oid-1', record, recordType, 'onCreate', {});

      expect(result).to.deep.equal(record);
    });
  });

  describe('createBatch', function () {
    it('should call storage service createBatch', async function () {
      const records = [{ title: 'Rec 1' }, { title: 'Rec 2' }];

      await RecordsService.createBatch(records);

      expect(mockStorageService.createBatch.calledWith(records)).to.be.true;
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
