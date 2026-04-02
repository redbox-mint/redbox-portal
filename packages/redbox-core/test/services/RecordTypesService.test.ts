let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/RecordTypesService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';

describe('RecordTypesService', function() {
  let service: Services.RecordTypes;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.recordtype = {
      'dataset': {
        packageType: 'pt',
        searchCore: 'sc',
        searchFilters: [],
        hooks: {},
        transferResponsibility: false,
        relatedTo: [],
        searchable: true,
        dashboard: {}
      }
    };
    mockSails.config.appmode = { bootstrapAlways: false };
    
    setupServiceTestGlobals(mockSails);
    
    const mockDeferred = (result: unknown) => ({
      exec: sinon.stub().yields(null, result)
    });

    (global as any).RecordType = {
      find: sinon.stub().returns(mockDeferred([])),
      create: sinon.stub().returns(mockDeferred({})),
      destroy: sinon.stub().returns(mockDeferred([])),
      findOne: sinon.stub().returns(mockDeferred({}))
    };
    
    service = new Services.RecordTypes();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordType;
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('should load existing record types', async function() {
      const brand = { id: 'brand1' };
      const existingTypes = [{ name: 'dataset', branding: 'brand1' }];
      
      const findStub = sinon.stub().resolves(existingTypes);
      (global as any).RecordType.find = findStub;
      
      const result = await service.bootstrap(brand as any);
      
      expect(result).to.deep.equal(existingTypes);
      expect(service.getAllCache()).to.deep.equal(existingTypes);
    });

    it('should create default record types if missing', async function() {
      const brand = { id: 'brand1' };
      
      const findStub = sinon.stub().resolves([]);
      (global as any).RecordType.find = findStub;
      
      const createDeferred = (data: unknown) => ({
        exec: sinon.stub().yields(null, data)
      });
      (global as any).RecordType.create.callsFake((data: unknown) => createDeferred(data));
      
      const result = await service.bootstrap(brand as any);
      
      expect(result).to.have.length(1);
      expect(result[0]).to.have.property('name', 'dataset');
      expect((global as any).RecordType.create.called).to.be.true;
    });

    it('should destroy and recreate if bootstrapAlways is true', async function() {
      mockSails.config.appmode.bootstrapAlways = true;
      const brand = { id: 'brand1' };
      
      (global as any).RecordType.find.resolves([{ name: 'old' }]);
      (global as any).RecordType.destroy.resolves([]);
      
      const createDeferred = (data: unknown) => ({
        exec: sinon.stub().yields(null, data)
      });
      (global as any).RecordType.create.callsFake((data: unknown) => createDeferred(data));
      
      const result = await service.bootstrap(brand as any);
      
      expect((global as any).RecordType.destroy.called).to.be.true;
      expect((global as any).RecordType.create.called).to.be.true;
      expect(result).to.have.length(1);
    });
  });

  describe('create', function() {
    it('should create record type', async function() {
      const brand = { id: 'brand1' };
      const config = { packageType: 'pt' };
      const expected = { name: 'newType', packageType: 'pt' };
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).RecordType.create.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.create(brand as any, 'newType', config as any).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
    });
  });

  describe('get', function() {
    it('should find one record type', async function() {
      const brand = { id: 'brand1' };
      const expected = { name: 'type1' };
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).RecordType.findOne.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.get(brand as any, 'type1').subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).RecordType.findOne.calledWith(sinon.match({ where: { name: 'type1' } }))).to.be.true;
    });
  });

  describe('getAll', function() {
    it('should find all record types', async function() {
      const brand = { id: 'brand1' };
      const expected = [{ name: 'type1' }];
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).RecordType.find.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.getAll(brand as any).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
    });
  });
  
  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = service.exports();
      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('create');
      expect(exported).to.have.property('get');
      expect(exported).to.have.property('getAll');
      expect(exported).to.have.property('getAllCache');
    });
  });
});
