let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/DashboardTypesService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';

describe('DashboardTypesService', function() {
  let service: Services.DashboardTypes;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.dashboardtype = {
      'standard': { searchFilters: [], formatRules: {} }
    };
    mockSails.config.appmode = { bootstrapAlways: false };
    
    setupServiceTestGlobals(mockSails);
    
    const mockDeferred = (result: unknown) => {
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    };

    (global as any).DashboardType = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      create: sinon.stub().callsFake(() => mockDeferred({})),
      destroy: sinon.stub().callsFake(() => mockDeferred([])),
      findOne: sinon.stub().callsFake(() => mockDeferred({}))
    };

    (global as any).RecordTypesService = {
      get: sinon.stub()
    };

    (global as any).WorkflowStepsService = {
      get: sinon.stub()
    };
    
    service = new Services.DashboardTypes();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).DashboardType;
    delete (global as any).RecordTypesService;
    delete (global as any).WorkflowStepsService;
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('should load existing dashboard types', async function() {
      const brand = { id: 'brand1' };
      const existing = [{ name: 'standard' }];
      
      (global as any).DashboardType.find.callsFake(() => {
          const p: any = Promise.resolve(existing);
          p.exec = sinon.stub().yields(null, existing);
          return p;
      });
      
      const result = await service.bootstrap(brand as any);
      expect(result).to.deep.equal(existing);
    });

    it('should create default dashboard types if missing', async function() {
      const brand = { id: 'brand1' };
      // find returns [] by default from beforeEach
      
      const createDeferred = (data: any) => {
          const p: any = Promise.resolve(data);
          p.exec = sinon.stub().yields(null, data);
          return p;
      };
      (global as any).DashboardType.create.callsFake((data: any) => createDeferred(data));
      
      const result = await service.bootstrap(brand as any);
      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('standard');
    });
  });

  describe('getDashboardTableConfig', function() {
    it('should return config from workflow step', async function() {
      const brand = { id: 'brand1' };
      const recordType = 'rt';
      const workflowStage = 'ws';
      
      (global as any).RecordTypesService.get.returns(of({ name: 'rt' }));
      (global as any).WorkflowStepsService.get.returns(of({ 
        config: { 
          dashboard: { 
            table: { rowConfig: [] } 
          } 
        } 
      }));
      
      const result = await service.getDashboardTableConfig(brand as any, recordType, workflowStage);
      expect(result).to.have.property('rowConfig');
    });

    it('should return null if record type not found', async function() {
      const brand = { id: 'brand1' };
      (global as any).RecordTypesService.get.returns(of(null));
      
      const result = await service.getDashboardTableConfig(brand as any, 'rt', 'ws');
      expect(result).to.be.null;
    });
  });
});
