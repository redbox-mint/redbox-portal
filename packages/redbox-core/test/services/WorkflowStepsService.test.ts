let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/WorkflowStepsService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';

describe('WorkflowStepsService', function() {
  let service: Services.WorkflowSteps;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.workflow = {
      'dataset': {
        'draft': {
          config: { form: 'form1' },
          starting: true,
          hidden: false
        }
      }
    };
    mockSails.config.appmode = { bootstrapAlways: false };
    
    setupServiceTestGlobals(mockSails);
    
    const mockDeferred = (result: unknown) => ({
      exec: sinon.stub().yields(null, result)
    });

    (global as any).WorkflowStep = {
      find: sinon.stub().returns(mockDeferred([])),
      create: sinon.stub().returns(mockDeferred({})),
      destroy: sinon.stub().returns(mockDeferred([])),
      findOne: sinon.stub().returns(mockDeferred({}))
    };
    
    service = new Services.WorkflowSteps();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).WorkflowStep;
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('should load existing workflow steps', async function() {
      const recordTypes = [{ name: 'dataset', id: 'rt1' }];
      const existingSteps = [{ name: 'draft' }];
      
      const findStub = sinon.stub().resolves(existingSteps);
      (global as any).WorkflowStep.find = findStub;
      
      const result = await service.bootstrap(recordTypes);
      
      expect(result).to.deep.equal(existingSteps);
    });

    it('should create steps from config if missing', async function() {
      const recordTypes = [{ name: 'dataset', id: 'rt1' }];
      
      const findStub = sinon.stub().resolves([]);
      (global as any).WorkflowStep.find = findStub;
      
      const createDeferred = (data: unknown) => ({
        exec: sinon.stub().yields(null, data)
      });
      (global as any).WorkflowStep.create.callsFake((data: unknown) => createDeferred(data));
      
      const result = await service.bootstrap(recordTypes);
      
      expect(result).to.have.length(1);
      expect((global as any).WorkflowStep.create.called).to.be.true;
    });
  });

  describe('create', function() {
    it('should create workflow step', async function() {
      const recordType = { id: 'rt1' };
      const config = { form: 'form1' };
      const expected = { name: 'draft' };
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkflowStep.create.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.create(recordType, 'draft', config, true, false).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkflowStep.create.calledWith(sinon.match({ 
        name: 'draft',
        recordType: 'rt1',
        starting: true
      }))).to.be.true;
    });
  });

  describe('get', function() {
    it('should find one step', async function() {
      const recordType = { id: 'rt1' };
      const expected = { name: 'draft' };
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkflowStep.findOne.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.get(recordType, 'draft').subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkflowStep.findOne.calledWith(sinon.match({ 
        recordType: 'rt1',
        name: 'draft'
      }))).to.be.true;
    });
  });

  describe('getAllForRecordType', function() {
    it('should find all steps for record type', async function() {
      const recordType = { id: 'rt1' };
      const expected = [{ name: 'draft' }];
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkflowStep.find.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.getAllForRecordType(recordType).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkflowStep.find.calledWith(sinon.match({ 
        recordType: 'rt1',
        hidden: { '!=': true }
      }))).to.be.true;
    });
  });

  describe('getFirst', function() {
    it('should find starting step', async function() {
      const recordType = { id: 'rt1' };
      const expected = { name: 'draft', starting: true };
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkflowStep.findOne.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.getFirst(recordType).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkflowStep.findOne.calledWith(sinon.match({ 
        recordType: 'rt1',
        starting: true
      }))).to.be.true;
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = service.exports();
      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('create');
      expect(exported).to.have.property('get');
      expect(exported).to.have.property('getFirst');
      expect(exported).to.have.property('getAllForRecordType');
    });
  });
});
