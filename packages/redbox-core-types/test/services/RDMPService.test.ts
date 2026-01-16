import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('RDMPService', function() {
  let mockSails: any;
  let RDMPService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app'
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      }
    });

    setupServiceTestGlobals(mockSails);
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
      t: sinon.stub().callsFake((key: string) => key)
    };
    (global as any).WorkspaceService = {
      addWorkspaceToRecord: sinon.stub().resolves({})
    };
    (global as any).RecordType = {
      findOne: sinon.stub()
    };
    (global as any).Counter = {
      findOne: sinon.stub(),
      update: sinon.stub()
    };
    (global as any).User = {
      findOne: sinon.stub()
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/RDMPService');
    RDMPService = new Services.RDMPS();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    delete (global as any).BrandingService;
    delete (global as any).UsersService;
    delete (global as any).RolesService;
    delete (global as any).WorkflowStepsService;
    delete (global as any).TranslationService;
    delete (global as any).WorkspaceService;
    delete (global as any).RecordType;
    delete (global as any).Counter;
    delete (global as any).User;
    sinon.restore();
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = RDMPService.exports();

      expect(exported).to.have.property('assignPermissions');
      expect(exported).to.have.property('complexAssignPermissions');
      expect(exported).to.have.property('processRecordCounters');
      expect(exported).to.have.property('runTemplates');
    });
  });
});
