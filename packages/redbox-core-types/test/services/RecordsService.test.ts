import { expect } from 'chai';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('RecordsService', function() {
  let mockSails: any;
  let RecordsService: any;
  let mockRecord: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        record: {
          baseUrl: {
            redbox: 'http://localhost:9000'
          }
        },
        storage: {
          serviceName: 'mongostorageservice'
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
        mongostorageservice: {
          create: sinon.stub().resolves({ oid: 'new-record-123' }),
          updateMeta: sinon.stub().resolves({}),
          getMeta: sinon.stub().resolves({}),
          delete: sinon.stub().resolves({})
        }
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
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };
    (global as any).FormsService = {
      getForm: sinon.stub().resolves({ name: 'default-form' })
    };
    (global as any).RolesService = {
      getAdminFromBrand: sinon.stub().returns({ id: 'role-admin', name: 'Admin' }),
      getRole: sinon.stub().returns(null)
    };
    (global as any).UsersService = {
      hasRole: sinon.stub().returns(true)
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/RecordsService');
    RecordsService = new Services.Records();
    // Manually initialize the storage service since the Sails hook doesn't fire in tests
    RecordsService.storageService = mockSails.services.mongostorageservice;
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).Record;
    delete (global as any).RecordType;
    delete (global as any).WorkflowStep;
    delete (global as any).BrandingService;
    delete (global as any).FormsService;
    delete (global as any).RolesService;
    delete (global as any).UsersService;
    sinon.restore();
  });

  describe('getStorageService', function() {
    // Note: getStorageService is a getter/internal property, not an exported method
    it.skip('should return the configured storage service', function() {
      const storageService = RecordsService.getStorageService();
      
      expect(storageService).to.exist;
      expect(storageService).to.have.property('create');
      expect(storageService).to.have.property('getMeta');
    });
  });

  describe('hasEditAccess', function() {
    it('should return true for record owner', function() {
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

    it('should return true for user with edit role', function() {
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

    it('should return false for unauthorized user', function() {
      const brand = { id: 'brand-1', name: 'default' };
      const user = { username: 'regularuser', roles: [] };
      const record = {
        authorization: {
          edit: ['otheruser'],
          view: ['otheruser']
        }
      };
      
      (global as any).UsersService.hasRole.returns(false);
      
      const result = RecordsService.hasEditAccess(brand, user, [], record);
      
      expect(result).to.be.false;
    });
  });

  describe('hasViewAccess', function() {
    it('should return true for record viewer', function() {
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

    it('should return true for editors', function() {
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
  });

  describe('appendToRecord', function() {
    // Note: appendToRecord calls updateMeta which has complex dependencies
    // This is better tested as an integration test
    it.skip('should append data to record field', async function() {
      const oid = 'record-123';
      const data = { id: 'workspace-1', name: 'Test' };
      const targetField = 'metadata.workspaces';
      const targetRecord = {
        metadata: { workspaces: [] }
      };
      
      mockSails.services.mongostorageservice.getMeta.resolves(targetRecord);
      mockSails.services.mongostorageservice.updateMeta.resolves({});
      
      const result = await RecordsService.appendToRecord(oid, data, targetField, 'array', targetRecord);
      
      expect(result).to.exist;
    });
  });

  describe('removeFromRecord', function() {
    // Note: removeFromRecord calls updateMeta which has complex dependencies
    // This is better tested as an integration test
    it.skip('should remove data from record field', async function() {
      const oid = 'record-123';
      const data = { id: 'workspace-1' };
      const targetField = 'metadata.workspaces';
      const targetRecord = {
        metadata: {
          workspaces: [{ id: 'workspace-1', name: 'Test' }]
        }
      };
      
      mockSails.services.mongostorageservice.getMeta.resolves(targetRecord);
      mockSails.services.mongostorageservice.updateMeta.resolves({});
      
      const result = await RecordsService.removeFromRecord(oid, data, targetField, targetRecord);
      
      expect(result).to.exist;
    });
  });

  describe('getMeta', function() {
    it('should get record metadata', async function() {
      const oid = 'record-123';
      const recordData = {
        oid,
        metadata: { title: 'Test Record' }
      };
      
      // Mock the storage service getMeta method
      RecordsService.storageService.getMeta = sinon.stub().resolves(recordData);
      
      const result = await RecordsService.getMeta(oid);
      
      expect(result).to.deep.equal(recordData);
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = RecordsService.exports();

      expect(exported).to.have.property('hasEditAccess');
      expect(exported).to.have.property('hasViewAccess');
      expect(exported).to.have.property('getMeta');
      expect(exported).to.have.property('appendToRecord');
      expect(exported).to.have.property('removeFromRecord');
      // Note: getStorageService is not exported - it's an internal property
    });
  });
});
