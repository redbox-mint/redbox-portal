import { expect } from 'chai';
import * as sinon from 'sinon';
import { of, firstValueFrom } from 'rxjs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
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
      now: sinon.stub()
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
      hasRole: sinon.stub().returns(true)
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

  describe('constructor', function () {
    it('should set logHeader', function () {
      expect(RecordsService.logHeader).to.equal('RecordsService::');
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
          data: { id: 'record-123', action: 'updated' }
        }
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
      const form = { attachmentFields: ['dataLocations'] };

      const result = (RecordsService as any).initRecordMetaMetadata(
        'brand-1', 'testuser', recordType, workflowStep, form, '2024-01-01T00:00:00Z'
      );

      expect(result).to.have.property('brandId', 'brand-1');
      expect(result).to.have.property('createdBy', 'testuser');
      expect(result).to.have.property('type', 'rdmp');
      expect(result).to.have.property('packageType', 'rdmp');
      expect(result).to.have.property('form', 'default-form');
      expect(result).to.have.property('attachmentFields', form.attachmentFields);
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
