let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of, firstValueFrom } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject, configureModelMethod } from './testHelper';

describe('RDMPService', function() {
  let mockSails: any;
  let RDMPService: any;
  let mockUser: any;
  let mockCounter: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        record: {
          processRecordCountersLogLevel: 'verbose',
          checkTotalSizeOfFilesInRecordLogLevel: 'verbose',
          maxUploadSize: 1073741824 // 1GB
        },
        queue: {
          serviceName: 'agendaqueueservice'
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
        agendaqueueservice: {
          now: sinon.stub().resolves({})
        }
      }
    });

    mockUser = {
      findOne: sinon.stub().returns(createQueryObject(null))
    };

    mockCounter = {
      findOrCreate: sinon.stub().returns(createQueryObject([{ id: 'counter-1', name: 'rdmpId', value: 100 }])),
      updateOne: sinon.stub().returns(createQueryObject({ id: 'counter-1', value: 101 }))
    };

    setupServiceTestGlobals(mockSails);
    (global as any).User = mockUser;
    (global as any).Counter = mockCounter;
    (global as any).RecordType = {
      findOne: sinon.stub()
    };
    (global as any).RecordsService = {
      getMeta: sinon.stub().resolves({}),
      updateMeta: sinon.stub().resolves({}),
      hasEditAccess: sinon.stub().returns(true),
      hasViewAccess: sinon.stub().returns(true)
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };
    (global as any).UsersService = {
      hasRole: sinon.stub().returns(false)
    };
    (global as any).RolesService = {
      getAdminFromBrand: sinon.stub().returns({ id: 'admin-role', name: 'Admin' })
    };
    (global as any).WorkflowStepsService = {
      get: sinon.stub().resolves([])
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key),
      tInter: sinon.stub().callsFake((msg: string, params: any) => msg)
    };
    (global as any).WorkspaceService = {
      addWorkspaceToRecord: sinon.stub().resolves({}),
      removeWorkspaceFromRecord: sinon.stub().resolves({})
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/RDMPService');
    RDMPService = new Services.RDMPS();
    RDMPService.queueService = mockSails.services.agendaqueueservice;
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).User;
    delete (global as any).Counter;
    delete (global as any).RecordType;
    delete (global as any).RecordsService;
    delete (global as any).BrandingService;
    delete (global as any).UsersService;
    delete (global as any).RolesService;
    delete (global as any).WorkflowStepsService;
    delete (global as any).TranslationService;
    delete (global as any).WorkspaceService;
    sinon.restore();
  });

  describe('formatBytes', function() {
    it('should return 0 Bytes for 0', function() {
      const result = (RDMPService as any).formatBytes(0);
      expect(result).to.equal('0 Bytes');
    });

    it('should format bytes correctly', function() {
      const result = (RDMPService as any).formatBytes(500);
      expect(result).to.equal('500 Bytes');
    });

    it('should format kilobytes correctly', function() {
      const result = (RDMPService as any).formatBytes(1024);
      expect(result).to.equal('1 KB');
    });

    it('should format megabytes correctly', function() {
      const result = (RDMPService as any).formatBytes(1048576);
      expect(result).to.equal('1 MB');
    });

    it('should format gigabytes correctly', function() {
      const result = (RDMPService as any).formatBytes(1073741824);
      expect(result).to.equal('1 GB');
    });

    it('should format with custom decimals', function() {
      const result = (RDMPService as any).formatBytes(1536, 1);
      expect(result).to.equal('1.5 KB');
    });

    it('should handle large files (TB)', function() {
      const result = (RDMPService as any).formatBytes(1099511627776);
      expect(result).to.equal('1 TB');
    });
  });

  describe('addEmailToList', function() {
    it('should add email from contributor object', function() {
      const contributor = { email: 'user@test.com', name: 'Test User' };
      const emailList: string[] = [];
      
      (RDMPService as any).addEmailToList(contributor, 'email', emailList);
      
      expect(emailList).to.include('user@test.com');
    });

    it('should add email and convert to lowercase', function() {
      const contributor = { email: 'User@Test.COM', name: 'Test User' };
      const emailList: string[] = [];
      
      (RDMPService as any).addEmailToList(contributor, 'email', emailList);
      
      expect(emailList).to.include('user@test.com');
    });

    it('should handle email string directly', function() {
      const emailList: string[] = [];
      
      (RDMPService as any).addEmailToList('direct@email.com', 'email', emailList);
      
      expect(emailList).to.include('direct@email.com');
    });

    it('should handle array of emails by taking first', function() {
      const contributor = { email: ['first@test.com', 'second@test.com'] };
      const emailList: string[] = [];
      
      (RDMPService as any).addEmailToList(contributor, 'email', emailList);
      
      expect(emailList).to.include('first@test.com');
      expect(emailList).to.not.include('second@test.com');
    });

    it('should not add null contributor', function() {
      const emailList: string[] = [];
      
      (RDMPService as any).addEmailToList(null, 'email', emailList);
      
      expect(emailList).to.be.empty;
    });

    it('should not add empty email', function() {
      const contributor = { email: '', name: 'Test' };
      const emailList: string[] = [];
      
      (RDMPService as any).addEmailToList(contributor, 'email', emailList);
      
      expect(emailList).to.be.empty;
    });

    it('should preserve case when lowerCaseEmailAddresses is false', function() {
      const contributor = { email: 'User@Test.COM' };
      const emailList: string[] = [];
      
      (RDMPService as any).addEmailToList(contributor, 'email', emailList, false);
      
      expect(emailList).to.include('User@Test.COM');
    });
  });

  describe('populateContribList', function() {
    it('should populate email list from contributor properties', function() {
      const record = {
        metadata: {
          contributors: [
            { email: 'user1@test.com' },
            { email: 'user2@test.com' }
          ]
        }
      };
      const emailList: string[] = [];
      
      const result = (RDMPService as any).populateContribList(
        ['metadata.contributors'],
        record,
        'email',
        emailList
      );
      
      expect(result).to.include('user1@test.com');
      expect(result).to.include('user2@test.com');
    });

    it('should return unique emails', function() {
      const record = {
        metadata: {
          contributors: [
            { email: 'same@test.com' },
            { email: 'same@test.com' }
          ]
        }
      };
      const emailList: string[] = [];
      
      const result = (RDMPService as any).populateContribList(
        ['metadata.contributors'],
        record,
        'email',
        emailList
      );
      
      expect(result).to.have.length(1);
    });

    it('should handle single contributor (not array)', function() {
      const record = {
        metadata: {
          owner: { email: 'owner@test.com' }
        }
      };
      const emailList: string[] = [];
      
      const result = (RDMPService as any).populateContribList(
        ['metadata.owner'],
        record,
        'email',
        emailList
      );
      
      expect(result).to.include('owner@test.com');
    });

    it('should handle missing contributor property', function() {
      const record = { metadata: {} };
      const emailList: string[] = [];
      
      const result = (RDMPService as any).populateContribList(
        ['metadata.nonexistent'],
        record,
        'email',
        emailList
      );
      
      expect(result).to.be.empty;
    });
  });

  describe('getContribListByRule', function() {
    it('should filter contributors by rule', function() {
      const record = {
        metadata: {
          contributors: [
            { email: 'editor@test.com', role: 'editor' },
            { email: 'viewer@test.com', role: 'viewer' }
          ]
        }
      };
      const emailList: string[] = [];
      const rule = '<%= role === "editor" %>';
      
      const result = (RDMPService as any).getContribListByRule(
        ['metadata.contributors'],
        record,
        rule,
        'email',
        emailList
      );
      
      expect(result).to.include('editor@test.com');
      expect(result).to.not.include('viewer@test.com');
    });

    it('should handle single contributor matching rule', function() {
      const record = {
        metadata: {
          owner: { email: 'owner@test.com', canEdit: true }
        }
      };
      const emailList: string[] = [];
      const rule = '<%= canEdit === true %>';
      
      const result = (RDMPService as any).getContribListByRule(
        ['metadata.owner'],
        record,
        rule,
        'email',
        emailList
      );
      
      expect(result).to.include('owner@test.com');
    });

    it('should return empty list when rule matches nothing', function() {
      const record = {
        metadata: {
          contributors: [
            { email: 'user@test.com', role: 'viewer' }
          ]
        }
      };
      const emailList: string[] = [];
      const rule = '<%= role === "admin" %>';
      
      const result = (RDMPService as any).getContribListByRule(
        ['metadata.contributors'],
        record,
        rule,
        'email',
        emailList
      );
      
      expect(result).to.be.empty;
    });
  });

  describe('filterPending', function() {
    it('should move found users to userList and remove from emails', function() {
      const users = [
        { username: 'user1', email: 'user1@test.com' },
        null,
        { username: 'user2', email: 'user2@test.com' }
      ];
      const userEmails = ['user1@test.com', 'user2@test.com', 'pending@test.com'];
      const userList: string[] = [];
      
      (RDMPService as any).filterPending(users, userEmails, userList);
      
      expect(userList).to.include('user1');
      expect(userList).to.include('user2');
      expect(userEmails).to.include('pending@test.com');
      expect(userEmails).to.not.include('user1@test.com');
    });
  });

  describe('processRecordCounters', function() {
    it('should increment global counter', async function() {
      const record = {
        metaMetadata: { brandId: 'brand-1' },
        metadata: {}
      };
      const options = {
        counters: [{
          field_name: 'rdmpId',
          strategy: 'global',
          prefix: 'RDMP-'
        }]
      };
      
      const result = await RDMPService.processRecordCounters('oid-1', record, options, {});
      
      expect(result.metadata.rdmpId).to.equal('RDMP-101');
    });

    it('should increment field counter', async function() {
      const record = {
        metaMetadata: { brandId: 'brand-1' },
        metadata: { counter: '5' }
      };
      const options = {
        counters: [{
          field_name: 'counter',
          strategy: 'field',
          prefix: ''
        }]
      };
      
      const result = await RDMPService.processRecordCounters('oid-1', record, options, {});
      
      expect(result.metadata.counter).to.equal('6');
    });

    it('should start field counter at 1 if empty', async function() {
      const record = {
        metaMetadata: { brandId: 'brand-1' },
        metadata: {}
      };
      const options = {
        counters: [{
          field_name: 'version',
          strategy: 'field',
          prefix: 'v'
        }]
      };
      
      const result = await RDMPService.processRecordCounters('oid-1', record, options, {});
      
      expect(result.metadata.version).to.equal('v1');
    });

    it('should handle template in counter', async function() {
      const record = {
        metaMetadata: { brandId: 'brand-1' },
        metadata: {}
      };
      const options = {
        counters: [{
          field_name: 'formattedId',
          strategy: 'field',
          prefix: '',
          template: '<%= newVal.toString().padStart(5, "0") %>'
        }]
      };
      
      const result = await RDMPService.processRecordCounters('oid-1', record, options, {});
      
      expect(result.metadata.formattedId).to.equal('00001');
    });
  });

  describe('checkTotalSizeOfFilesInRecord', function() {
    it('should pass when no data locations', function() {
      const record = { metadata: {} };
      
      const result = RDMPService.checkTotalSizeOfFilesInRecord('oid-1', record, {}, {});
      
      expect(result).to.deep.equal(record);
    });

    it('should pass when total size is under limit', function() {
      const record = {
        metadata: {
          dataLocations: [
            { type: 'attachment', size: '1000' },
            { type: 'attachment', size: '2000' }
          ]
        }
      };
      
      const result = RDMPService.checkTotalSizeOfFilesInRecord('oid-1', record, {}, {});
      
      expect(result).to.deep.equal(record);
    });

    it('should throw when total size exceeds limit', function() {
      mockSails.config.record.maxUploadSize = 1000;
      
      const record = {
        metadata: {
          dataLocations: [
            { type: 'attachment', size: '600' },
            { type: 'attachment', size: '600' }
          ]
        }
      };
      
      expect(() => {
        RDMPService.checkTotalSizeOfFilesInRecord('oid-1', record, {}, {});
      }).to.throw();
    });

    it('should use custom error message code', function() {
      mockSails.config.record.maxUploadSize = 1000;
      
      const record = {
        metadata: {
          dataLocations: [
            { type: 'attachment', size: '2000' }
          ]
        }
      };
      const options = {
        maxUploadSizeMessageCode: 'custom-error-key',
        replaceOrAppend: 'replace'
      };
      
      expect(() => {
        RDMPService.checkTotalSizeOfFilesInRecord('oid-1', record, options, {});
      }).to.throw();
      
      expect((global as any).TranslationService.t.calledWith('custom-error-key')).to.be.true;
    });

    it('should skip records with no attachments', function() {
      const record = {
        metadata: {
          dataLocations: [
            { type: 'url', size: '999999' }
          ]
        }
      };
      
      // Should not throw because there are no attachments
      const result = RDMPService.checkTotalSizeOfFilesInRecord('oid-1', record, {}, {});
      expect(result).to.exist;
    });
  });

  describe('stripUserBasedPermissions', function() {
    it('should strip edit permissions', async function() {
      const record: any = {
        authorization: {
          edit: ['user1', 'user2'],
          editPending: ['pending@test.com']
        }
      };
      const options = { permissionTypes: 'edit' };
      
      // Mock metTriggerCondition to return true
      sinon.stub(RDMPService, 'metTriggerCondition').returns('true');
      
      const result: any = await firstValueFrom(RDMPService.stripUserBasedPermissions('oid-1', record, options, {}));
      
      expect(result.authorization.edit).to.be.empty;
      expect(result.authorization.editPending).to.be.empty;
      expect(result.authorization.stored.edit).to.deep.equal(['user1', 'user2']);
    });

    it('should strip both view and edit permissions', async function() {
      const record: any = {
        authorization: {
          edit: ['editor'],
          view: ['viewer'],
          editPending: [],
          viewPending: []
        }
      };
      const options = { permissionTypes: 'view&edit' };
      
      sinon.stub(RDMPService, 'metTriggerCondition').returns('true');
      
      const result: any = await firstValueFrom(RDMPService.stripUserBasedPermissions('oid-1', record, options, {}));
      
      expect(result.authorization.edit).to.be.empty;
      expect(result.authorization.view).to.be.empty;
    });
  });

  describe('restoreUserBasedPermissions', function() {
    it('should restore stored permissions', async function() {
      const record: any = {
        authorization: {
          edit: [],
          view: [],
          stored: {
            edit: ['user1', 'user2'],
            view: ['viewer1']
          }
        }
      };
      const options = {};
      
      sinon.stub(RDMPService, 'metTriggerCondition').returns('true');
      
      const result: any = await firstValueFrom(RDMPService.restoreUserBasedPermissions('oid-1', record, options, {}));
      
      expect(result.authorization.edit).to.deep.equal(['user1', 'user2']);
      expect(result.authorization.view).to.deep.equal(['viewer1']);
      expect(result.authorization.stored).to.be.undefined;
    });

    it('should restore pending permissions', async function() {
      const record: any = {
        authorization: {
          edit: [],
          view: [],
          editPending: [],
          viewPending: [],
          stored: {
            edit: ['user1'],
            view: ['viewer1'],
            editPending: ['pending-edit@test.com'],
            viewPending: ['pending-view@test.com']
          }
        }
      };
      const options = {};
      
      sinon.stub(RDMPService, 'metTriggerCondition').returns('true');
      
      const result: any = await firstValueFrom(RDMPService.restoreUserBasedPermissions('oid-1', record, options, {}));
      
      expect(result.authorization.editPending).to.deep.equal(['pending-edit@test.com']);
      expect(result.authorization.viewPending).to.deep.equal(['pending-view@test.com']);
    });
  });

  describe('runTemplates', function() {
    it('should run templates and set field values', async function() {
      const record: any = {
        metadata: { title: 'Test Title' }
      };
      const options = {
        templates: [{
          field: 'metadata.description',
          template: 'Record: <%= record.metadata.title %>'
        }]
      };
      
      const result: any = await firstValueFrom(RDMPService.runTemplates('oid-1', record, options, {}));
      
      expect(result.metadata.description).to.equal('Record: Test Title');
    });

    it('should handle multiple templates', async function() {
      const record: any = {
        metadata: { name: 'Test' }
      };
      const options = {
        templates: [
          { field: 'metadata.field1', template: 'Value1: <%= record.metadata.name %>' },
          { field: 'metadata.field2', template: 'Value2: <%= record.metadata.name %>' }
        ]
      };
      
      const result: any = await firstValueFrom(RDMPService.runTemplates('oid-1', record, options, {}));
      
      expect(result.metadata.field1).to.equal('Value1: Test');
      expect(result.metadata.field2).to.equal('Value2: Test');
    });

    it('should parse JSON when parseObject is true', async function() {
      const record: any = { metadata: {} };
      const options = {
        parseObject: true,
        templates: [{
          field: 'metadata.config',
          template: '{"enabled": true, "count": 5}'
        }]
      };
      
      const result: any = await firstValueFrom(RDMPService.runTemplates('oid-1', record, options, {}));
      
      expect(result.metadata.config).to.deep.equal({ enabled: true, count: 5 });
    });

    it('should throw error for invalid template', async function() {
      const record = { metadata: {} };
      const options = {
        templates: [{
          field: 'metadata.test',
          template: '<%= invalidVariable.property %>'
        }]
      };
      
      try {
        await firstValueFrom(RDMPService.runTemplates('oid-1', record, options, {}));
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('addWorkspaceToRecord', function() {
    it('should add workspace to record', async function() {
      const workspaceData = {
        metadata: { rdmpOid: 'rdmp-123' }
      };
      const response = {};
      
      const result = await RDMPService.addWorkspaceToRecord('ws-1', workspaceData, {}, {}, response);
      
      expect((global as any).WorkspaceService.addWorkspaceToRecord.calledWith('rdmp-123', 'ws-1')).to.be.true;
      expect(response).to.have.property('workspaceOid', 'ws-1');
    });

    it('should return workspace data when no rdmpOid', async function() {
      const workspaceData = {
        metadata: {}
      };
      const response = {};
      
      const result = await RDMPService.addWorkspaceToRecord('ws-1', workspaceData, {}, {}, response);
      
      expect((global as any).WorkspaceService.addWorkspaceToRecord.called).to.be.false;
      expect(result).to.deep.equal(workspaceData);
    });

    it('should use custom rdmpOidField', async function() {
      const workspaceData = {
        metadata: { customRdmpField: 'rdmp-custom' }
      };
      const options = { rdmpOidField: 'customRdmpField' };
      const response = {};
      
      await RDMPService.addWorkspaceToRecord('ws-1', workspaceData, options, {}, response);
      
      // The method uses rdmpOid from metadata regardless of rdmpOidField in the WorkspaceService call
      expect((global as any).WorkspaceService.addWorkspaceToRecord.called).to.be.true;
    });
  });

  describe('removeWorkspaceFromRecord', function() {
    it('should remove workspace from record', async function() {
      const workspaceData = {
        metadata: { rdmpOid: 'rdmp-123' }
      };
      const response = {};
      
      const result = await RDMPService.removeWorkspaceFromRecord('ws-1', workspaceData, {}, {}, response);
      
      expect((global as any).WorkspaceService.removeWorkspaceFromRecord.calledWith('rdmp-123', 'ws-1')).to.be.true;
      expect(response).to.have.property('workspaceOid', 'ws-1');
    });

    it('should return workspace data when no rdmpOid', async function() {
      const workspaceData = {
        metadata: {}
      };
      const response = {};
      
      const result = await RDMPService.removeWorkspaceFromRecord('ws-1', workspaceData, {}, {}, response);
      
      expect((global as any).WorkspaceService.removeWorkspaceFromRecord.called).to.be.false;
      expect(result).to.deep.equal(workspaceData);
    });
  });

  describe('queueTriggerCall', function() {
    it('should queue trigger when no condition', async function() {
      const record = { metadata: {} };
      const options = {
        jobName: 'testJob',
        triggerConfiguration: { function: 'testFn' }
      };
      
      const result = await firstValueFrom(RDMPService.queueTriggerCall('oid-1', record, options, {}));
      
      expect(RDMPService.queueService.now.calledWith('testJob')).to.be.true;
      expect(result).to.deep.equal(record);
    });

    it('should queue trigger when condition is met', async function() {
      const record = { metadata: {} };
      const options = {
        jobName: 'testJob',
        triggerConfiguration: {},
        triggerCondition: 'true'
      };
      
      sinon.stub(RDMPService, 'metTriggerCondition').returns('true');
      
      const result = await firstValueFrom(RDMPService.queueTriggerCall('oid-1', record, options, {}));
      
      expect(RDMPService.queueService.now.called).to.be.true;
    });
  });

  describe('assignPermissions', function() {
    it('should return record when trigger condition not met', async function() {
      const record = {
        metadata: {},
        authorization: {}
      };
      const options = {
        triggerCondition: 'false'
      };
      
      sinon.stub(RDMPService, 'metTriggerCondition').returns('false');
      
      const result = await firstValueFrom(RDMPService.assignPermissions('oid-1', record, options));
      
      expect(result).to.deep.equal(record);
    });

    it('should assign permissions based on contributor properties', async function() {
      const record = {
        metadata: {
          editors: [{ email: 'editor@test.com' }],
          viewers: [{ email: 'viewer@test.com' }]
        },
        metaMetadata: { createdBy: 'creator' },
        authorization: {}
      };
      const options = {
        editContributorProperties: ['metadata.editors'],
        viewContributorProperties: ['metadata.viewers'],
        emailProperty: 'email',
        recordCreatorPermissions: 'view&edit'
      };
      
      // Mock user lookups
      configureModelMethod(mockUser.findOne, { username: 'editorUser', email: 'editor@test.com' });
      
      const result = await firstValueFrom(RDMPService.assignPermissions('oid-1', record, options));
      
      expect(result).to.exist;
    });
  });

  describe('complexAssignPermissions', function() {
    it('should return record when trigger condition not met', async function() {
      const record = {
        metadata: {},
        authorization: {}
      };
      const options = {
        triggerCondition: 'false'
      };
      
      sinon.stub(RDMPService, 'metTriggerCondition').returns('false');
      
      const result = await firstValueFrom(RDMPService.complexAssignPermissions('oid-1', record, options));
      
      expect(result).to.deep.equal(record);
    });

    it('should assign permissions based on rules', async function() {
      const record = {
        metadata: {
          contributors: [
            { email: 'editor@test.com', role: 'editor' },
            { email: 'viewer@test.com', role: 'viewer' }
          ]
        },
        metaMetadata: { createdBy: 'creator' },
        authorization: {}
      };
      const options = {
        userProperties: ['metadata.contributors'],
        editPermissionRule: '<%= role === "editor" %>',
        viewPermissionRule: '<%= role === "viewer" %>',
        emailProperty: 'email'
      };
      
      const result = await firstValueFrom(RDMPService.complexAssignPermissions('oid-1', record, options));
      
      expect(result).to.exist;
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = RDMPService.exports();

      expect(exported).to.have.property('assignPermissions');
      expect(exported).to.have.property('complexAssignPermissions');
      expect(exported).to.have.property('processRecordCounters');
      expect(exported).to.have.property('stripUserBasedPermissions');
      expect(exported).to.have.property('restoreUserBasedPermissions');
      expect(exported).to.have.property('runTemplates');
      expect(exported).to.have.property('addWorkspaceToRecord');
      expect(exported).to.have.property('removeWorkspaceFromRecord');
      expect(exported).to.have.property('queueTriggerCall');
      expect(exported).to.have.property('queuedTriggerSubscriptionHandler');
      expect(exported).to.have.property('checkTotalSizeOfFilesInRecord');
    });
  });
});
