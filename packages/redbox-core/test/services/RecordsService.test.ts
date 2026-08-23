let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { of, firstValueFrom } from 'rxjs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  formValidatorsSharedDefinitions,
  type FormConfigFrame,
  type RecordSaveIssue,
} from '@researchdatabox/sails-ng-common';
import type { StorageService } from '../../src/StorageService';
import type { FormAttributes } from '../../src/waterline-models/Form';
import {
  Services as RecordValidationServices,
  type RecordValidationServiceDependencies,
} from '../../src/services/RecordValidationService';
import {
  setupServiceTestGlobals,
  cleanupServiceTestGlobals,
  createMockSails,
  createQueryObject,
  configureModelMethod,
} from './testHelper';

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
      destroyDeletedRecord: sinon.stub().resolves({}),
    };

    mockSearchService = {
      index: sinon.stub(),
      remove: sinon.stub(),
    };

    mockQueueService = {
      now: sinon.stub(),
    };

    mockDatastreamService = {
      listDatastreams: sinon.stub().resolves([]),
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
    };
    (global as any).FormsService = {
      getForm: sinon.stub().resolves({ name: 'default-form', attachmentFields: [] }),
      getFormByName: sinon.stub().returns(of({ name: 'default-form', attachmentFields: [] })),
    };
    (global as any).RolesService = {
      getAdminFromBrand: sinon.stub().returns({ id: 'role-admin', name: 'Admin' }),
      getRole: sinon.stub().returns(null),
    };
    (global as any).UsersService = {
      hasRole: sinon.stub().returns(true),
      getUserWithUsername: sinon.stub().returns(of(null)),
    };
    (global as any).WorkflowStepsService = {
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
      get: sinon.stub().returns(of({ name: 'draft', config: {} })),
    };
    (global as any).RecordTypesService = {
      get: sinon.stub().returns(of({ name: 'rdmp', hooks: {} })),
    };
    (global as any).RecordValidationService = {
      resolve: sinon.stub().resolves({
        status: 'unresolved',
        shouldBlock: false,
        mode: 'shadow',
        diagnostics: [],
      }),
    };
    mockSails.services.recordvalidationservice = (global as any).RecordValidationService;
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
    delete (global as any).TranslationService;
    delete (global as any).RedboxJavaStorageService;
    delete (global as any).SolrSearchService;
    sinon.restore();
  });

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
      expect(() => (RecordsService as any).ensureAttachmentIds(
        { metadata: { attachments: [{ attachmentId: 'bad id', fileId: 'file-1' }] } },
        ['attachments']
      )).to.throw('Invalid attachment identity');
      expect(() => (RecordsService as any).ensureAttachmentIds(
        { metadata: { attachments: [
          { attachmentId: 'same', fileId: 'file-1' },
          { attachmentId: 'same', fileId: 'file-2' },
        ] } },
        ['attachments']
      )).to.throw('Duplicate attachment identity');
    });

    it('plans unresolved work before replacements and deletions', function () {
      const plan = (RecordsService as any).attachmentMutationPlan(
        { metadata: { attachments: [{ attachmentId: 'old', fileId: 'old-file' }] } },
        { metadata: { attachments: [
          { attachmentId: 'new', fileId: 'new-file', pending: true },
          { attachmentId: 'old', fileId: 'replacement-file' },
        ] } },
        ['attachments'],
        'record-1',
        'generation-1',
        [{ attachmentId: 'retry', mutationFileId: 'retry-file', operation: 'finalize', mutationState: 'unknown', generation: 'retry-generation', attachmentField: 'attachments' }]
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
        { field: 'attachments', attachmentId: 'a', fileId: 'new-file', operation: 'add', generation: 'g', entry: { fileId: 'new-file' } },
        { field: 'attachments', attachmentId: 'a', fileId: 'old-file', operation: 'delete', generation: 'g', entry: { fileId: 'old-file' } },
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
      const plan = [{
        field: 'attachments', attachmentId: 'a', fileId: 'file-1', operation: 'add', generation: 'g', entry: { fileId: 'file-1' },
      }];

      const result = await (RecordsService as any).executeAttachmentPlan('record-1', plan);

      expect(result[0].status).to.equal('unknown');
      expect(result[0].code).to.equal('attachment-operation-unknown');
      expect(mockSails.log.error.called).to.equal(true);
      expect((RecordsService as any).incompleteAttachmentItems(
        [{ field: 'attachments', attachmentId: 'a', operation: 'add', status: 'completed' }],
        'reference-failed'
      )).to.deep.equal([
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

    it('seeds in enforce mode through a direct durable internal bypass audit', async function () {
      const bootstrapPath = await fs.mkdtemp(path.join(os.tmpdir(), 'records-bootstrap-enforce-'));
      const recordsPath = path.join(bootstrapPath, 'records');
      await fs.mkdir(recordsPath, { recursive: true });
      await fs.writeFile(path.join(recordsPath, 'party.json'), JSON.stringify([{ title: 'Enforced seed' }]));
      mockSails.config.bootstrap = { bootstrapDataPath: bootstrapPath };
      mockSails.config.recordValidation = { mode: 'enforce' };
      mockSails.config.record.auditing.enabled = false;
      mockRecord.findOne.returns(createQueryObject(null));
      (global as any).RecordTypesService.get = sinon
        .stub()
        .returns(of({ name: 'party', hooks: {}, searchable: false }));
      (global as any).RecordValidationService.resolve.resolves({
        status: 'unresolved',
        shouldBlock: true,
        mode: 'enforce',
        diagnostics: [],
      });

      try {
        await RecordsService.bootstrapData();

        expect(mockStorageService.create.calledOnce).to.equal(true);
        expect((global as any).RecordValidationService.resolve.notCalled).to.equal(true);
        expect(mockStorageService.createRecordAudit.calledOnce).to.equal(true);
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
    it('should delete record if user has access', async function () {
      const user = { username: 'admin' };
      const record = {
        metaMetadata: { brandId: 'brand-1' },
        metadata: {},
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

    it('does not reject malformed detached delete hooks before deleting the record', async function () {
      const result = await RecordsService.delete(
        'record-123',
        false,
        { metadata: {} },
        { hooks: { onDelete: { post: [{ function: '({ invalid: true })' }] } } },
        { username: 'admin' }
      );

      expect(result.success).to.equal(true);
      expect(mockStorageService.delete.calledWith('record-123')).to.equal(true);
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
        metadata: { attachments: [{ attachmentId: 'attachment-1', fileId: 'file-1', pending: false }] },
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
        { attachments: [{ attachmentId: 'attachment-1', fileId: 'file-1', pending: true }] }
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
        metadata: { attachments: [{ attachmentId: 'attachment-1', fileId: 'new-file', pending: false }] },
      });
      (global as any).FormsService.getFormByName.returns(of({
        name: 'default-form',
        configuration: { attachmentFields: ['attachments'] },
      }));
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
        { attachments: [{ attachmentId: 'attachment-1', fileId: 'new-file' }] },
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
  });

  describe('create save pipeline', function () {
    it('journals attachments before persistence and retains the confirmed oid', async function () {
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
        oid: 'new-record-123',
        applicationState: 'applied',
      });
      mockStorageService.updateMeta.resolves({ success: true, oid: 'new-record-123', applicationState: 'applied' });
      mockStorageService.getMeta.resolves({
        redboxOid: 'new-record-123',
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
        { metadata: { attachments: [{ attachmentId: 'attachment-1', fileId: 'file-1', pending: true }] } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );

      expect(result.wasPersisted()).to.equal(true);
      expect(result.oid).to.equal('new-record-123');
      expect(journal.prepareMutations.calledBefore(mockStorageService.create)).to.equal(true);
      expect(mockStorageService.create.calledBefore(mockDatastreamService.addDatastream)).to.equal(true);
      expect(journal.rebindOid.calledOnce).to.equal(true);
      expect(mockStorageService.updateMeta.calledOnce).to.equal(true);
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
      (global as any).FormsService.getFormByName.returns(
        of({ name: 'default-form', configuration: { attachmentFields: [] } })
      );
      (global as any).RecordTypesService.get.returns(of({ name: 'rdmp', hooks: {}, searchable: false }));
    });

    it('returns not-saved when update persistence is explicitly rejected', async function () {
      mockStorageService.updateMeta.resolves({ success: false, applicationState: 'not-applied' });
      const result = await RecordsService.updateMeta(
        { id: 'brand-1' }, 'record-123', updateRecord(), { username: 'user-1' }, false, false
      );

      expect(result.outcome).to.equal('not-saved');
      expect(result.problems[0].issues[0].code).to.equal('save-not-applied');
    });

    it('returns unknown when update persistence is ambiguous', async function () {
      mockStorageService.updateMeta.resolves({ success: false });
      const result = await RecordsService.updateMeta(
        { id: 'brand-1' }, 'record-123', updateRecord(), { username: 'user-1' }, false, false
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
        { id: 'brand-1' }, 'record-123', updateRecord(), { username: 'user-1' }, false, false
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
        { attachments: [{ attachmentId: 'a', fileId: 'new-file' }] }
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

    const allowResult = (overrides: any = {}) => ({
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
      ...overrides,
    });

    const blockingResult = (overrides: any = {}) =>
      allowResult({
        shouldBlock: true,
        mode: 'enforce',
        blockingErrors: [{ message: '@validator-required', field: 'title', class: 'RequiredValidator' }],
        ...overrides,
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

    it('exposes current attachmentFields to create hooks and refreshes them after a form change', async function () {
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
        expect(request.candidate.metaMetadata.form).to.equal('after-hook-form');
        expect(request.candidate.metaMetadata.attachmentFields).to.deep.equal(['afterHookAttachment']);
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
        expect(mockStorageService.create.firstCall.args[1].metaMetadata.attachmentFields).to.deep.equal([
          'afterHookAttachment',
        ]);
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
      expect(mockStorageService.create.firstCall.args[1].workflow.hookMarker).to.equal('create-preserved');
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
        allowResult({
          blockingErrors: [{ message: '@validator-required', field: 'title' }],
        })
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

    it('keeps advisory failures response-neutral in enforce mode', async function () {
      const advisoryErrors: RecordSaveIssue[] = [{
        message: '@validator-error-recommended',
        field: 'description',
        class: 'required',
      }];
      (global as any).RecordValidationService.resolve.resolves(
        allowResult({ mode: 'enforce', advisoryErrors })
      );

      const result = await RecordsService.create(
        { id: 'brand-1' },
        { metadata: { title: 'Valid primary record' } },
        { name: 'rdmp', hooks: {}, searchable: false },
        { username: 'user-1' }
      );

      expect(result.outcome).to.equal('saved');
      expect(result.problems).to.deep.equal([]);
      expect(mockStorageService.create.calledOnce).to.equal(true);
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
        componentDefinitions: [{
          name: 'title',
          component: { class: 'SimpleInputComponent' },
          model: {
            class: 'SimpleInputModel',
            config: {
              validators: [{ class: 'required', groups: { include: ['required-fields'] } }],
            },
          },
        }],
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
        loadForm: async (formName, brand) => ({
          id: `form-${formName}`,
          name: formName,
          branding: brand,
          configuration: authoritativeForm,
        } as FormAttributes),
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
      (global as any).FormsService.getFormByName.returns(of({
        name: 'default-form',
        configuration: authoritativeForm,
      }));
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
        expect(request.candidate.systemMarker).to.equal(undefined);
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
        { title: 'Replacement' }
      );

      expect(result.outcome).to.equal('not-saved');
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
    });

    it('preserves caller-completed merge metadata when building the authoritative update candidate', async function () {
      const stored = { ...baseRecord(), metadata: { title: 'Original', retained: 'keep' } };
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
        { title: 'Merged', retained: 'keep' }
      );

      expect(result.outcome).to.equal('not-saved');
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
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

    it('validates against stored fields without writing them back or exposing them to pre-save hooks', async function () {
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
        expect(persistedMutation).not.to.have.property('storageOnly');
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

    it('keeps soft delete and restore on their dedicated non-update storage boundaries', async function () {
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

      mockStorageService.restoreRecord.resolves({
        success: true,
        isSuccessful: () => true,
        metadata: record,
      });
      (global as any).BrandingService.getBrandById = sinon.stub().resolves({ id: 'brand-1' });
      const restoreResult = await RecordsService.restoreRecord('record-123', { username: 'user-1' });

      expect(restoreResult.success).to.equal(true);
      expect(resolve.notCalled).to.equal(true);
      expect(mockStorageService.delete.calledOnceWithExactly('record-123', false)).to.equal(true);
      expect(mockStorageService.restoreRecord.calledOnceWithExactly('record-123')).to.equal(true);
    });

    it('validates an authorized transition against its target step and target form', async function () {
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
      expect(mockStorageService.updateMeta.notCalled).to.equal(true);
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

    it('requires detached post-hook writes to enter RecordsService validation independently', async function () {
      mockStorageService.getMeta.resolves(baseRecord());
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(allowResult());
      let detachedWrite: Promise<any> | undefined;
      (globalThis as any).__detachedValidatedWrite = () => {
        detachedWrite = RecordsService.updateMeta(
          { id: 'brand-1' },
          'record-123',
          baseRecord('Detached mutation'),
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
            hooks: { onCreate: { post: [{ function: '() => globalThis.__detachedValidatedWrite()' }] } },
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
      const { createRecordSaveContext } = require('../../src/RecordSaveResponse');
      const resolve = (global as any).RecordValidationService.resolve as sinon.SinonStub;
      resolve.resolves(blockingResult());

      const result = await RecordsService.create(
        { id: 'brand-1' },
        {
          metadata: { title: 'HTTP payload' },
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

    it('fails closed for brand-less append/remove writes under record-type enforce when validation is unavailable', async function () {
      mockSails.config.recordValidation = { mode: 'shadow' };
      (global as any).RecordTypesService.get.returns(
        of({ name: 'rdmp', hooks: {}, searchable: false, recordValidation: { mode: 'enforce' } })
      );
      delete (global as any).RecordValidationService;
      delete mockSails.services.recordvalidationservice;

      const appendStored = baseRecord();
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
      expect((global as any).RecordTypesService.get.calledWith(null, 'rdmp')).to.equal(true);

      const rejectingService = { resolve: sinon.stub().rejects(new Error('validation unavailable')) };
      mockSails.services.recordvalidationservice = rejectingService;
      mockStorageService.updateMeta.resetHistory();
      const removeStored = {
        ...baseRecord(),
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
    });
  });

  describe('Effect hook lifecycle integration', function () {
    function recordTypeWithHooks(hooks: any): any {
      return { name: 'rdmp', searchable: false, hooks };
    }

    it('preserves create ordering and keeps execution metadata out of the business record', async function () {
      const order: string[] = [];
      (globalThis as any).__effectHookOrder = order;
      mockStorageService.create.callsFake(async () => {
        order.push('persistence');
        return { success: true, oid: 'created-1', applicationState: 'applied' };
      });
      mockStorageService.updateMeta.callsFake(async () => {
        order.push('postSync-persistence');
        return { success: true, oid: 'created-1', applicationState: 'applied' };
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

    it('does not substitute fallback metadata when the committed snapshot cannot be loaded', async function () {
      mockStorageService.getMeta.rejects(new Error('snapshot unavailable'));
      const audit = sinon.stub(RecordsService, 'auditRecord');

      const result = await (RecordsService as any).finishSave(persistedTracker(), {}, 'updated', true);

      expect(result.oid).to.equal('tracker-oid');
      expect(mockSearchService.index.notCalled).to.equal(true);
      expect(audit.notCalled).to.equal(true);
    });

    it('uses the tracker oid and does not await index or audit submissions', async function () {
      mockStorageService.getMeta.resolves({ redboxOid: 'tracker-oid', metadata: { committed: true } });
      mockSearchService.index.callsFake(() => new Promise(() => undefined));
      sinon.stub(RecordsService, 'auditRecord').callsFake(() => new Promise(() => undefined));

      const result = await (RecordsService as any).finishSave(persistedTracker(), {}, 'updated', true);
      await Promise.resolve();

      expect(result.oid).to.equal('tracker-oid');
      expect(mockStorageService.getMeta.calledWith('tracker-oid')).to.equal(true);
      expect(
        mockSearchService.index.calledWith('tracker-oid', sinon.match({ metadata: { committed: true } }))
      ).to.equal(true);
    });
  });

  describe('createBatch', function () {
    it('publishes createRecordAudit as a required StorageService capability', function () {
      type IsRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;
      const createRecordAuditIsRequired: IsRequired<StorageService, 'createRecordAudit'> = true;

      expect(createRecordAuditIsRequired).to.equal(true);
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
